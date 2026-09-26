import { MARKET_KIND_LABELS } from '../calibration'
import { SHARE_BAND } from '../report-bands'
import { earnsVerdict, isFailed, type SubjectCalibration } from '../subjects/calibration-state'
import type { WeekLineConfig } from '../week-line-config'
import type { ComparabilityMode, OurChange, OurChangeSurface } from './comparability'
import { KIND_LABELS } from './kinds'
import { marketAudiences } from './market'
import { bandVerdict, type RefusedReason, type Verdict } from './verdicts'
import { addDays, dayOf, isoWeekOf, msOfInstant, weekEndInstant, type MarketWeekRow } from './weeks'

// The same-age weekly line (market-first decision M, part 2; plan §4.2
// `week-line.ts`, WP3.13 part A: the reading, kept from the 18 Oct update and
// printed only if its check passes and Heinrich says print).
//
// WHY A WEEK IS READ ONCE, AT AN AGE, AND KEPT. A raw weekly share follows how
// deeply we happened to read the week, not the market: on staging, market
// praise read 76.2 · 55.3 · 42.8 · 57.2 · 61.9 · 61.3 in the weeks of 10 Aug to
// 14 Sep against 23.8 · 11.7 · 9.8 · 14.3 · 19.4 · 17.2 dated comments a video
// (r = 0.95). So each week's point is read once, through the second Sunday
// update after the week ends (its cutoff is the Monday 00:00 UTC two weeks
// after it ends), kept then, and never recomputed: a later read would use
// later readings, because Pass A re-reads a video whose comments grew.
//
// WHY THE DEPTH RULE. Reading every week at the same age does not by itself
// remove the swing (praise ranges 35.8 points at the same age against 33.4
// raw); which videos a week holds does. Holding depth does most of it: at a
// fixed mix of 1-4, 5-19 and 20+ dated comments a video (the pooled six-week
// mix, 0.303 · 0.416 · 0.281), praise's range falls from 33.4 to 15.6 points.
// So a pair is refused when the two weeks' depth differs by more than a fifth
// (`weekPairOf`), and the depth-held share prints beside the raw one
// (`standardisedShare`).
//
// WHAT THIS NEVER DOES. No direction word (nothing here calls
// `directionWord`), never the headline, never the monthly or a brief. The
// verdict is `bandVerdict` with `SHARE_BAND` on the raw shares; "no clear
// change" is the normal answer (the bands at weekly size are 7-10 points on
// the big kinds). It reopens "nothing computed over a week alone" (AGENTS.md;
// research H11) for this line only.
//
// THE CONTRACT WITH MF4 (`market_week_readings`, `market_week_volumes`,
// `week_line_reads`, `week_line_points`: supabase/migrations/
// 20261005091000_market_first_weeks.sql, written by the MF2/MF4 package). The
// pure side relies on three things:
//   1. `market_week_readings` returns a row for every (audience, object, band)
//      with videos, k = 0 included. A band's n is then the same for every
//      object, which is how a read's depth bands are taken (`keepWeekPoints`).
//   2. `market_week_volumes` repeats the whole market's median and mean dated
//      comments a video on each of the week's rows: a median does not pool
//      (lib/reading/weeks.ts).
//   3. The kept conditions jsonb may carry the optional fields `WeekRead` adds
//      below (off_cadence, read_through_at, comments, unchecked_left_out)
//      beside the plan's.
// The SELECT forms of the two functions were run read-only on staging (26 Sep)
// and reproduce decision M's figures; the tests hold those rows.
//
// PURE. The script (scripts/week-points.ts) and, from deploy 4, the run's
// `comparability` step read the rows and hand them in.

// ---- Constants (§4.2) ----------------------------------------------------------

/** The first week read on one search set, one relevance check and one update a week. */
export const WEEK_LINE_FIRST_WEEK = '2026-09-28'
/** The old and the fixed relevance check both ran in it, and production's
 *  24 Sep rehearsals gathered in it. No point, ever. */
export const WEEK_LINE_EXCLUDED: readonly string[] = ['2026-09-21']
/** Read through the second Sunday update after the week ends. */
export const WEEK_AGE_DAYS_DEFAULT = 14
/** The ages a week is kept at while the age is open (the Mon 26 Oct check decides). */
export const WEEK_LINE_AGES: readonly (14 | 21)[] = [14, 21]
/** Comments gained between the age and a week later, over those held at the age. */
export const WEEK_FILL_LATE_MAX = 0.03
/** Smaller ÷ larger, for the mean AND the median dated comments a video. */
export const WEEK_DEPTH_RATIO_MIN = 0.8
/** Unchecked admissions as a share of the week's videos. */
export const WEEK_UNCHECKED_MAX = 0.10
export const WEEK_DEPTH_BANDS = ['1-4', '5-19', '20+'] as const
export type WeekDepthBand = (typeof WEEK_DEPTH_BANDS)[number]
export const WEEK_LINE_KINDS = ['praise', 'question', 'purchase_intent', 'pain_point', 'feature_request', 'objection'] as const
/** A subject gets a row when its k clears this in both weeks of a pair (on
 *  Sealand, Looks & style); never keyed on a name. The band's own numerator
 *  floor, so the row and the verdict can never disagree. */
export const WEEK_SUBJECT_MIN_K = SHARE_BAND.minK ?? 10
/** The search set every pair is read on: era D of Sealand's search terms,
 *  from the 20 Sep gather at 04:18 UTC (research F14, GC F28). A search change
 *  after it refuses the pair. */
export const WEEK_LINE_SEARCH_SET_AT = '2026-09-20T04:18:00Z'
/** The day of the week (UTC) an on-cadence update runs: Sunday (06:00 SAST is
 *  04:00 UTC, the same day). */
export const WEEK_LINE_UPDATE_DAY = 0

export type WeekPairReason = 'cadence' | 'searches' | 'gate' | 'reader' | 'depth' | 'not_kept' | 'excluded'

/** The surfaces that change what we search, rivals and handles included
 *  (condition 2). Communities only when the active set moved: `changesFromLog`
 *  has already dropped a probe or a strike count. */
export const WEEK_SEARCH_SURFACES: readonly OurChangeSurface[] = ['terms', 'subreddits', 'rivals', 'handles', 'platforms', 'knobs']
export const WEEK_GATE_SURFACES: readonly OurChangeSurface[] = ['gate_rule', 'regate']
export const WEEK_READER_SURFACES: readonly OurChangeSurface[] = ['prompt_version']
/** What a capture records when it finds no Pass A call to read the prompt
 *  version from. Two such reads are not "the same reader": it refuses. */
export const WEEK_READER_UNKNOWN = 'unknown'

// ---- Shapes (§4.2, with four optional additions) ------------------------------------

/** One `week_line_reads` row: a week kept at its age. */
export interface WeekRead {
  week: string
  ageDays: 14 | 21
  /** The cutoff: only comments first captured before it count. */
  capturedBefore: string
  /** The age run: the update the week was read through. */
  readThroughRun: string
  runsInWeek: number
  runsAfter: readonly [number, number]
  lateRun: boolean
  videos: number
  meanDated: number
  medianDated: number
  /** Videos per depth band (1-4, 5-19, 20+ dated comments in the week at the cut). */
  bands: readonly [number, number, number]
  unchecked: number
  olderVideos: number
  promptVersion: string
  laneRule: string
  /** Null: the run does not record it. */
  rescrapeCapped: boolean | null
  methodVersion: string
  /** When the point was read (kept from the capture file). */
  computedAt: string
  /** ADDED: runs in the week or the two after that were not a completed,
   *  on-time Sunday update (failed, partial, in flight, another day). Absent
   *  reads as 0 only on a row that also carries runsInWeek and runsAfter. */
  offCadence?: number
  /** ADDED: the age run's finish instant. */
  readThroughAt?: string | null
  /** ADDED: the week's dated comments at the cut (the fill check's numerator). */
  comments?: number
  /** ADDED: unchecked admissions left out of the read by id, counted here and
   *  not in `videos` or `unchecked` (condition 3's "or left out by id"). */
  uncheckedLeftOut?: number
}

/** One object's kept point, pooled over the market, per depth band. */
export interface WeekPoint {
  week: string
  ageDays: 14 | 21
  objectKind: 'kind' | 'subject'
  objectId: string
  bands: readonly { band: WeekDepthBand; k: number; n: number }[]
}

/** One `week_line_points` row (per audience), as kept. */
export interface WeekPointRow {
  week: string
  ageDays: 14 | 21
  methodVersion: string
  audience: string
  objectKind: 'kind' | 'subject'
  objectId: string
  depthBand: WeekDepthBand
  k: number
  n: number
}

/** A `market_week_readings` row as PostgREST returns it. */
export interface WeekReadingRow {
  audience: string
  object_kind: string
  object_id: string
  depth_band: string
  k: number | string
  n: number | string
}

export interface WeekLineRow {
  objectKind: 'kind' | 'subject'
  objectId: string
  label: string
  calibration?: SubjectCalibration
  points: { week: string; k: number; n: number; standardised: number | null; readWith: string }[]
  pairs: { prevWeek: string; week: string; mode: ComparabilityMode; reasons: WeekPairReason[]; verdict: Verdict | null }[]
}

export interface WeekLineBlock {
  ageDays: 14 | 21
  /** The reference depth mix, fixed when the line first prints. */
  mix: readonly [number, number, number] | null
  rows: WeekLineRow[]
  /** Weeks on the axis from the first week that are not kept yet, and the
   *  update each is due with. */
  due: { week: string; date: string }[]
}

/** The line before it prints: what is coming and when (WP2.9's pending row). */
export interface PendingWeekLine {
  state: 'pending'
  firstWeek: string
  ageDays: number
  due: { week: string; date: string }[]
  /** The weeks already kept at their age (`week_line_reads`), not shown until
   *  the line prints (WP2.9's component step). Absent where none is kept or
   *  nothing was read. */
  kept?: string[]
}

/** A run as the cadence rule reads it. `startedAt` places a run in the week it
 *  was due in; without it the finish instant does. */
export interface WeekRun {
  id: string
  status: string
  finishedAt: string | null
  startedAt?: string | null
}

// ---- Ages and cutoffs -------------------------------------------------------------

const DAY_MS = 86_400_000
const UPDATE_STATUSES = new Set(['completed', 'partial'])

const isExcludedWeek = (week: string, firstWeek: string = WEEK_LINE_FIRST_WEEK): boolean =>
  week < firstWeek || WEEK_LINE_EXCLUDED.includes(week)

/** The instant a week's point is read to: its Monday + 7 + `ageDays` days, at
 *  00:00 UTC. `weekAgeCutoff('2026-09-28', 14)` is '2026-10-19T00:00:00Z'. */
export function weekAgeCutoff(week: string, ageDays: number): string {
  return `${addDays(isoWeekOf(week), 7 + ageDays)}T00:00:00Z`
}

/**
 * The age run: the latest completed or partial update that finished in the
 * last week before the cutoff (the second Sunday update after the week ends at
 * 14 days, the third at 21). Null when no update finished there: the week
 * never reached its age by an update (a missed or late update), or has not
 * reached it yet.
 */
export function weekReachesAgeAt(
  week: string,
  ageDays: number,
  runs: readonly { id: string; status: string; finishedAt: string | null }[],
): string | null {
  const cutMs = msOfInstant(weekAgeCutoff(week, ageDays))
  let best: { id: string; ms: number } | null = null
  for (const r of runs) {
    if (!UPDATE_STATUSES.has(r.status) || !r.finishedAt) continue
    const ms = msOfInstant(r.finishedAt)
    if (Number.isNaN(ms) || ms >= cutMs || ms < cutMs - 7 * DAY_MS) continue
    if (!best || ms > best.ms || (ms === best.ms && r.id > best.id)) best = { id: r.id, ms }
  }
  return best?.id ?? null
}

/**
 * The cadence of a week and the two weeks after it (condition 1): the runs in
 * each window, whether one finished late (after the Monday 00:00 UTC that ends
 * its window), and how many were not a completed, on-time Sunday update. A
 * run is placed by `startedAt` (the week it was due in), else by its finish.
 */
export function weekCadence(week: string, runs: readonly WeekRun[]):
  { runsInWeek: number; runsAfter: readonly [number, number]; lateRun: boolean; offCadence: number } {
  const start = msOfInstant(isoWeekOf(week))
  const counts = [0, 0, 0]
  let lateRun = false
  let offCadence = 0
  for (const r of runs) {
    const anchor = msOfInstant(r.startedAt ?? r.finishedAt ?? '')
    if (Number.isNaN(anchor)) continue
    const i = Math.floor((anchor - start) / (7 * DAY_MS))
    if (i < 0 || i > 2) continue
    counts[i]++
    const windowEnd = start + (i + 1) * 7 * DAY_MS
    const finished = r.finishedAt ? msOfInstant(r.finishedAt) : Number.NaN
    const late = !Number.isNaN(finished) && finished >= windowEnd
    if (late) lateRun = true
    const onDay = new Date(anchor).getUTCDay() === WEEK_LINE_UPDATE_DAY
    if (r.status !== 'completed' || Number.isNaN(finished) || late || !onDay) offCadence++
  }
  return { runsInWeek: counts[0], runsAfter: [counts[1], counts[2]], lateRun, offCadence }
}

/** The date of the update a week is due to be read with: `ageDays / 7`
 *  scheduled updates after the week ends (`nextUpdateAfter`, the tenant's
 *  schedule). Without a schedule, the Sunday before the cutoff. */
export function weekDueDate(week: string, ageDays: number, nextUpdateAfter?: ((instant: string) => string | null) | null): string {
  if (nextUpdateAfter) {
    let t: string | null = weekEndInstant(week)
    for (let i = 0; i < Math.round(ageDays / 7) && t != null; i++) t = nextUpdateAfter(t)
    const ms = t == null ? Number.NaN : msOfInstant(t)
    if (!Number.isNaN(ms)) return dayOf(ms)
  }
  return addDays(isoWeekOf(week), 6 + ageDays)
}

/** The weeks on the axis a line would read, from the first week, the excluded
 *  week left out, each with its due date. */
export function dueWeeks(
  axis: readonly string[],
  cfg: Pick<WeekLineConfig, 'firstWeek' | 'ageDays'>,
  nextUpdateAfter?: ((instant: string) => string | null) | null,
): { week: string; date: string }[] {
  return axis
    .map(isoWeekOf)
    .filter((w) => !isExcludedWeek(w, cfg.firstWeek))
    .map((week) => ({ week, date: weekDueDate(week, cfg.ageDays, nextUpdateAfter) }))
}

/** The line's pending state (WP2.9): every week on the axis from the first,
 *  with its due date. Null for a tenant with no `WEEK_LINE` entry. */
export function pendingWeekLine(
  cfg: WeekLineConfig | null,
  axis: readonly string[],
  nextUpdateAfter?: ((instant: string) => string | null) | null,
): PendingWeekLine | null {
  if (!cfg) return null
  return { state: 'pending', firstWeek: cfg.firstWeek, ageDays: cfg.ageDays, due: dueWeeks(axis, cfg, nextUpdateAfter) }
}

/** The update the first comparison is due with: the second week's due date
 *  (the first pair is the first week against the next). */
export function firstComparisonDue(
  cfg: Pick<WeekLineConfig, 'firstWeek' | 'ageDays'>,
  nextUpdateAfter?: ((instant: string) => string | null) | null,
): string {
  let second = addDays(cfg.firstWeek, 7)
  while (WEEK_LINE_EXCLUDED.includes(second)) second = addDays(second, 7)
  return weekDueDate(second, cfg.ageDays, nextUpdateAfter)
}

// ---- The pair rule ----------------------------------------------------------------

const ratio = (a: number, b: number): number => {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return Number.NaN
  return Math.min(a, b) / Math.max(a, b)
}

const shortDay = (day: string): string => {
  const ms = msOfInstant(day)
  if (Number.isNaN(ms)) return day
  const d = new Date(ms)
  return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`
}

function cadenceBroken(r: WeekRead): string | null {
  const parts: string[] = []
  if (r.runsInWeek !== 1) parts.push(`${r.runsInWeek} updates in the week`)
  if (r.runsAfter[0] !== 1) parts.push(`${r.runsAfter[0]} in the week after`)
  if (r.runsAfter[1] !== 1) parts.push(`${r.runsAfter[1]} in the second week after`)
  if (r.lateRun) parts.push('an update finished late')
  if ((r.offCadence ?? 0) > 0 && parts.length === 0) parts.push(`${r.offCadence} not a completed Sunday update`)
  return parts.length ? `week of ${shortDay(r.week)}: ${parts.join(', ')}` : null
}

/**
 * May two kept weeks be compared (the six conditions of decision M; plan §4.2)?
 *
 * Every failing reason is listed, in this order:
 *   not_kept  a week was not kept at its age (a missed capture is a gap for good);
 *   excluded  a week before the first week, or the week of 21 Sep;
 *   cadence   not exactly one completed Sunday update inside each week and one
 *             in each of the two weeks after (a failed, partial, skipped, late
 *             or extra update);
 *   searches  a terms, communities (the active-set rule), rivals, handles,
 *             platforms or knobs change after the 20 Sep search set and before
 *             the later week's age run;
 *   gate      a gate_rule or regate change after the earlier week began, or
 *             unchecked admissions at 10% or more of either week's videos;
 *   reader    a prompt_version change after the earlier week began, a different
 *             prompt version or lane rule at the two age runs, either not
 *             recorded, or two different ages or methods;
 *   depth     either depth ratio (smaller ÷ larger, of the mean and of the
 *             median dated comments a video) under 0.8.
 * Else comparable. Never 'flag'. NaN never passes (a missing figure refuses).
 */
export function weekPairOf(prev: WeekRead | null, curr: WeekRead | null, changes: readonly OurChange[]):
  { mode: ComparabilityMode; reasons: { kind: WeekPairReason; detail: string | null }[] } {
  const reasons: { kind: WeekPairReason; detail: string | null }[] = []
  if (!prev || !curr) reasons.push({ kind: 'not_kept', detail: !prev && !curr ? 'neither week was kept' : !prev ? 'the earlier week was not kept' : 'the later week was not kept' })
  for (const r of [prev, curr]) {
    if (r && isExcludedWeek(isoWeekOf(r.week))) reasons.push({ kind: 'excluded', detail: `week of ${shortDay(r.week)}` })
  }
  for (const r of [prev, curr]) {
    const broken = r ? cadenceBroken(r) : null
    if (broken) reasons.push({ kind: 'cadence', detail: broken })
  }
  if (!prev || !curr) return { mode: 'refuse', reasons }

  const setMs = msOfInstant(WEEK_LINE_SEARCH_SET_AT)
  const prevStart = msOfInstant(isoWeekOf(prev.week))
  const bound = msOfInstant(curr.readThroughAt ?? curr.capturedBefore)
  const inSpan = (c: OurChange, fromMs: number): boolean => {
    const t = msOfInstant(c.changedAt)
    return Number.isNaN(t) || Number.isNaN(bound) || (t > fromMs && t < bound)
  }
  const search = changes.filter((c) => WEEK_SEARCH_SURFACES.includes(c.surface) && inSpan(c, setMs))
  if (search.length) reasons.push({ kind: 'searches', detail: search.map((c) => `${c.surface} ${shortDay(dayOf(msOfInstant(c.changedAt)))}`).join(', ') })

  const gate = changes.filter((c) => WEEK_GATE_SURFACES.includes(c.surface) && inSpan(c, prevStart - 1))
  const unchecked = [prev, curr].filter((r) => !(r.unchecked / r.videos < WEEK_UNCHECKED_MAX))
  if (gate.length || unchecked.length) {
    const parts = [
      ...gate.map((c) => `${c.surface} ${shortDay(dayOf(msOfInstant(c.changedAt)))}`),
      ...unchecked.map((r) => `week of ${shortDay(r.week)}: ${r.unchecked} of ${r.videos} videos let in unchecked`),
    ]
    reasons.push({ kind: 'gate', detail: parts.join(', ') })
  }

  const reader: string[] = changes
    .filter((c) => WEEK_READER_SURFACES.includes(c.surface) && inSpan(c, prevStart - 1))
    .map((c) => `${c.surface} ${shortDay(dayOf(msOfInstant(c.changedAt)))}`)
  const unrecorded = (v: string): boolean => !v || v === WEEK_READER_UNKNOWN
  if (unrecorded(prev.promptVersion) || unrecorded(curr.promptVersion)) reader.push('prompt version not recorded')
  else if (prev.promptVersion !== curr.promptVersion) reader.push(`prompt ${prev.promptVersion} and ${curr.promptVersion}`)
  if (!prev.laneRule || !curr.laneRule) reader.push('lane rule not recorded')
  else if (prev.laneRule !== curr.laneRule) reader.push(`lane rule ${prev.laneRule} and ${curr.laneRule}`)
  if (prev.ageDays !== curr.ageDays) reader.push(`read at ${prev.ageDays} and ${curr.ageDays} days`)
  if (prev.methodVersion !== curr.methodVersion) reader.push(`method ${prev.methodVersion} and ${curr.methodVersion}`)
  if (reader.length) reasons.push({ kind: 'reader', detail: reader.join(', ') })

  const meanR = ratio(prev.meanDated, curr.meanDated)
  const medianR = ratio(prev.medianDated, curr.medianDated)
  if (!(meanR >= WEEK_DEPTH_RATIO_MIN) || !(medianR >= WEEK_DEPTH_RATIO_MIN)) {
    const f = (x: number): string => (Number.isFinite(x) ? x.toFixed(2) : 'not measured')
    reasons.push({ kind: 'depth', detail: `mean ratio ${f(meanR)}, median ratio ${f(medianR)}` })
  }
  return { mode: reasons.length ? 'refuse' : 'comparable', reasons }
}

/** The two depth ratios of a pair (smaller ÷ larger), for the check note and
 *  the hover; NaN when either side is missing or not positive. */
export function weekDepthRatios(prev: WeekRead, curr: WeekRead): { mean: number; median: number } {
  return { mean: ratio(prev.meanDated, curr.meanDated), median: ratio(prev.medianDated, curr.medianDated) }
}

// ---- Shares -------------------------------------------------------------------------

/**
 * The depth-standardised share (a fraction, 0 to 1): each band's share k/n,
 * weighted by the reference mix (1-4, 5-19, 20+; normalised to sum to 1).
 * Null when the mix is not a mix, or a band the mix weights has no videos or
 * not a share. With the pooled six-week staging mix it reproduces decision M's
 * market praise 66.7 · 59.1 · 51.0 · 61.2 · 60.8 · 60.7.
 */
export function standardisedShare(bands: WeekPoint['bands'], mix: readonly [number, number, number]): number | null {
  const total = mix.reduce((a, b) => a + b, 0)
  if (!mix.every((m) => Number.isFinite(m) && m >= 0) || !(total > 0)) return null
  let s = 0
  for (let i = 0; i < WEEK_DEPTH_BANDS.length; i++) {
    const w = mix[i] / total
    if (w === 0) continue
    const b = bands.find((x) => x.band === WEEK_DEPTH_BANDS[i])
    if (!b || !Number.isFinite(b.k) || !Number.isFinite(b.n) || b.n <= 0 || b.k < 0 || b.k > b.n) return null
    s += w * (b.k / b.n)
  }
  return s
}

/** The pooled depth mix of some kept weeks (fractions summing to 1), or null
 *  when they hold no videos: how `WEEK_LINE.mix` is fixed when the line first
 *  prints (the weeks of 28 Sep and 5 Oct). */
export function pooledMix(reads: readonly Pick<WeekRead, 'bands'>[]): readonly [number, number, number] | null {
  const sums = [0, 0, 0]
  for (const r of reads) for (let i = 0; i < 3; i++) sums[i] += r.bands[i]
  const total = sums[0] + sums[1] + sums[2]
  if (!(total > 0) || !sums.every(Number.isFinite)) return null
  return [sums[0] / total, sums[1] / total, sums[2] / total]
}

/** Points pooled over the market's audiences (the category and the tracked
 *  rivals), per week, age, object and band. Rows of any other audience are
 *  left out. The caller passes rows of one method version. */
export function pooledWeekPoints(rows: readonly WeekPointRow[], rivalAudiences: readonly string[]): WeekPoint[] {
  const market = new Set(marketAudiences(rivalAudiences))
  const byKey = new Map<string, { point: WeekPoint; bands: Map<WeekDepthBand, { k: number; n: number }>; seen: Set<string> }>()
  for (const r of rows) {
    if (!market.has(r.audience)) continue
    const week = isoWeekOf(r.week)
    const key = `${week}|${r.ageDays}|${r.objectKind}|${r.objectId}`
    const e = byKey.get(key) ?? {
      point: { week, ageDays: r.ageDays, objectKind: r.objectKind, objectId: r.objectId, bands: [] },
      bands: new Map<WeekDepthBand, { k: number; n: number }>(),
      seen: new Set<string>(),
    }
    const once = `${r.audience}|${r.depthBand}`
    if (e.seen.has(once)) continue
    e.seen.add(once)
    const b = e.bands.get(r.depthBand) ?? { k: 0, n: 0 }
    b.k += r.k
    b.n += r.n
    e.bands.set(r.depthBand, b)
    byKey.set(key, e)
  }
  return [...byKey.values()]
    .map((e) => ({ ...e.point, bands: WEEK_DEPTH_BANDS.filter((b) => e.bands.has(b)).map((band) => ({ band, ...e.bands.get(band)! })) }))
    .sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0) || a.ageDays - b.ageDays || a.objectKind.localeCompare(b.objectKind) || a.objectId.localeCompare(b.objectId))
}

const pointTotals = (p: WeekPoint): { k: number; n: number } =>
  p.bands.reduce((a, b) => ({ k: a.k + b.k, n: a.n + b.n }), { k: 0, n: 0 })

// ---- The line -------------------------------------------------------------------------

/** What a row is called, and a subject's calibration (decision C). */
export interface WeekLineObject {
  objectKind: 'kind' | 'subject'
  objectId: string
  label: string
  calibration?: SubjectCalibration
}

/** A kind's label on a market page ("Praising it"), else its reading label. */
export const weekKindLabel = (kind: string): string => MARKET_KIND_LABELS[kind] ?? KIND_LABELS[kind] ?? kind

/** The refusal a verdict carries for a pair not read the same way. */
function refusedFor(reasons: readonly WeekPairReason[]): RefusedReason {
  if (reasons.includes('depth')) return 'depth'
  if (reasons.some((r) => r === 'searches' || r === 'gate' || r === 'reader')) return 'tracking_change'
  return 'unmeasured'
}

/**
 * The same-age line (WP3.13), from the kept reads and points of `cfg`'s age
 * and method. Rows: the six kinds that have points, in `WEEK_LINE_KINDS`
 * order, then every subject whose k clears `WEEK_SUBJECT_MIN_K` in both weeks
 * of at least one pair, in `objects` order. A failed subject is never a row.
 *
 * Pairs join each kept week to the week after it (the excluded week skipped).
 * A pair not read the same way (`weekPairOf`) keeps both points and carries its
 * reasons and a refused verdict with its counts. A read pair carries
 * `bandVerdict` with `SHARE_BAND` on the raw shares. A subject that is not
 * ready (decision C) gets points and no verdict. Nothing here calls
 * `directionWord`, and no verdict carries a direction.
 *
 * Beyond §4.2's four arguments, `opts` names the rows (`objects`; a kind with
 * no entry takes `weekKindLabel`), and gives the axis and the schedule for the
 * `due` list (weeks on the axis from the first week not kept yet).
 */
export function buildWeekLine(
  reads: readonly WeekRead[],
  points: readonly WeekPoint[],
  changes: readonly OurChange[],
  cfg: WeekLineConfig,
  opts: {
    objects?: readonly WeekLineObject[]
    axis?: readonly string[]
    nextUpdateAfter?: ((instant: string) => string | null) | null
  } = {},
): WeekLineBlock {
  const kept = new Map<string, WeekRead>()
  for (const r of reads) {
    const week = isoWeekOf(r.week)
    if (r.ageDays !== cfg.ageDays || r.methodVersion !== cfg.methodVersion || isExcludedWeek(week, cfg.firstWeek)) continue
    const held = kept.get(week)
    if (!held || msOfInstant(r.computedAt) < msOfInstant(held.computedAt)) kept.set(week, { ...r, week })
  }
  const weeks: string[] = []
  const last = [...kept.keys()].sort().pop()
  if (last) for (let w = isoWeekOf(cfg.firstWeek); w <= last; w = addDays(w, 7)) if (!isExcludedWeek(w, cfg.firstWeek)) weeks.push(w)

  const byObject = new Map<string, Map<string, WeekPoint>>()
  for (const p of points) {
    const week = isoWeekOf(p.week)
    if (p.ageDays !== cfg.ageDays || !kept.has(week)) continue
    const key = `${p.objectKind}|${p.objectId}`
    const m = byObject.get(key) ?? new Map<string, WeekPoint>()
    if (!m.has(week)) m.set(week, { ...p, week })
    byObject.set(key, m)
  }

  const named = new Map((opts.objects ?? []).map((o) => [`${o.objectKind}|${o.objectId}`, o]))
  const order: WeekLineObject[] = []
  for (const kind of WEEK_LINE_KINDS) {
    if (byObject.has(`kind|${kind}`)) order.push(named.get(`kind|${kind}`) ?? { objectKind: 'kind', objectId: kind, label: weekKindLabel(kind) })
  }
  const subjects = [...byObject.keys()].filter((k) => k.startsWith('subject|'))
  const subjectOrder = [
    ...(opts.objects ?? []).filter((o) => o.objectKind === 'subject').map((o) => `subject|${o.objectId}`),
    ...subjects.sort(),
  ]
  for (const key of [...new Set(subjectOrder)]) {
    const pts = byObject.get(key)
    if (!pts) continue
    const obj = named.get(key) ?? { objectKind: 'subject' as const, objectId: key.slice('subject|'.length), label: key.slice('subject|'.length) }
    if (isFailed(obj.calibration)) continue
    const clears = weeks.some((w, i) => {
      const next = weeks[i + 1]
      const a = pts.get(w)
      const b = next ? pts.get(next) : undefined
      return a && b && pointTotals(a).k >= WEEK_SUBJECT_MIN_K && pointTotals(b).k >= WEEK_SUBJECT_MIN_K
    })
    if (clears) order.push(obj)
  }

  const readWith = (r: WeekRead): string => {
    const at = r.readThroughAt ? msOfInstant(r.readThroughAt) : Number.NaN
    return Number.isNaN(at) ? addDays(dayOf(msOfInstant(r.capturedBefore)), -1) : dayOf(at)
  }

  const rows: WeekLineRow[] = order.map((obj) => {
    const pts = byObject.get(`${obj.objectKind}|${obj.objectId}`) ?? new Map<string, WeekPoint>()
    const points = weeks.filter((w) => pts.has(w)).map((w) => {
      const p = pts.get(w)!
      const t = pointTotals(p)
      return { week: w, k: t.k, n: t.n, standardised: cfg.mix ? standardisedShare(p.bands, cfg.mix) : null, readWith: readWith(kept.get(w)!) }
    })
    const verdictsAllowed = obj.objectKind === 'kind' || earnsVerdict(obj.calibration ?? 'provisional')
    const pairs = weeks.slice(0, -1).map((prevWeek, i) => {
      const week = weeks[i + 1]
      const judged = weekPairOf(kept.get(prevWeek) ?? null, kept.get(week) ?? null, changes)
      const reasons = [...new Set(judged.reasons.map((r) => r.kind))]
      const a = pts.get(prevWeek)
      const b = pts.get(week)
      let verdict: Verdict | null = null
      if (a && b && verdictsAllowed) {
        verdict = bandVerdict({
          objectKind: obj.objectKind,
          objectId: obj.objectId,
          objectLabel: obj.label,
          audience: 'market',
          window: { kind: 'week', from: week, to: addDays(week, 7) },
          basis: { from: prevWeek, to: addDays(prevWeek, 7) },
          value: pointTotals(b),
          baseline: pointTotals(a),
          floor: SHARE_BAND,
          ...(judged.mode === 'refuse' ? { refused: refusedFor(reasons) } : {}),
        })
      }
      return { prevWeek, week, mode: judged.mode, reasons, verdict }
    })
    return { objectKind: obj.objectKind, objectId: obj.objectId, label: obj.label, ...(obj.calibration ? { calibration: obj.calibration } : {}), points, pairs }
  })

  const due = opts.axis ? dueWeeks(opts.axis, cfg, opts.nextUpdateAfter).filter((d) => !kept.has(d.week)) : []
  return { ageDays: cfg.ageDays, mix: cfg.mix, rows, due }
}

// ---- Keeping a week ----------------------------------------------------------------------

/** A week that reached an age at the latest update and is not held yet. */
export interface KeepCandidate {
  week: string
  ageDays: 14 | 21
  cutoff: string
  ageRun: WeekRun
}

/**
 * The weeks to keep now: every week from the first (the excluded week left
 * out) that reached one of `ages` at the LATEST completed or partial update, at
 * or after its cutoff, and is not held yet. A week whose age run is not the
 * latest update has moved on: its point is lost for good, because readings
 * keep moving after capture, and it is never offered here (the check note
 * names it).
 */
export function weeksToKeep(input: {
  runs: readonly WeekRun[]
  now: string
  firstWeek: string
  ages?: readonly (14 | 21)[]
  held?: ReadonlySet<string>
}): KeepCandidate[] {
  const nowMs = msOfInstant(input.now)
  if (Number.isNaN(nowMs)) throw new Error(`weeksToKeep: not a date: ${input.now}`)
  const done = input.runs.filter((r) => UPDATE_STATUSES.has(r.status) && r.finishedAt && msOfInstant(r.finishedAt) <= nowMs)
  let latest: WeekRun | null = null
  for (const r of done) {
    if (!latest || msOfInstant(r.finishedAt!) > msOfInstant(latest.finishedAt!)) latest = r
  }
  if (!latest) return []
  const out: KeepCandidate[] = []
  for (let week = isoWeekOf(input.firstWeek); week <= isoWeekOf(input.now); week = addDays(week, 7)) {
    if (isExcludedWeek(week, input.firstWeek)) continue
    for (const age of input.ages ?? WEEK_LINE_AGES) {
      const cutoff = weekAgeCutoff(week, age)
      if (msOfInstant(cutoff) > nowMs || input.held?.has(`${week}|${age}`)) continue
      if (weekReachesAgeAt(week, age, done) === latest.id) out.push({ week, ageDays: age, cutoff, ageRun: latest })
    }
  }
  return out
}

const intOf = (v: number | string): number => (typeof v === 'number' ? v : Number(v))

/**
 * One week kept at its age, from what the capture read: `market_week_volumes`
 * over the week at the cutoff, `market_week_readings` for the week and age,
 * and the runs.
 *
 * The read's depth figures are the whole market the SQL returns (the category
 * and every rival audience, the client arm dropped): mean = comments ÷ videos,
 * the market's median as the SQL repeats it on the week's rows (NaN when the
 * rows disagree or carry none, which refuses every pair on depth), and the
 * bands from the readings (a band's n is the same for every object; the
 * largest is taken per audience). The point rows are kept per audience, as
 * `week_line_points` holds them.
 *
 * Refuses (throws) a row that is not a count, a k over its n, or an unknown
 * band or object kind: nothing malformed is kept, because a kept point is never
 * rewritten.
 */
export function keepWeekPoints(input: {
  candidate: KeepCandidate
  runs: readonly WeekRun[]
  volumes: readonly MarketWeekRow[]
  readings: readonly WeekReadingRow[]
  promptVersion: string
  laneRule: string
  methodVersion: string
  computedAt: string
  rescrapeCapped?: boolean | null
  uncheckedLeftOut?: number
}): { read: WeekRead; rows: WeekPointRow[] } {
  const { candidate } = input
  const week = isoWeekOf(candidate.week)
  const parts = input.volumes.filter((r) => isoWeekOf(r.week) === week)
  const isInt = (v: number): boolean => Number.isInteger(v) && v >= 0
  for (const r of parts) {
    for (const k of ['videos', 'comments', 'unchecked', 'olderVideos'] as const) {
      if (!isInt(r[k])) throw new Error(`keepWeekPoints: ${k} is not a count for ${r.audience} in the week of ${week}`)
    }
  }
  const videos = parts.reduce((a, r) => a + r.videos, 0)
  const comments = parts.reduce((a, r) => a + r.comments, 0)
  const medians = [...new Set(parts.map((r) => r.medianDated))]
  const medianDated = medians.length === 1 && typeof medians[0] === 'number' && Number.isFinite(medians[0]) ? medians[0] : Number.NaN

  const rows: WeekPointRow[] = input.readings.map((raw) => {
    const k = intOf(raw.k)
    const n = intOf(raw.n)
    if (!isInt(k) || !isInt(n) || k > n) throw new Error(`keepWeekPoints: k ${raw.k} of n ${raw.n} is not a count for ${raw.object_kind} ${raw.object_id} (${raw.audience})`)
    if (!(WEEK_DEPTH_BANDS as readonly string[]).includes(raw.depth_band)) throw new Error(`keepWeekPoints: unknown depth band ${raw.depth_band}`)
    if (raw.object_kind !== 'kind' && raw.object_kind !== 'subject') throw new Error(`keepWeekPoints: unknown object kind ${raw.object_kind}`)
    return {
      week, ageDays: candidate.ageDays, methodVersion: input.methodVersion, audience: raw.audience,
      objectKind: raw.object_kind, objectId: raw.object_id, depthBand: raw.depth_band as WeekDepthBand, k, n,
    }
  })
  const bandN = new Map<string, number>()
  for (const r of rows) {
    const key = `${r.audience}|${r.depthBand}`
    bandN.set(key, Math.max(bandN.get(key) ?? 0, r.n))
  }
  const bands = WEEK_DEPTH_BANDS.map((b) => [...bandN.entries()].filter(([k]) => k.endsWith(`|${b}`)).reduce((a, [, n]) => a + n, 0)) as unknown as [number, number, number]

  const cadence = weekCadence(week, input.runs)
  const read: WeekRead = {
    week,
    ageDays: candidate.ageDays,
    capturedBefore: candidate.cutoff,
    readThroughRun: candidate.ageRun.id,
    runsInWeek: cadence.runsInWeek,
    runsAfter: cadence.runsAfter,
    lateRun: cadence.lateRun,
    videos,
    meanDated: videos > 0 ? comments / videos : Number.NaN,
    medianDated,
    bands,
    unchecked: parts.reduce((a, r) => a + r.unchecked, 0),
    olderVideos: parts.reduce((a, r) => a + r.olderVideos, 0),
    promptVersion: input.promptVersion,
    laneRule: input.laneRule,
    rescrapeCapped: input.rescrapeCapped ?? null,
    methodVersion: input.methodVersion,
    computedAt: input.computedAt,
    offCadence: cadence.offCadence,
    readThroughAt: candidate.ageRun.finishedAt,
    comments,
    ...(input.uncheckedLeftOut != null ? { uncheckedLeftOut: input.uncheckedLeftOut } : {}),
  }
  return { read, rows }
}

/** Comments a week gained between two cuts, over those held at the first:
 *  the fill check (decision M: under 3% between two and three updates old).
 *  Null when the first holds none or either is not a count. */
export function fillGain(atAge: number, later: number): number | null {
  if (!Number.isFinite(atAge) || !Number.isFinite(later) || atAge <= 0 || later < 0) return null
  return (later - atAge) / atAge
}
