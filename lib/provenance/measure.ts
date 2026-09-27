import type { ConfigChange } from '../config-log'
import { KIND_LABELS } from '../reading/kinds'
import { changeInSpan, changesFromLog, isSearchSurface, type OurChange } from '../reading/comparability'
import { monthEndInstant } from '../reading/monthly'
import { laterMonthOf, type UpdateRun } from '../reading/pairs'
import {
  populationSet, recheckRows, RECHECK_POPULATIONS, sameCheck, themesToCheck,
  type CheckObject, type CheckRow, type LensRow, type PopulationSet, type PopulationVideo, type RecheckPopulation,
} from '../reading/recheck'
import { subjectCalibration } from '../subjects/calibration-state'
import { evidenceMap, type RunReadRow, type StoredProvenance, type VerdictRow, type VideoRow } from './load'
import type { ProvenanceSnapshot } from './reconstruct'
import {
  addedOnlyOf, decidingGathers, firstSearched, gatherHealth, gathersOf, isOutside, median, monthShareWord,
  oneReachRowEach, populations, sameJson, searchesFirstRunIn, unchangedSearches,
  type GatherRun, type KeywordRow, type MonthVideo, type ReachRowPlan,
} from './searches'

// ONE COPY of the change measures (market-first decision D; plan WP3.4): the
// month-pair row and each change's reach (measure-comparability, WP1.4) and
// the re-check populations (comparability-checks, WP2.3), shared by the two
// scripts Heinrich pastes and the pipeline's `comparability` step (deploy 4),
// so the run and a paste can never measure one pair two ways.
//
// Everything here is computation over what a caller has read. The reads sit
// behind a small I/O interface (`PairIO`, `ChecksIO`) that each caller fills
// its own way: the scripts count pages against their ration and take local
// files on a staging dry run; the step reads with the admin client inside its
// own time limit. The printed lines are the scripts' own, word for word, so a
// paste and the step's log say the same thing.
//
// THE RUN IN FLIGHT. Inside the pipeline the run that is measuring is not an
// update yet (it has no completed_at until close-run). `inFlight` counts it as
// the latest update, finishing now, so the row it writes is read through the
// run that wrote it, and the page judge (lib/reading/pairs.ts laterMonthOf)
// finds it current as soon as the run completes. A run that then fails is not
// an update, and its rows read as unmeasured, which is the honest answer.

export const PAIR_METHOD_VERSION = 'mf1_v1'
export const CODE_REACH_METHOD = 'code_change_v1'
export type ReachPopulation = 'market' | 'category'

const monthStart = (m: string): string => `${m.slice(0, 7)}-01`
function nextMonthStart(m: string): string {
  const d = new Date(`${monthStart(m)}T00:00:00Z`)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
}
const iso = (day: string): string => `${day}T00:00:00.000Z`
const ms = (s: string): number => Date.parse(s)

/** What both measures are read from. */
export interface MeasureInput {
  clientId: string
  now: string
  changes: readonly ConfigChange[]
  videos: readonly VideoRow[]
  verdicts: readonly VerdictRow[]
  keywordRows: readonly KeywordRow[]
  runs: readonly RunReadRow[]
  provenance: ReadonlyMap<string, StoredProvenance> | null
  snapshots?: readonly ProvenanceSnapshot[]
  /** The pipeline's own run, counted as an update finishing `now`. */
  inFlight?: { runId: string } | null
}

export interface MeasureContext {
  clientId: string
  now: string
  changes: readonly ConfigChange[]
  /** Our changes (changesFromLog); a dry run may push stand-ins. */
  ours: OurChange[]
  gathers: GatherRun[]
  /** Completed or partial runs by completed_at (the judge's updates), plus the run in flight. */
  updates: UpdateRun[]
  evidence: Map<string, Set<string>>
  provenance: ReadonlyMap<string, StoredProvenance> | null
  firstSeen: Map<string, string>
  unjudgedIds: Set<string>
  firstTermDate: Map<string, string>
  /** video id → `platform\0video_id`, the comments' join. */
  videoKeys: Map<string, string>
}

export function measureContext(input: MeasureInput): MeasureContext {
  const { videos, verdicts, provenance } = input
  const updates: UpdateRun[] = input.runs
    .filter((r) => (r.status === 'completed' || r.status === 'partial') && r.completed_at && r.id !== input.inFlight?.runId)
    .map((r) => ({ id: r.id, finishedAt: r.completed_at as string }))
  if (input.inFlight) updates.push({ id: input.inFlight.runId, finishedAt: input.now })
  const gathers = gathersOf(input.keywordRows, input.runs)
  const admittedUnjudged = new Set(verdicts.filter((v) => v.kept && v.source === 'default').map((v) => `${v.platform}\u0000${v.video_id}`))
  return {
    clientId: input.clientId,
    now: input.now,
    changes: input.changes,
    ours: changesFromLog(input.changes),
    gathers,
    updates,
    evidence: evidenceMap({ videos, provenance, snapshots: input.snapshots ?? [], verdicts }),
    provenance,
    firstSeen: new Map(videos.map((v) => [v.id, v.first_seen])),
    unjudgedIds: new Set(videos.filter((v) => admittedUnjudged.has(`${v.platform}\u0000${v.video_id}`)).map((v) => v.id)),
    firstTermDate: firstSearched(gathers),
    videoKeys: new Map(videos.map((v) => [v.id, `${v.platform}\u0000${v.video_id}`])),
  }
}

/** A capped update: every row of the change is log-tracking-eras' `other`
 *  row with field 'gather_capped' (lib/reading/gather-flags.ts). Run health,
 *  never a change of ours; nothing is stored for it. */
export function isGatherFlagOf(ctx: Pick<MeasureContext, 'changes'>, c: OurChange): boolean {
  if (c.surface !== 'other') return false
  const ids = new Set(c.rowIds && c.rowIds.length > 0 ? c.rowIds : [c.id])
  const mine = ctx.changes.filter((r) => ids.has(r.id))
  return mine.length > 0 && mine.every((r) => r.surface === 'other' && r.field === 'gather_capped')
}

/** The later month's latest update, found exactly as the judge finds it
 *  (laterMonthOf), and the last gather that update read. `refused` when no
 *  update has read the later month yet (no gather on or after its first day). */
export function pairRead(ctx: Pick<MeasureContext, 'now' | 'updates' | 'gathers'>, month: string): {
  update: UpdateRun | null
  lastGather: GatherRun | null
  refused: boolean
  later: ReturnType<typeof laterMonthOf>
} {
  const later = laterMonthOf(month, ctx.now, ctx.updates)
  const update = later.latestUpdateRunId ? ctx.updates.find((u) => u.id === later.latestUpdateRunId) ?? null : null
  const lastGather = update ? ctx.gathers.filter((g) => g.at <= update.finishedAt).at(-1) ?? null : null
  const refused = !update || !lastGather || !ctx.gathers.some((g) => g.at >= iso(month) && g.at <= update.finishedAt)
  return { update, lastGather, refused, later }
}

/** The reads a pair measure makes, each once per month. */
export interface PairIO {
  /** market_month_videos, or null when MF1 is not there and nothing stands in. */
  monthVideos(month: string): Promise<MonthVideo[] | null>
  /** The comments dated in the month (for the late-capture figure). */
  monthComments(month: string): Promise<{ platform: string; video_id: string; created_at: string }[]>
}

export interface CodeEntry {
  change_id: string
  surface: string
  population: ReachPopulation
  prev: { k: number; n: number }
  curr: { k: number; n: number }
}

/** A month_pair_comparability row as it is inserted (computed_at by the database). */
export interface PairInsert {
  client_id: string
  prev_month: string
  month: string
  search_outside_prev: number
  videos_prev: number
  search_outside_curr: number
  videos_curr: number
  code_changes: CodeEntry[]
  depth_prev_median: number | null
  depth_curr_median: number | null
  gather: { month: string; runs: number; partial: number; searches_short: number }[]
  late_capture: { month: string; comments: number; of: number }
  read_through_run: string
  method_version: string
  added_only_curr: number | null
  market_videos_curr: number | null
}

export interface PairMeasure {
  prevMonth: string
  month: string
  /** null when the pair was refused (no update has read the later month). */
  row: PairInsert | null
  planned: ReachRowPlan[]
  lines: string[]
}

/** Measure the pairs, in order: the pair row, the planned reach rows and the
 *  lines the script prints. A month's videos are read once for every pair
 *  that shares it. */
export async function measurePairs(
  ctx: MeasureContext,
  io: PairIO,
  pairs: readonly (readonly [string, string])[],
): Promise<PairMeasure[]> {
  const monthSets = new Map<string, MonthVideo[]>()
  const monthSet = async (m: string): Promise<MonthVideo[]> => {
    const held = monthSets.get(m)
    if (held) return held
    const set = await io.monthVideos(m)
    if (set == null) throw new Error('market_month_videos is not there (MF1 not applied) and no --export was given.')
    monthSets.set(m, set)
    return set
  }
  const out: PairMeasure[] = []
  for (const [prev, month] of pairs) {
    const lines: string[] = []
    const { update, lastGather, refused } = pairRead(ctx, month)
    lines.push(`\n(${prev.slice(0, 7)}, ${month.slice(0, 7)}), read through the update ${update?.id ?? '(none)'}${update ? ` of ${update.finishedAt}` : ''}; last gather ${lastGather?.runId ?? '(none)'}`)
    if (refused || !update || !lastGather) {
      lines.push(`  REFUSED: no update has read ${month.slice(0, 7)} yet (no gather on or after its first day); no row`)
      out.push({ prevMonth: prev, month, row: null, planned: [], lines })
      continue
    }
    const sets = { prev: populations(await monthSet(prev)), curr: populations(await monthSet(month)) }
    const prevComments = await io.monthComments(prev)
    const m = measurePair(ctx, { prev, month, update, lastGather, sets, prevComments })
    out.push({ prevMonth: prev, month, row: m.row, planned: m.planned, lines: [...lines, ...m.lines] })
  }
  return out
}

/** One pair, from its month sets. PURE. */
export function measurePair(ctx: MeasureContext, a: {
  prev: string
  month: string
  update: UpdateRun
  lastGather: GatherRun
  sets: { prev: { market: MonthVideo[]; category: MonthVideo[] }; curr: { market: MonthVideo[]; category: MonthVideo[] } }
  prevComments: readonly { platform: string; video_id: string; created_at: string }[]
}): { row: PairInsert; planned: ReachRowPlan[]; lines: string[] } {
  const { prev, month, update, lastGather, sets } = a
  const { evidence, provenance, ours } = ctx
  const lines: string[] = []
  const planned: ReachRowPlan[] = []
  const unchanged = unchangedSearches(ctx.gathers, iso(prev), lastGather.runId)
  const outside = (vs: readonly MonthVideo[]) => vs.filter((v) => isOutside(v, evidence.get(v.id), unchanged))
  const side = (which: 'prev' | 'curr', pop: ReachPopulation) => {
    const vs = sets[which][pop]
    return { k: outside(vs).length, n: vs.length }
  }
  const searchOutside = { prev: side('prev', 'category'), curr: side('curr', 'category') }
  const marketOutside = { prev: side('prev', 'market'), curr: side('curr', 'market') }
  lines.push(`  searches unchanged through both months: ${[...new Set([...unchanged].map((k) => k.split('\u0000')[1]))].sort().join(', ') || '(none)'}`)
  // A gather that fell short (a cap, an outage) does not decide what ran
  // unchanged; it is named here so a short run is read beside the figure.
  const { left } = decidingGathers(ctx.gathers, iso(prev), lastGather.runId)
  if (left.length > 0) {
    lines.push(`  gathers that fell short, left out of that test (gather health counts them): ${left.map((g) => `${g.runId.slice(0, 8)} ${g.at.slice(0, 10)} ${g.status}`).join(', ')}`)
  }
  lines.push(`  outside, category: ${prev.slice(0, 7)} ${searchOutside.prev.k} of ${searchOutside.prev.n} · ${month.slice(0, 7)} ${searchOutside.curr.k} of ${searchOutside.curr.n}`)
  lines.push(`  outside, market:   ${prev.slice(0, 7)} ${marketOutside.prev.k} of ${marketOutside.prev.n} · ${month.slice(0, 7)} ${marketOutside.curr.k} of ${marketOutside.curr.n}`)
  // The breakdown the research states its figures in: outside videos found
  // only by terms first searched on or after each of our search changes in
  // the span, and those whose first-found terms were overwritten.
  const searchChanges = ours.filter((c) => isSearchSurface(c.surface) && changeInSpan(c, prev, month))
  for (const which of ['prev', 'curr'] as const) {
    const out = outside(sets[which].category)
    const parts = [...new Set(searchChanges.map((c) => c.changedAt.slice(0, 10)))].sort().map((day) => {
      const only = out.filter((v) => {
        const e = [...(evidence.get(v.id) ?? [])]
        return e.length > 0 && e.every((t) => (ctx.firstTermDate.get(t) ?? '') >= iso(day))
      }).length
      return `only terms first searched from ${day}: ${only}`
    })
    const ambiguous = out.filter((v) => provenance?.get(v.id)?.method === 'ambiguous').length
    lines.push(`    ${which === 'prev' ? prev.slice(0, 7) : month.slice(0, 7)} category outside ${out.length}: ${[...parts, `first terms overwritten (ambiguous): ${ambiguous}`].join(' · ')}`)
  }

  // The changes of ours that are not search changes, each measured or named.
  const codeChanges: CodeEntry[] = []
  for (const c of ours.filter((x) => !isSearchSurface(x.surface) && changeInSpan(x, prev, month))) {
    const touchedBy = c.surface === 'gate_rule'
      ? (v: MonthVideo) => ctx.unjudgedIds.has(v.id)
      : c.surface === 'attribution'
        ? (v: MonthVideo) => (ctx.firstSeen.get(v.id) ?? '') >= c.changedAt
        : null
    if (!touchedBy) {
      lines.push(isGatherFlagOf(ctx, c)
        ? `  change ${c.id} · ${c.changedAt.slice(0, 16)} · a capped update: run health, not a change of ours (decision D rule 6, R-c); it flags the pair and never refuses it (the judge from deploy 2; deploy 1's still counts it as a tenth), and there is nothing to measure`
        : c.affects.length === 0
          ? `  change ${c.id} · ${c.changedAt.slice(0, 16)} · ${c.surface}: moves no view the judge reads, so it refuses nothing; nothing to measure`
          : `  change ${c.id} · ${c.changedAt.slice(0, 16)} · ${c.surface}: not measured here (the judge counts it as a tenth on ${c.affects.join(', ')}: refused)`)
      continue
    }
    for (const pop of ['market', 'category'] as const) {
      const e: CodeEntry = {
        change_id: c.id, surface: c.surface, population: pop,
        prev: { k: sets.prev[pop].filter(touchedBy).length, n: sets.prev[pop].length },
        curr: { k: sets.curr[pop].filter(touchedBy).length, n: sets.curr[pop].length },
      }
      codeChanges.push(e)
      planned.push({ change_id: c.id, month: prev, population: pop, videos_touched: e.prev.k, videos_in_month: e.prev.n, read_through_run: update.id })
      planned.push({ change_id: c.id, month, population: pop, videos_touched: e.curr.k, videos_in_month: e.curr.n, read_through_run: update.id })
    }
    const [mk, cat] = codeChanges.slice(-2)
    lines.push(`  change ${c.id} · ${c.changedAt.slice(0, 16)} · ${c.surface}: ${month.slice(0, 7)} ${mk.curr.k} of ${mk.curr.n} market, ${cat.curr.k} of ${cat.curr.n} category · ${prev.slice(0, 7)} ${mk.prev.k} of ${mk.prev.n} market, ${cat.prev.k} of ${cat.prev.n} category`)
  }

  // WP1.8's one figure, over the later month's market; the category's is a check only.
  const addedIn = searchesFirstRunIn(ctx.firstTermDate, month)
  const methodOf = (id: string) => provenance?.get(id)?.method ?? null
  const addedOnly = provenance != null && provenance.size > 0
    ? { market: addedOnlyOf(sets.curr.market, evidence, addedIn, methodOf), category: addedOnlyOf(sets.curr.category, evidence, addedIn, methodOf) }
    : null
  lines.push(`  searches first run in ${month.slice(0, 7)}: ${[...addedIn].sort().join(', ') || '(none)'}`)
  lines.push(addedOnly
    ? `  added only (found only by those searches), market: ${month.slice(0, 7)} ${addedOnly.market.k} of ${addedOnly.market.n} (${monthShareWord(addedOnly.market.k, addedOnly.market.n) ?? '-'}) · category ${addedOnly.category.k} of ${addedOnly.category.n} (a check, never stored or printed)`
    : '  added only: not measured (no video_provenance row is held: run reconstruct-provenance first, or pass --provenance)')

  const depth = { prev: median(sets.prev.market.map((v) => v.dated)), curr: median(sets.curr.market.map((v) => v.dated)) }
  const health = [gatherHealth(ctx.gathers, prev), gatherHealth(ctx.gathers, month)]
  const late = lateCaptureOf(prev, sets.prev.category.map((v) => v.id), ctx.videoKeys, a.prevComments)
  lines.push(`  depth (median dated comments a market video): ${prev.slice(0, 7)} ${depth.prev ?? '-'} · ${month.slice(0, 7)} ${depth.curr ?? '-'}`)
  lines.push(`  gathers: ${health.map((h) => `${h.month.slice(0, 7)} ${h.runs} run, ${h.partial} partial or failed, ${h.searches_short} searches short${h.unplanned ? ` (${h.unplanned} without a plan to check)` : ''}`).join(' · ')}`)
  lines.push(`  late capture: ${late.comments} of ${prev.slice(0, 7)}'s ${late.of} category comments were first captured after it ended`)

  return {
    row: {
      client_id: ctx.clientId, prev_month: prev, month,
      search_outside_prev: searchOutside.prev.k, videos_prev: searchOutside.prev.n,
      search_outside_curr: searchOutside.curr.k, videos_curr: searchOutside.curr.n,
      code_changes: codeChanges,
      depth_prev_median: depth.prev, depth_curr_median: depth.curr,
      gather: health.map(({ month: m, runs: r, partial, searches_short }) => ({ month: m, runs: r, partial, searches_short })),
      late_capture: late,
      read_through_run: update.id, method_version: PAIR_METHOD_VERSION,
      added_only_curr: addedOnly?.market.k ?? null, market_videos_curr: addedOnly?.market.n ?? null,
    },
    planned,
    lines,
  }
}

/** The earlier month's category comments first captured after it ended (GC
 *  F30: August 4,923 of 10,188 on staging). `keyOf` maps a video id to its
 *  `platform\0video_id` key, the comments' join. */
export function lateCaptureOf(
  month: string,
  categoryIds: readonly string[],
  keyOf: ReadonlyMap<string, string>,
  comments: readonly { platform: string; video_id: string; created_at: string }[],
): { month: string; comments: number; of: number } {
  const keys = new Set(categoryIds.map((id) => keyOf.get(id)).filter((k): k is string => !!k))
  const ofCat = comments.filter((c) => keys.has(`${c.platform}\u0000${c.video_id}`))
  return { month, comments: ofCat.filter((c) => c.created_at >= iso(nextMonthStart(month))).length, of: ofCat.length }
}

/** Reach rows once per (change, month, population), the later update winning. */
export function reachRowsOf(measures: readonly PairMeasure[], updates: readonly UpdateRun[]): { rows: ReachRowPlan[]; folded: number } {
  const planned = measures.flatMap((m) => m.planned)
  const finishedAt = (id: string | null) => updates.find((u) => u.id === id)?.finishedAt ?? null
  const rows = oneReachRowEach(planned, finishedAt)
  return { rows, folded: planned.length - rows.length }
}

// ---- Append-only writes: what is not already held as it is --------------------

export type HeldPair = Record<string, unknown> & { prev_month: string; month: string; computed_at?: string }
export interface HeldReach { change_id: string; month: string; population: string; videos_touched: number; videos_in_month: number; read_through_run: string | null }

/** The pair rows that differ from the newest held row of their pair (held in
 *  computed_at order). Compared as values: jsonb reorders keys (`sameJson`). */
export function freshPairRows(held: readonly HeldPair[], rows: readonly PairInsert[]): PairInsert[] {
  const newest = new Map<string, HeldPair>()
  for (const h of held) newest.set(`${String(h.prev_month).slice(0, 10)}|${String(h.month).slice(0, 10)}`, h)
  return rows.filter((r) => {
    const h = newest.get(`${r.prev_month}|${r.month}`)
    if (!h) return true
    const num = (x: unknown) => (x == null ? null : Number(x))
    return !(['search_outside_prev', 'videos_prev', 'search_outside_curr', 'videos_curr', 'read_through_run', 'method_version',
      'added_only_curr', 'market_videos_curr'] as const)
      .every((k) => h[k] === r[k]) || !sameJson(h.code_changes, r.code_changes) || !sameJson(h.late_capture, r.late_capture)
      || num(h.depth_prev_median) !== r.depth_prev_median || num(h.depth_curr_median) !== r.depth_curr_median
      || !sameJson(h.gather, r.gather)
  })
}

/** The reach rows that differ from the newest held row of their key. */
export function freshReachRows(held: readonly HeldReach[], rows: readonly ReachRowPlan[]): ReachRowPlan[] {
  const newest = new Map<string, HeldReach>()
  for (const h of held) newest.set(`${h.change_id}|${h.month.slice(0, 10)}|${h.population}`, h)
  return rows.filter((r) => {
    const h = newest.get(`${r.change_id}|${r.month}|${r.population}`)
    return !(h && h.videos_touched === r.videos_touched && h.videos_in_month === r.videos_in_month && h.read_through_run === r.read_through_run)
  })
}

// ---- The re-check populations (comparability-checks, WP2.3; equal_age, WP3.4) ----

/** comparability_checks.population as the step writes it: the three
 *  re-check populations and equal_age (both months read at the same number
 *  of updates after each ended). */
export type StepPopulation = RecheckPopulation | 'equal_age'
export type StepCheckRow = Omit<CheckRow, 'population'> & { population: StepPopulation }

/**
 * The same-age cut (decision D's third population). Both months read at the
 * same number of updates after each ended: the later month has had `age`
 * updates since its end (counting the run in flight), and the earlier month is
 * read on the comments first captured before the `age`-th update after ITS
 * end finished (lens_readings' p_captured_before). null while the later month
 * has not ended or no update has read it past its end, or when the earlier
 * month never had that many updates. October against November at the 6 Dec
 * update: age 1, October cut at the 1 Nov update's finish.
 */
export function equalAgeCut(updates: readonly UpdateRun[], prevMonth: string, month: string, now: string): {
  age: number
  prevCut: string
  currCut: string
} | null {
  const nowMs = ms(now)
  const done = updates.filter((u) => Number.isFinite(ms(u.finishedAt)) && ms(u.finishedAt) <= nowMs)
    .sort((a, b) => ms(a.finishedAt) - ms(b.finishedAt) || a.id.localeCompare(b.id))
  const after = (m: string) => done.filter((u) => ms(u.finishedAt) >= ms(monthEndInstant(m)))
  const curr = after(month)
  const age = curr.length
  if (age === 0) return null
  const prev = after(prevMonth)
  if (prev.length < age) return null
  const prevAt = prev[age - 1]
  // The earlier month's cut must fall before the later month's end, or the
  // two are not two readings at one age but one reading of both.
  if (ms(prevAt.finishedAt) >= ms(monthEndInstant(month))) return null
  return { age, prevCut: prevAt.finishedAt, currCut: curr[age - 1].finishedAt }
}

/** The reads the re-check makes. */
export interface ChecksIO {
  monthVideos(month: string): Promise<MonthVideo[] | null>
  segments(ids: readonly string[]): Promise<Map<string, PopulationVideo['segment']>>
  /** lens_readings over one population-month, or null when MF2 is not there. */
  lens(population: StepPopulation | 'all', month: string, ids: readonly string[], minDated: number, capturedBefore: string | null, themeRun: string | null): Promise<LensRow[] | null>
  subjects(): Promise<{ id: string; name: string; status: string; calibrated_at: string | null; calibration_precision: number | string | null; calibration_n: number | string | null; calibration_judge_version: string | null }[]>
  themeRun(): Promise<string | null>
  labels(ids: readonly string[]): Promise<Map<string, string>>
}

export interface ChecksResult {
  prevMonth: string
  month: string
  /** 'pending': lens_readings is not there (MF2 not applied). */
  state: 'measured' | 'pending' | 'not_read_to_end' | 'unread'
  readThroughRun: string | null
  themeRun: string | null
  sets: { prev: PopulationSet; curr: PopulationSet }[]
  equalAge: ReturnType<typeof equalAgeCut>
  rows: StepCheckRow[]
  lines: string[]
  /** How many objects were checked (kinds, ready subjects, mood, themes). */
  objects: number
}

/**
 * The re-check of one pair on every population: the three of WP2.3 and, once
 * both months have ended and been read the same number of updates past their
 * ends, equal_age (WP3.4). One comparability_checks row per object and
 * population (lib/reading/recheck.ts recheckRows). No row while the later
 * month has not been read past its end (plan WP2.3).
 */
export async function recheckPair(ctx: MeasureContext, io: ChecksIO, prevMonth: string, month: string, opts: { requireReadToEnd?: boolean } = {}): Promise<ChecksResult> {
  const lines: string[] = []
  const { update, lastGather, later } = pairRead(ctx, month)
  const base: ChecksResult = { prevMonth, month, state: 'unread', readThroughRun: update?.id ?? null, themeRun: null, sets: [], equalAge: null, rows: [], lines, objects: 0 }
  lines.push(`  ${month.slice(0, 7)}: ${later.state}, ${later.readToEnd ? 'read past its end' : 'NOT read past its end'}, latest update ${update?.id ?? '(none)'}${update ? ` of ${update.finishedAt}` : ''}`)
  if (opts.requireReadToEnd && !later.readToEnd) {
    lines.push(`  ${month.slice(0, 7)} has not been read past its end: no re-check is written for a month still filling at its end (plan WP2.3)`)
    return { ...base, state: 'not_read_to_end' }
  }
  if (!update || !lastGather) {
    lines.push(`  no update has read ${month.slice(0, 7)} yet. Nothing to check.`)
    return base
  }
  const unchanged = unchangedSearches(ctx.gathers, iso(prevMonth), lastGather.runId)
  lines.push(`  searches unchanged through both months: ${[...new Set([...unchanged].map((k) => k.split('\u0000')[1]))].sort().join(', ') || '(none)'}`)

  const sides: Record<'prev' | 'curr', MonthVideo[]> = { prev: [], curr: [] }
  for (const [s, m] of [['prev', prevMonth], ['curr', month]] as const) {
    const set = await io.monthVideos(m)
    if (!set) throw new Error('market_month_videos is not there: MF1 is not applied. Nothing written.')
    sides[s] = set
  }
  const segments = await io.segments([...new Set([...sides.prev, ...sides.curr].map((v) => v.id))])
  const popVideos = (vs: readonly MonthVideo[]): PopulationVideo[] => vs.map((v) => ({
    id: v.id, dated: v.dated, segment: segments.get(v.id) ?? 'market',
    outside: isOutside(v, ctx.evidence.get(v.id), unchanged), ambiguous: ctx.provenance?.get(v.id)?.method === 'ambiguous',
  }))
  const pv = { prev: popVideos(sides.prev), curr: popVideos(sides.curr) }
  const sets = RECHECK_POPULATIONS.map((p) => ({ prev: populationSet(pv.prev, p), curr: populationSet(pv.curr, p) }))
  const buyers = (vs: readonly PopulationVideo[]) => vs.filter((v) => v.segment === 'market').length
  lines.push(`\n  the market: ${prevMonth.slice(0, 7)} ${pv.prev.length} videos · ${month.slice(0, 7)} ${pv.curr.length}`)
  for (const s of sets) {
    const line = (x: PopulationSet) => `${x.ids.length} videos (base ${x.base}: makers ${x.makers}, off-topic ${x.noise}${x.population === 'same_searches_clean' ? `, left out as ambiguous ${x.ambiguous}` : ''})`
    const floor = Math.min(s.prev.ids.length, s.curr.ids.length) < 100 ? '  → under 100 on a side' : ''
    lines.push(`  ${s.curr.population.padEnd(19)} ${prevMonth.slice(0, 7)} ${line(s.prev)} · ${month.slice(0, 7)} ${line(s.curr)}${floor}`)
  }
  const equalAge = later.readToEnd ? equalAgeCut(ctx.updates, prevMonth, month, ctx.now) : null
  lines.push(equalAge
    ? `  equal_age           ${prevMonth.slice(0, 7)} read to the update of ${equalAge.prevCut} · ${month.slice(0, 7)} to the update of ${equalAge.currCut} (${equalAge.age} update${equalAge.age === 1 ? '' : 's'} after each ended)`
    : `  equal_age           checks pending (both months at the same age after they ended: WP3.4, from December)`)
  const bPrev = buyers(pv.prev)
  lines.push(`  buyers only (no makers, no off-topic): ${prevMonth.slice(0, 7)} ${bPrev} · ${month.slice(0, 7)} ${buyers(pv.curr)}${bPrev < 100 ? `  → too few in ${new Date(iso(prevMonth)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} to check` : ''}`)

  // The objects: the market's kinds, its ready subjects, mood, and the themes.
  const live = (await io.subjects()).filter((s) => s.status !== 'retired')
  const ready = live.filter((s) => subjectCalibration(s) === 'ready')
  const notReady = live.filter((s) => subjectCalibration(s) !== 'ready')
  if (notReady.length) lines.push(`\n  subjects with no verdict (not ready, decision C): ${notReady.map((s) => `${s.name} (${subjectCalibration(s)})`).join(', ')}`)
  const themeRun = await io.themeRun()
  lines.push(`  themes read under the latest themed run: ${themeRun ?? '(none)'}`)

  const allIds = { prev: pv.prev.map((v) => v.id), curr: pv.curr.map((v) => v.id) }
  const wholePrev = await io.lens('all', prevMonth, allIds.prev, 1, null, themeRun)
  if (wholePrev == null) {
    lines.push('\n  lens_readings is not there (MF2 not applied): the populations are measured above; the checks are pending. Nothing written.')
    return { ...base, state: 'pending', themeRun, sets, equalAge }
  }
  const wholeCurr = (await io.lens('all', month, allIds.curr, 1, null, themeRun)) ?? []
  const popLens = []
  for (const s of sets) {
    const prev = await io.lens(s.curr.population, prevMonth, s.prev.ids, s.prev.minDated, null, themeRun)
    const curr = await io.lens(s.curr.population, month, s.curr.ids, s.curr.minDated, null, themeRun)
    popLens.push({ sets: s, lens: { prev: prev ?? [], curr: curr ?? [] } })
  }
  const themeIds = themesToCheck(wholePrev, wholeCurr)
  const labels = themeIds.length ? await io.labels(themeIds) : new Map<string, string>()
  const kindIds = [...new Set([...wholePrev, ...wholeCurr].filter((r) => r.object_kind === 'kind').map((r) => r.object_id))]
    .sort((a, b) => Object.keys(KIND_LABELS).indexOf(a) - Object.keys(KIND_LABELS).indexOf(b))
  const objects: CheckObject[] = [
    ...kindIds.map((id) => ({ kind: 'kind' as const, id, label: KIND_LABELS[id] ?? id })),
    ...ready.map((s) => ({ kind: 'subject' as const, id: s.id, label: s.name })),
    { kind: 'mood', id: 'positive', label: 'Positive' },
    ...themeIds.map((id) => ({ kind: 'theme' as const, id, label: labels.get(id) ?? id })),
  ]
  const rows: StepCheckRow[] = recheckRows({
    clientId: ctx.clientId, prevMonth, month, objects, whole: { prev: wholePrev, curr: wholeCurr },
    populations: popLens, readThroughRun: update.id,
  })
  if (equalAge) {
    // The whole market at one age: all_but_noise's shape (no depth rule, no
    // "follows depth" reference), every market video in, read at each cut.
    const all = { prev: { ...populationSet(pv.prev, 'all_but_noise'), ids: allIds.prev }, curr: { ...populationSet(pv.curr, 'all_but_noise'), ids: allIds.curr } }
    const prev = (await io.lens('equal_age', prevMonth, all.prev.ids, 1, equalAge.prevCut, themeRun)) ?? []
    const curr = (await io.lens('equal_age', month, all.curr.ids, 1, equalAge.currCut, themeRun)) ?? []
    const aged = recheckRows({
      clientId: ctx.clientId, prevMonth, month, objects, whole: { prev: wholePrev, curr: wholeCurr },
      populations: [{ sets: all, lens: { prev, curr } }], readThroughRun: update.id,
    })
    rows.push(...aged.map((r) => ({ ...r, population: 'equal_age' as const })))
  }
  return { prevMonth, month, state: 'measured', readThroughRun: update.id, themeRun, sets, equalAge, rows, lines, objects: objects.length }
}

/** The line the script prints after its report: the rows by population and outcome. */
export function checksSummaryLine(r: Pick<ChecksResult, 'rows' | 'objects' | 'sets' | 'equalAge'>): string {
  return `\n  ${r.rows.length} rows (${r.objects} objects × ${r.sets.length + (r.equalAge ? 1 : 0)} populations): ${outcomeCounts(r.rows)}`
}

function outcomeCounts(rows: readonly StepCheckRow[]): string {
  const byOutcome = new Map<string, number>()
  for (const r of rows) byOutcome.set(`${r.population}|${r.outcome}`, (byOutcome.get(`${r.population}|${r.outcome}`) ?? 0) + 1)
  return [...byOutcome].map(([k, n]) => `${k} ${n}`).join(' · ')
}

export type HeldCheck = Pick<CheckRow, 'object_kind' | 'object_id' | 'k_prev' | 'n_prev' | 'k_curr' | 'n_curr' | 'outcome' | 'read_through_run' | 'method_version' | 'population_makers' | 'population_noise'> & { population: string; computed_at?: string }

/** The check rows that differ from the newest held row of their key (held in
 *  computed_at order). */
export function freshCheckRows(held: readonly HeldCheck[], rows: readonly StepCheckRow[]): StepCheckRow[] {
  const newest = new Map<string, HeldCheck>()
  for (const h of held) newest.set(`${h.population}|${h.object_kind}|${h.object_id}`, h)
  return rows.filter((r) => {
    const h = newest.get(`${r.population}|${r.object_kind}|${r.object_id}`)
    return !(h && sameCheck(h, r as CheckRow))
  })
}
