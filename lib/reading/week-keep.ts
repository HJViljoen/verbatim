import type { SupabaseClient } from '@supabase/supabase-js'

import { selectAll } from '../supabase-admin'
import {
  keepWeekPoints, WEEK_DEPTH_BANDS, WEEK_LINE_AGES, WEEK_LINE_EXCLUDED, WEEK_READER_UNKNOWN, weekAgeCutoff, weeksToKeep,
  type KeepCandidate, type WeekDepthBand, type WeekPointRow, type WeekRead, type WeekReadingRow, type WeekRun,
} from './week-line'
import { addDays, isoWeekOf, marketWeekRowOf, msOfInstant, type MarketWeekRow, type MarketWeekRowRaw } from './weeks'

// The keep store of the same-age weekly line (market-first decision M, part 2;
// WP3.13 part B: "one keep store shared by the script and deploy 4's
// comparability step").
//
// ONE COPY OF EACH HALF.
//   1. THE CAPTURE AT THE CUT (`captureWeekPoints`): which weeks reach their age
//      now, and each one read at its cutoff (MF4's `market_week_volumes` and
//      `market_week_readings`) into a kept read and its point rows
//      (`keepWeekPoints`). At most five reads: the runs, one volumes read per
//      cut (a week at 14 days and the week before it at 21 share their
//      Monday), the Pass A prompt version in force, and one readings read per
//      week kept.
//   2. THE INSERT-IF-ABSENT (`insertKeptWeeks`): a kept read and its points go
//      to `week_line_reads` / `week_line_points` once. A held key is never
//      written twice: the primary key refuses it and the insert is ON CONFLICT
//      DO NOTHING (which needs INSERT alone; the tables revoke UPDATE, DELETE
//      and TRUNCATE), and what was held is reported, never overwritten. The
//      capture's own `computed_at` and run ids are what is written.
// scripts/week-points.ts (`--keep`, `--apply`) and, from deploy 4, WP3.4's
// `comparability` step call these two and nothing else, so the script's paste
// and the run cannot keep a week two different ways.
//
// THE TWO CALLERS DIFFER IN ONE THING: WHEN.
//   - The script runs on the Monday after an update (`--keep`), from the
//     reviewed branch. It keeps every week whose age update is the LATEST
//     completed update (`weeksToKeep`): a week whose age update is no longer
//     the latest has moved on and is lost for good.
//   - The step runs INSIDE the update that brings a week to its age, after
//     that update's reading and before `freeze-months` (`update` below). What
//     it reads is what the script would read the next morning: every comment
//     that update captured is before the Monday cutoff, and the readings are
//     that update's. It records the update as a completed Sunday update
//     finishing when the step ran, because the step is near its end; an update
//     that fails after the step leaves a kept read that says otherwise, which
//     the next week's cadence check still catches (the pair's later windows).
//
// I/O THROUGH TWO SMALL INTERFACES (`WeekCaptureReader`, `KeepStore`), so the
// rules are tested on staging's real rows with no database, and the database
// glue is a thin adapter each (`supabaseCaptureReader`, `supabaseKeepStore`).

/** At most this many reads a capture (plan: the production read ration). */
export const WEEK_CAPTURE_READS_MAX = 5
export const TABLE_WEEK_LINE_READS = 'week_line_reads'
export const TABLE_WEEK_LINE_POINTS = 'week_line_points'
/** The primary keys, named where the writes happen. */
export const WEEK_LINE_READS_KEY = ['client_id', 'week', 'age_days', 'method_version'] as const
export const WEEK_LINE_POINTS_KEY = [
  'client_id', 'week', 'age_days', 'method_version', 'audience', 'object_kind', 'object_id', 'depth_band',
] as const
/** Point rows a write carries at most (PostgREST's body stays small). */
export const WEEK_POINTS_CHUNK = 500

const DAY_MS = 86_400_000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** MF4 is not applied where the capture or the insert ran: nothing kept. The
 *  script exits 3 on it; the step logs it and carries on (a no-op). */
export class WeekTablesMissing extends Error {
  readonly exitCode = 3
  constructor(what: string) {
    super(`${what} does not exist on this project: MF4 (supabase/migrations/20261005091000_market_first_weeks.sql) is not applied. Nothing kept.`)
    this.name = 'WeekTablesMissing'
  }
}

/** Is this PostgREST or Postgres error "that function or table does not exist"? */
export function isMissingWeekObject(error: { code?: string; message?: string } | null | undefined, name: string): boolean {
  if (!error) return false
  const code = error.code ?? ''
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42883' || code === '42P01') return true
  const m = error.message ?? ''
  return m.includes(name) && /does not exist|could not find|schema cache/i.test(m)
}

// ---- 1. The capture at the cut ------------------------------------------------------------------

/** What the capture reads. Each call is one read. */
export interface WeekCaptureReader {
  /** The tenant's `pipeline_runs`: id, status, started and finished. */
  runs(): Promise<WeekRun[]>
  /** `market_week_volumes` over [from, to) with comments first captured before the cut. */
  volumes(q: { from: string; to: string; capturedBefore: string }): Promise<MarketWeekRow[]>
  /** `market_week_readings` for one week at one age. */
  readings(q: { week: string; ageDays: 14 | 21 }): Promise<WeekReadingRow[]>
  /** The Pass A prompt version in force at an instant (`WEEK_READER_UNKNOWN` when none is found). */
  promptVersion(at: string | null): Promise<string>
}

export interface WeekCaptureInput {
  /** The clock: the script's run time, or the step's. */
  now: string
  firstWeek: string
  methodVersion: string
  /** The lane rule as the code holds it at capture (the Pass A comment floors). */
  laneRule: string
  ages?: readonly (14 | 21)[]
  /** Keys already kept (`${week}|${ageDays}`), skipped without a read. */
  held?: ReadonlySet<string>
  /** Inside a run (deploy 4's step): the update now running. It keeps the
   *  weeks this update brings to their age. Absent: the Monday script, which
   *  keeps the weeks the latest completed update brought to their age. */
  update?: { id: string; startedAt: string | null } | null
  /** The runs, when the caller already holds them: no read is spent on them. */
  runs?: readonly WeekRun[]
}

export interface WeekCapture {
  /** The update the kept weeks were read through: the latest completed one
   *  (the script) or the running one (the step). Null when there is none. */
  latestUpdate: { id: string; finishedAt: string | null } | null
  candidates: KeepCandidate[]
  reads: WeekRead[]
  rows: WeekPointRow[]
  /** The `market_week_volumes` rows each read was taken from, for the record. */
  volumes: MarketWeekRow[]
  readsUsed: number
  /** Why nothing was kept, when nothing was. */
  note: string | null
}

const isUpdate = (r: WeekRun): boolean => (r.status === 'completed' || r.status === 'partial') && !!r.finishedAt

/** The weeks an update brings to their age as it ends at `finishedAt`: every
 *  week from the first (the excluded week left out) whose cutoff is the next
 *  Monday 00:00 UTC after the update, at one of the ages, not held yet. */
export function weeksReachingAgeWith(input: {
  update: WeekRun & { finishedAt: string }
  firstWeek: string
  ages?: readonly (14 | 21)[]
  held?: ReadonlySet<string>
}): KeepCandidate[] {
  const doneMs = msOfInstant(input.update.finishedAt)
  if (Number.isNaN(doneMs)) throw new Error(`weeksReachingAgeWith: not an instant: ${input.update.finishedAt}`)
  const out: KeepCandidate[] = []
  const first = isoWeekOf(input.firstWeek)
  for (let week = first; msOfInstant(week) <= doneMs; week = addDays(week, 7)) {
    if (WEEK_LINE_EXCLUDED.includes(week)) continue
    for (const age of input.ages ?? WEEK_LINE_AGES) {
      const cutoff = weekAgeCutoff(week, age)
      const cutMs = msOfInstant(cutoff)
      if (!(doneMs < cutMs && doneMs >= cutMs - 7 * DAY_MS) || input.held?.has(`${week}|${age}`)) continue
      out.push({ week, ageDays: age, cutoff, ageRun: input.update })
    }
  }
  return out
}

/**
 * Keep every week that reaches its age now, each read at its cutoff. Reads, in
 * order: the runs (unless given), `market_week_volumes` once per cut,
 * the prompt version once, `market_week_readings` once per week kept. Refuses,
 * before the reads it would overspend, when the plan needs more than
 * `WEEK_CAPTURE_READS_MAX`. Nothing is written: the caller writes the file or
 * calls `insertKeptWeeks`.
 */
export async function captureWeekPoints(reader: WeekCaptureReader, input: WeekCaptureInput): Promise<WeekCapture> {
  const nowMs = msOfInstant(input.now)
  if (Number.isNaN(nowMs)) throw new Error(`captureWeekPoints: not an instant: ${input.now}`)
  let used = 0
  let runs: WeekRun[]
  if (input.runs) runs = [...input.runs]
  else {
    runs = await reader.runs()
    used++
  }

  let candidates: KeepCandidate[]
  let latestUpdate: WeekCapture['latestUpdate']
  let runsForCadence: WeekRun[]
  if (input.update) {
    const running: WeekRun & { finishedAt: string } = {
      id: input.update.id, status: 'completed', startedAt: input.update.startedAt, finishedAt: input.now,
    }
    runsForCadence = [...runs.filter((r) => r.id !== running.id), running]
    candidates = weeksReachingAgeWith({ update: running, firstWeek: input.firstWeek, ages: input.ages, held: input.held })
    latestUpdate = { id: running.id, finishedAt: running.finishedAt }
  } else {
    runsForCadence = runs
    const done = runs.filter((r) => isUpdate(r) && msOfInstant(r.finishedAt!) <= nowMs)
    const latest = done.reduce<WeekRun | null>((a, r) => (!a || msOfInstant(r.finishedAt!) > msOfInstant(a.finishedAt!) ? r : a), null)
    latestUpdate = latest ? { id: latest.id, finishedAt: latest.finishedAt } : null
    candidates = weeksToKeep({ runs, now: input.now, firstWeek: input.firstWeek, ages: input.ages, held: input.held })
  }

  const base = { latestUpdate, candidates, reads: [] as WeekRead[], rows: [] as WeekPointRow[], volumes: [] as MarketWeekRow[] }
  if (candidates.length === 0) {
    return { ...base, readsUsed: used, note: latestUpdate ? 'No week reached its age at the latest update.' : 'No update has finished yet.' }
  }

  const byCut = new Map<string, KeepCandidate[]>()
  for (const c of candidates) byCut.set(c.cutoff, [...(byCut.get(c.cutoff) ?? []), c])
  const planned = used + byCut.size + 1 + candidates.length
  if (planned > WEEK_CAPTURE_READS_MAX) {
    throw new Error(`captureWeekPoints: keeping ${candidates.length} weeks at ${byCut.size} cuts needs ${planned} reads, over the ${WEEK_CAPTURE_READS_MAX} a capture may spend. Nothing more read.`)
  }

  const volumesByCut = new Map<string, MarketWeekRow[]>()
  for (const [cutoff, group] of byCut) {
    const weeks = group.map((c) => c.week).sort()
    volumesByCut.set(cutoff, await reader.volumes({ from: weeks[0], to: addDays(weeks[weeks.length - 1], 7), capturedBefore: cutoff }))
    used++
  }
  const promptVersion = (await reader.promptVersion(candidates[0].ageRun.finishedAt)) || WEEK_READER_UNKNOWN
  used++

  for (const c of candidates) {
    const readings = await reader.readings({ week: c.week, ageDays: c.ageDays })
    used++
    const vols = (volumesByCut.get(c.cutoff) ?? []).filter((r) => isoWeekOf(r.week) === c.week)
    const { read, rows } = keepWeekPoints({
      candidate: c, runs: runsForCadence, volumes: vols, readings, promptVersion, laneRule: input.laneRule,
      methodVersion: input.methodVersion, computedAt: input.now,
    })
    base.reads.push(read)
    base.rows.push(...rows)
    base.volumes.push(...vols)
  }
  return { ...base, readsUsed: used, note: null }
}

/** The capture's reads on a Supabase project, for one tenant. */
export function supabaseCaptureReader(admin: SupabaseClient, clientId: string): WeekCaptureReader {
  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T[]> => {
    const { data, error } = await admin.rpc(fn, args)
    if (error) {
      if (isMissingWeekObject(error, fn)) throw new WeekTablesMissing(fn)
      throw new Error(`${fn}: ${error.message}`)
    }
    return (data ?? []) as T[]
  }
  return {
    async runs() {
      const rows = await selectAll<{ id: string; status: string; started_at: string | null; completed_at: string | null }>(() =>
        admin.from('pipeline_runs').select('id, status, started_at, completed_at').eq('client_id', clientId).order('started_at').order('id'))
      return rows.map((r) => ({ id: r.id, status: r.status, startedAt: r.started_at, finishedAt: r.completed_at }))
    },
    async volumes(q) {
      const raw = await rpc<MarketWeekRowRaw>('market_week_volumes', { p_client: clientId, p_from: q.from, p_to: q.to, p_captured_before: q.capturedBefore })
      return raw.map(marketWeekRowOf)
    },
    async readings(q) {
      return rpc<WeekReadingRow>('market_week_readings', { p_client: clientId, p_week: q.week, p_age_days: q.ageDays })
    },
    async promptVersion(at) {
      let query = admin.from('ai_call_log').select('prompt_version, created_at').eq('client_id', clientId).eq('pass', 'pass_a')
      if (at) query = query.lte('created_at', at)
      const { data, error } = await query.order('created_at', { ascending: false }).limit(1)
      if (error) throw new Error(`ai_call_log: ${error.message}`)
      // None found: recorded as unknown, which refuses every pair on 'reader' (weekPairOf).
      return (data?.[0] as { prompt_version?: string } | undefined)?.prompt_version || WEEK_READER_UNKNOWN
    },
  }
}

// ---- The stored rows, both ways -------------------------------------------------------------------

/** `week_line_reads.conditions`: the plan's fields (§4.2, MF4's comment) and
 *  the four optional ones `WeekRead` adds. A number that is not finite is
 *  stored as null and read back as NaN, which refuses every pair it is in. */
export interface WeekLineConditions {
  runs_in_week: number
  runs_after: [number, number]
  late_run: boolean
  videos: number
  mean_dated: number | null
  median_dated: number | null
  bands: [number, number, number]
  unchecked: number
  older_videos: number
  prompt_version: string
  lane_rule: string
  rescrape_capped: boolean | null
  off_cadence?: number
  read_through_at?: string | null
  comments?: number
  unchecked_left_out?: number
}

/** One `week_line_reads` row as written (and as PostgREST returns it). */
export interface WeekLineReadRow {
  client_id: string
  week: string
  age_days: 14 | 21
  captured_before: string
  read_through_run: string | null
  conditions: WeekLineConditions
  method_version: string
  computed_at: string
}

/** One `week_line_points` row. */
export interface WeekLinePointRow {
  client_id: string
  week: string
  age_days: 14 | 21
  method_version: string
  audience: string
  object_kind: 'kind' | 'subject'
  object_id: string
  depth_band: WeekDepthBand
  k: number
  n: number
}

const finiteOrNull = (x: number): number | null => (Number.isFinite(x) ? x : null)
const nanOfNull = (x: unknown): number => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : Number.NaN)

/** A kept read as its `week_line_reads` row. */
export function readRowOf(clientId: string, r: WeekRead): WeekLineReadRow {
  const conditions: WeekLineConditions = {
    runs_in_week: r.runsInWeek,
    runs_after: [r.runsAfter[0], r.runsAfter[1]],
    late_run: r.lateRun,
    videos: r.videos,
    mean_dated: finiteOrNull(r.meanDated),
    median_dated: finiteOrNull(r.medianDated),
    bands: [r.bands[0], r.bands[1], r.bands[2]],
    unchecked: r.unchecked,
    older_videos: r.olderVideos,
    prompt_version: r.promptVersion,
    lane_rule: r.laneRule,
    rescrape_capped: r.rescrapeCapped,
    ...(r.offCadence != null ? { off_cadence: r.offCadence } : {}),
    ...(r.readThroughAt !== undefined ? { read_through_at: r.readThroughAt } : {}),
    ...(r.comments != null ? { comments: r.comments } : {}),
    ...(r.uncheckedLeftOut != null ? { unchecked_left_out: r.uncheckedLeftOut } : {}),
  }
  return {
    client_id: clientId,
    week: isoWeekOf(r.week),
    age_days: r.ageDays,
    captured_before: r.capturedBefore,
    read_through_run: r.readThroughRun || null,
    conditions,
    method_version: r.methodVersion,
    computed_at: r.computedAt,
  }
}

/** A point row as its `week_line_points` row. */
export function pointRowOf(clientId: string, p: WeekPointRow): WeekLinePointRow {
  return {
    client_id: clientId, week: isoWeekOf(p.week), age_days: p.ageDays, method_version: p.methodVersion, audience: p.audience,
    object_kind: p.objectKind, object_id: p.objectId, depth_band: p.depthBand, k: p.k, n: p.n,
  }
}

/** A `week_line_reads` row (as PostgREST returns it) back into a kept read.
 *  Nothing is coerced to zero: a missing figure reads NaN and refuses. */
export function readOfStored(row: {
  week: string; age_days: number | string; captured_before: string; read_through_run: string | null
  conditions: Partial<WeekLineConditions> | null; method_version: string; computed_at: string
}): WeekRead {
  const c: Partial<WeekLineConditions> = row.conditions ?? {}
  const age = Number(row.age_days)
  const pair = (v: unknown): readonly [number, number] => (Array.isArray(v) && v.length === 2 ? [nanOfNull(v[0]), nanOfNull(v[1])] : [Number.NaN, Number.NaN])
  const bands = Array.isArray(c.bands) && c.bands.length === 3
    ? [nanOfNull(c.bands[0]), nanOfNull(c.bands[1]), nanOfNull(c.bands[2])] as const
    : [Number.NaN, Number.NaN, Number.NaN] as const
  return {
    week: isoWeekOf(String(row.week)),
    ageDays: age === 21 ? 21 : 14,
    capturedBefore: row.captured_before,
    readThroughRun: row.read_through_run ?? '',
    runsInWeek: nanOfNull(c.runs_in_week),
    runsAfter: pair(c.runs_after),
    lateRun: c.late_run === true,
    videos: nanOfNull(c.videos),
    meanDated: nanOfNull(c.mean_dated),
    medianDated: nanOfNull(c.median_dated),
    bands,
    unchecked: nanOfNull(c.unchecked),
    olderVideos: nanOfNull(c.older_videos),
    promptVersion: typeof c.prompt_version === 'string' ? c.prompt_version : '',
    laneRule: typeof c.lane_rule === 'string' ? c.lane_rule : '',
    rescrapeCapped: typeof c.rescrape_capped === 'boolean' ? c.rescrape_capped : null,
    methodVersion: row.method_version,
    computedAt: row.computed_at,
    ...(c.off_cadence != null ? { offCadence: nanOfNull(c.off_cadence) } : {}),
    ...(c.read_through_at !== undefined ? { readThroughAt: c.read_through_at } : {}),
    ...(c.comments != null ? { comments: nanOfNull(c.comments) } : {}),
    ...(c.unchecked_left_out != null ? { uncheckedLeftOut: nanOfNull(c.unchecked_left_out) } : {}),
  }
}

/** A `week_line_points` row back into a point row. */
export function pointOfStored(row: {
  week: string; age_days: number | string; method_version: string; audience: string; object_kind: string
  object_id: string; depth_band: string; k: number | string; n: number | string
}): WeekPointRow {
  return {
    week: isoWeekOf(String(row.week)), ageDays: Number(row.age_days) === 21 ? 21 : 14, methodVersion: row.method_version,
    audience: row.audience, objectKind: row.object_kind === 'subject' ? 'subject' : 'kind', objectId: row.object_id,
    depthBand: row.depth_band as WeekDepthBand, k: nanOfNull(row.k), n: nanOfNull(row.n),
  }
}

// ---- 2. The insert-if-absent ------------------------------------------------------------------------

/** Where the kept rows go. */
export interface KeepStore {
  /** INSERT … ON CONFLICT (conflict) DO NOTHING RETURNING (returning): the rows it inserted, none that it found held. */
  insertIfAbsent(table: string, rows: readonly object[], conflict: readonly string[], returning: readonly string[]): Promise<Record<string, unknown>[]>
  /** The held reads among these keys (one read). */
  heldReads(clientId: string, keys: readonly { week: string; ageDays: number; methodVersion: string }[]): Promise<{
    week: string; age_days: number | string; method_version: string; computed_at: string; read_through_run: string | null
  }[]>
}

export interface KeptKey { week: string; ageDays: 14 | 21; methodVersion: string; computedAt: string }

export interface KeepReport {
  /** Reads written now, with their points. */
  inserted: KeptKey[]
  /** Reads already held from this same capture (its computed_at and run): an
   *  interrupted write is completed with any point it lacks, and nothing held
   *  is rewritten. A second write of one file lands here with no point written. */
  completed: KeptKey[]
  /** Reads held from ANOTHER capture of the same key: left alone, with their points. */
  held: (KeptKey & { heldComputedAt: string })[]
  points: { offered: number; inserted: number }
}

const keyOf = (week: string, ageDays: number, methodVersion: string): string => `${isoWeekOf(week)}|${ageDays}|${methodVersion}`

/** What is wrong with a capture before anything of it is written, as sentences
 *  (none: it may be written). A kept point is never rewritten, so nothing
 *  malformed is let in. */
export function keptProblems(reads: readonly WeekRead[], rows: readonly WeekPointRow[]): string[] {
  const bad: string[] = []
  const keys = new Set<string>()
  const isCount = (x: number): boolean => Number.isInteger(x) && x >= 0
  for (const r of reads) {
    const at = `the read of the week of ${r.week} at ${r.ageDays} days`
    if (Number.isNaN(msOfInstant(r.week)) || isoWeekOf(r.week) !== r.week) bad.push(`${at}: the week is not a Monday`)
    if (r.ageDays !== 14 && r.ageDays !== 21) bad.push(`${at}: the age is not 14 or 21 days`)
    if (!r.methodVersion) bad.push(`${at}: no method version`)
    if (Number.isNaN(msOfInstant(r.computedAt))) bad.push(`${at}: computed_at is not an instant`)
    if (Number.isNaN(msOfInstant(r.capturedBefore))) bad.push(`${at}: captured_before is not an instant`)
    if (r.readThroughRun && !UUID_RE.test(r.readThroughRun)) bad.push(`${at}: ${r.readThroughRun} is not a run id`)
    if (!isCount(r.videos) || !isCount(r.unchecked) || !isCount(r.olderVideos) || !r.bands.every(isCount)) bad.push(`${at}: a count is not a count`)
    const key = keyOf(r.week, r.ageDays, r.methodVersion)
    if (keys.has(key)) bad.push(`${at}: held twice in one capture`)
    keys.add(key)
  }
  const seen = new Set<string>()
  for (const p of rows) {
    const at = `the point ${p.objectKind} ${p.objectId} (${p.audience}, ${p.depthBand}) of the week of ${p.week} at ${p.ageDays} days`
    if (!keys.has(keyOf(p.week, p.ageDays, p.methodVersion))) bad.push(`${at}: no read of its week in this capture`)
    if (!isCount(p.k) || !isCount(p.n) || p.k > p.n) bad.push(`${at}: k ${p.k} of n ${p.n} is not a count`)
    if (!(WEEK_DEPTH_BANDS as readonly string[]).includes(p.depthBand)) bad.push(`${at}: unknown depth band`)
    if (p.objectKind !== 'kind' && p.objectKind !== 'subject') bad.push(`${at}: unknown object kind`)
    const pk = `${keyOf(p.week, p.ageDays, p.methodVersion)}|${p.audience}|${p.objectKind}|${p.objectId}|${p.depthBand}`
    if (seen.has(pk)) bad.push(`${at}: held twice in one capture`)
    seen.add(pk)
  }
  return bad
}

/**
 * Write one capture's reads and points if absent. Order: every read (ON
 * CONFLICT DO NOTHING); for the reads found held, one read of their
 * computed_at and run, so a held read from this same capture is completed
 * with any point it lacks (an interrupted write) and one from another capture
 * is left alone with its points; then the points of the reads written or
 * completed, in chunks, each ON CONFLICT DO NOTHING. Nothing is ever updated or
 * deleted. Throws, before any write, on a malformed capture.
 */
export async function insertKeptWeeks(store: KeepStore, input: {
  clientId: string
  reads: readonly WeekRead[]
  rows: readonly WeekPointRow[]
}): Promise<KeepReport> {
  const problems = keptProblems(input.reads, input.rows)
  if (problems.length) throw new Error(`insertKeptWeeks: nothing written. ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? `; and ${problems.length - 5} more` : ''}.`)
  const report: KeepReport = { inserted: [], completed: [], held: [], points: { offered: 0, inserted: 0 } }
  if (input.reads.length === 0) return report

  const reads = [...input.reads].sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : a.ageDays - b.ageDays))
  const kk = (r: WeekRead): KeptKey => ({ week: isoWeekOf(r.week), ageDays: r.ageDays, methodVersion: r.methodVersion, computedAt: r.computedAt })
  const written = await store.insertIfAbsent(TABLE_WEEK_LINE_READS, reads.map((r) => readRowOf(input.clientId, r)), WEEK_LINE_READS_KEY, WEEK_LINE_READS_KEY)
  const writtenKeys = new Set(written.map((w) => keyOf(String(w.week), Number(w.age_days), String(w.method_version))))
  const open = new Set<string>()
  const notWritten: WeekRead[] = []
  for (const r of reads) {
    if (writtenKeys.has(keyOf(r.week, r.ageDays, r.methodVersion))) {
      report.inserted.push(kk(r))
      open.add(keyOf(r.week, r.ageDays, r.methodVersion))
    } else notWritten.push(r)
  }
  if (notWritten.length) {
    const held = await store.heldReads(input.clientId, notWritten.map((r) => ({ week: isoWeekOf(r.week), ageDays: r.ageDays, methodVersion: r.methodVersion })))
    const byKey = new Map(held.map((h) => [keyOf(String(h.week), Number(h.age_days), h.method_version), h]))
    for (const r of notWritten) {
      const key = keyOf(r.week, r.ageDays, r.methodVersion)
      const h = byKey.get(key)
      if (!h) throw new Error(`insertKeptWeeks: the read of the week of ${r.week} at ${r.ageDays} days was neither written nor found held. Stopped before its points.`)
      const sameCapture = msOfInstant(h.computed_at) === msOfInstant(r.computedAt) && (h.read_through_run ?? '') === (r.readThroughRun || '')
      if (sameCapture) {
        report.completed.push(kk(r))
        open.add(key)
      } else report.held.push({ ...kk(r), heldComputedAt: h.computed_at })
    }
  }

  const points = input.rows.filter((p) => open.has(keyOf(p.week, p.ageDays, p.methodVersion))).map((p) => pointRowOf(input.clientId, p))
  report.points.offered = points.length
  for (let i = 0; i < points.length; i += WEEK_POINTS_CHUNK) {
    const got = await store.insertIfAbsent(TABLE_WEEK_LINE_POINTS, points.slice(i, i + WEEK_POINTS_CHUNK), WEEK_LINE_POINTS_KEY, ['week'])
    report.points.inserted += got.length
  }
  return report
}

const dayWords = (week: string): string => {
  const d = new Date(msOfInstant(week))
  return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`
}

/** The report, as the lines the script prints. */
export function keepReportLines(r: KeepReport): string[] {
  const name = (k: KeptKey): string => `the week of ${dayWords(k.week)} at ${k.ageDays} days (${k.methodVersion}, computed ${k.computedAt})`
  const lines: string[] = []
  const nothing = r.inserted.length === 0 && r.points.inserted === 0
  lines.push(nothing
    ? `nothing inserted: ${r.completed.length + r.held.length} read(s) already held${r.completed.length ? `, and the ${r.points.offered} point row(s) of this capture with them` : ''}`
    : `inserted ${r.inserted.length} read(s) and ${r.points.inserted} point row(s)${r.completed.length + r.held.length ? `; ${r.completed.length + r.held.length} read(s) already held` : ''}`)
  for (const k of r.inserted) lines.push(`  kept    ${name(k)}`)
  for (const k of r.completed) lines.push(`  held    ${name(k)}: already held from this capture`)
  for (const k of r.held) lines.push(`  held    ${name(k)}: already held from another capture (computed ${k.heldComputedAt}), left alone`)
  return lines
}

/** The store on a Supabase project (PostgREST: `upsert` with
 *  `ignoreDuplicates`, which is INSERT … ON CONFLICT DO NOTHING, and a select
 *  of the rows it inserted). */
export function supabaseKeepStore(admin: SupabaseClient): KeepStore {
  return {
    async insertIfAbsent(table, rows, conflict, returning) {
      if (rows.length === 0) return []
      const { data, error } = await admin.from(table)
        .upsert(rows as Record<string, unknown>[], { onConflict: conflict.join(','), ignoreDuplicates: true })
        .select(returning.join(', '))
      if (error) {
        if (isMissingWeekObject(error, table)) throw new WeekTablesMissing(table)
        throw new Error(`${table}: ${error.message}`)
      }
      return (data ?? []) as unknown as Record<string, unknown>[]
    },
    async heldReads(clientId, keys) {
      if (keys.length === 0) return []
      const weeks = [...new Set(keys.map((k) => k.week))]
      const { data, error } = await admin.from(TABLE_WEEK_LINE_READS)
        .select('week, age_days, method_version, computed_at, read_through_run')
        .eq('client_id', clientId).in('week', weeks)
      if (error) {
        if (isMissingWeekObject(error, TABLE_WEEK_LINE_READS)) throw new WeekTablesMissing(TABLE_WEEK_LINE_READS)
        throw new Error(`${TABLE_WEEK_LINE_READS}: ${error.message}`)
      }
      const wanted = new Set(keys.map((k) => keyOf(k.week, k.ageDays, k.methodVersion)))
      return ((data ?? []) as { week: string; age_days: number; method_version: string; computed_at: string; read_through_run: string | null }[])
        .filter((h) => wanted.has(keyOf(String(h.week), Number(h.age_days), h.method_version)))
    },
  }
}
