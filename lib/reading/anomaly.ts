import { INSIGHT_CATEGORIES } from '../pipeline/schemas'
import { proportionDelta, SHARE_BAND, type BandOptions, type DeltaVerdict } from '../report-bands'

// The anomaly check — is this week unusual against the months behind it?
// (Phase 0 WP4, design item 40 + §9.20, 2026-09-15. Pure: no DB, no clock.)
//
// THE RULE, IN ONE PARAGRAPH. Each update, this week's comment-dated slice is
// compared with the trailing three complete months — the monthly reading's own
// baseline — through the SAME two-proportion band the rest of the product uses
// (`proportionDelta`, `SHARE_BAND`), with the week's video count as n. It is
// run over a PRE-REGISTERED set: the ten insight kinds, each tracked rival's
// attention, and the twenty themes with the largest share in that baseline
// (subjects, when they exist; none do today). The band is then corrected for
// the size of that set (Holm), at most three flags are shown, largest first,
// and while fewer than three of the trailing months clear the floor the whole
// check reads "baseline forming — {n} of 3 months" and flags nothing.
//
// WHY THE CORRECTION IS PART OF THE RULE AND NOT A REFINEMENT. Run weekly over
// a few hundred themes at an uncorrected band, the check would flag roughly a
// dozen things a week by chance alone and "unusual" would be worthless inside
// two months. Pre-registering the set and correcting for its size is what makes
// a flag mean something. The residual risk is the opposite one — that a
// corrected threshold on a week of ~200 videos flags nothing, ever — and that
// is a measurement, not an argument: scripts/coverage-report.ts replays this
// function over the weeks that already exist and counts what it would have
// said.
//
// WHY THE SET SIZE IS THE WHOLE SET, INCLUDING THE OBJECTS THAT CANNOT BE
// TESTED. "Pre-registered" means chosen before the data are seen. An object
// that turns out to fail a floor this week still cost a look, and dropping it
// from the denominator would make the correction depend on the data it is
// correcting — the multiplicity equivalent of moving the goalposts.
//
// TWO GATES, NOT ONE. A flag has to clear `proportionDelta` (which carries the
// product's floors — 100 videos a side, 10 of the object's own a side, and a
// band never narrower than 2 points) AND the Holm threshold. The first is the
// product's honesty rule about thin data; the second is about asking many
// questions at once. Neither implies the other.

/** What a flag can be about. `subject` is here because the design pre-registers
 *  subjects first; there is no subjects table yet, so no caller can build one. */
export type AnomalyObjectKind = 'subject' | 'kind' | 'rival' | 'theme'

/** The ten insight kinds, from the pipeline's own enum so the set size cannot
 *  drift from the vocabulary Pass A writes. (The design says six; production
 *  has written ten since the v5 pull-forwards, and the Holm denominator is the
 *  reason that matters.) */
export const KIND_SET: readonly string[] = INSIGHT_CATEGORIES

/** How many of the largest themes in the baseline are pre-registered. */
export const TOP_THEMES = 20

/** Complete months of baseline the check needs before it will flag anything. */
export const BASELINE_MONTHS = 3

/** The most flags ever shown, largest first. */
export const MAX_FLAGS = 3

/** Family-wise error rate the Holm correction controls, matching the ~95%
 *  two-sided band `proportionDelta` already draws (2×SE). */
export const FAMILY_ALPHA = 0.05

/** One month of a denominator: how many videos that audience (or the whole
 *  slice) carried, dated by when the comment was written. */
export interface DenominatorMonth {
  /** First day of the month, `YYYY-MM-DD`. */
  month: string
  videos: number
}

/** The series an object's share is measured against — the same n for every
 *  object that names it, stated once so a numerator and its denominator cannot
 *  disagree. The name is free text (an audience string, or the whole update
 *  slice); the caller decides what it means and prints it. */
export interface DenominatorSeries {
  name: string
  /** Videos in the week being tested. */
  weekVideos: number
  /** The trailing three complete months, oldest first. */
  months: readonly DenominatorMonth[]
}

/** One pre-registered object and its counts. `videos` is always a DISTINCT
 *  video count over the same population as its denominator — the unit the
 *  bands were calibrated on, and the only unit in which p = k/n is a real
 *  proportion (research/gap-05.md §4). */
export interface PreRegisteredObject {
  kind: AnomalyObjectKind
  /** Stable identity: the category value, the rival's name, `theme_registry.id`. */
  id: string
  /** What a reader is shown. Never used as a key — theme labels churn. */
  label: string
  /** Which `DenominatorSeries` this object's share is a share OF. */
  denominator: string
  /** The object's videos in the week being tested. */
  weekVideos: number
  /** The object's videos per baseline month, keyed the same way as the
   *  denominator's months. A month the object is absent from may be omitted. */
  months: readonly DenominatorMonth[]
}

export type AnomalyState = 'flagged' | 'no_clear_change' | 'too_little_data' | 'baseline_forming'

/** What the check says about one object this week. */
export interface AnomalyRow {
  kind: AnomalyObjectKind
  id: string
  label: string
  denominator: string
  weekVideos: number
  weekTotal: number
  weekPct: number
  baselineVideos: number
  baselineTotal: number
  baselinePct: number
  /** How many of the trailing months cleared the floor. */
  baselineMonthsClearing: number
  /** The band verdict, or null when the baseline was too thin to draw one. */
  verdict: DeltaVerdict | null
  /** Two-sided p for the two-proportion difference; null when not tested. */
  p: number | null
  /** The Holm threshold this p was compared with; null when not tested. */
  holmThreshold: number | null
  state: AnomalyState
}

/** The baseline's own state, per denominator series — the readiness row, and
 *  the sentence the weekly artefact prints while the check is asleep. */
export interface BaselineState {
  denominator: string
  monthsClearing: number
  monthsRead: number
  required: number
  ready: boolean
  /** The design's wording, verbatim. */
  label: string
}

export interface AnomalyReading {
  /** Whatever the caller calls this week — `2026-W37`, a date, anything. */
  week: string
  /** The pre-registered set's size: the Holm denominator. */
  setSize: number
  /** How many objects got as far as a p-value. */
  tested: number
  baselines: BaselineState[]
  rows: AnomalyRow[]
  /** How many objects cleared both gates — which can exceed `MAX_FLAGS`. */
  flaggedCount: number
  /** At most `MAX_FLAGS`, largest movement first. */
  flags: AnomalyRow[]
}

export interface WeekVsBaselineOptions {
  /** The floor and band. `SHARE_BAND` by default: 100 videos a side, 10 of the
   *  object's own a side, band never under 2 points. */
  floor?: BandOptions
  alpha?: number
  maxFlags?: number
  /**
   * How many of the trailing months must clear the floor before anything may be
   * flagged. `BASELINE_MONTHS` by default, and a shipped reading never passes
   * anything else.
   *
   * It exists for one measurement: the design's §9.20 asks how many flags the
   * rule would have raised over a quarter, and on today's corpus the answer is
   * decided almost entirely by this gate — so the replay has to be able to ask
   * the second question too ("and if the baseline floor were waived?") to say
   * how much of a zero is the floor and how much is the correction. The band's
   * own floors (100 videos a side, 10 of the object's own) are untouched by it.
   */
  requireBaselineMonths?: number
}

// ---- The sentence the check prints while it is asleep ------------------------

/** "baseline forming — 2 of 3 months", or "baseline ready". */
export function baselineLabel(monthsClearing: number, required: number = BASELINE_MONTHS): string {
  return monthsClearing >= required ? 'baseline ready' : `baseline forming — ${monthsClearing} of ${required} months`
}

/** The state of one denominator's baseline: how many of the trailing months
 *  carried enough conversation to be compared against at all. */
export function baselineStateOf(series: DenominatorSeries, floor: BandOptions = SHARE_BAND): BaselineState {
  const monthsClearing = series.months.filter((m) => m.videos >= floor.minN).length
  return {
    denominator: series.name,
    monthsClearing,
    monthsRead: series.months.length,
    required: BASELINE_MONTHS,
    ready: monthsClearing >= BASELINE_MONTHS,
    label: baselineLabel(monthsClearing),
  }
}

// ---- Arithmetic --------------------------------------------------------------

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

/**
 * The standard error of a two-proportion difference, in percentage points.
 *
 * Deliberately the same formula as `proportionDelta` (`lib/report-bands.ts`),
 * which computes it and keeps it: it returns the BAND (`max(2×SE, 2 pts)`,
 * rounded to 1 dp), and a p-value cannot be recovered from a rounded, floored
 * band. So it is written out once more here and pinned by a test that asserts
 * the two agree wherever the floor is not biting. If one ever changes, that
 * test fails rather than the two quietly disagreeing.
 */
export function standardErrorPts(sides: { nowPct: number; nowN: number; prevPct: number; prevN: number }): number {
  if (sides.nowN <= 0 || sides.prevN <= 0) return Infinity
  const p1 = clamp01(sides.nowPct / 100)
  const p2 = clamp01(sides.prevPct / 100)
  return Math.sqrt((p1 * (1 - p1)) / sides.nowN + (p2 * (1 - p2)) / sides.prevN) * 100
}

/** Gauss error function — Abramowitz & Stegun 7.1.26, |error| < 1.5e-7. Plenty
 *  for a threshold that is never smaller than 0.05/40. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const z = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * z)
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
  return sign * (1 - poly * Math.exp(-z * z))
}

/** Two-sided p for a standard normal deviate. */
export function twoSidedP(z: number): number {
  if (Number.isNaN(z)) return 1
  if (!Number.isFinite(z)) return 0
  return clamp01(1 - erf(Math.abs(z) / Math.SQRT2))
}

/**
 * Holm–Bonferroni, step-down, over a family of `setSize` pre-registered tests.
 *
 * Returns one entry per input p, in INPUT order: the threshold it was compared
 * with (`alpha / (setSize − rank + 1)`, rank 1 = smallest p) and whether it was
 * rejected. The step-down stops at the first p that fails its threshold: nothing
 * after it is rejected, however small the gap.
 *
 * `setSize` is the whole pre-registered set, which is normally larger than the
 * number of p-values passed in — objects that failed a floor were still part of
 * the family. Passing fewer than `ps.length` would make the correction weaker
 * than the family it is correcting, so it is clamped up.
 */
export function holmRejections(
  ps: readonly number[],
  setSize: number,
  alpha: number = FAMILY_ALPHA,
): { threshold: number; rejected: boolean }[] {
  const m = Math.max(setSize, ps.length)
  const order = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p || a.i - b.i)
  const out: { threshold: number; rejected: boolean }[] = ps.map(() => ({ threshold: NaN, rejected: false }))
  let stillRejecting = true
  order.forEach((entry, rank) => {
    const threshold = alpha / (m - rank)
    const rejected = stillRejecting && entry.p <= threshold
    if (!rejected) stillRejecting = false
    out[entry.i] = { threshold, rejected }
  })
  return out
}

// ---- Building the set --------------------------------------------------------

/** The twenty themes with the largest share in the trailing baseline — the
 *  design's rule, and the reason the set is a set rather than the registry.
 *  Ties break on id so a replay is reproducible. */
export function topThemesByBaseline<T extends { id: string; baselineVideos: number }>(
  themes: readonly T[],
  limit: number = TOP_THEMES,
): T[] {
  return [...themes].sort((a, b) => b.baselineVideos - a.baselineVideos || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, limit)
}

// ---- The check ---------------------------------------------------------------

const pct = (k: number, n: number): number => (n > 0 ? (k / n) * 100 : 0)

const sumMonths = (months: readonly DenominatorMonth[], within: ReadonlySet<string>): number =>
  months.reduce((total, m) => (within.has(m.month) ? total + m.videos : total), 0)

/**
 * This week against the trailing three months, over a pre-registered set.
 *
 * The baseline is the three monthly readings POOLED — numerator and denominator
 * both summed across the months. A video that carried conversation in two of
 * those months counts in both, on both sides of the proportion, exactly as the
 * monthly reading itself counts it.
 *
 * WHICH MAKES THE BASELINE n VIDEO-MONTHS, NOT DISTINCT VIDEOS, and the standard
 * error treats those as independent trials. They are not: a video with
 * conversation in June and August is one video contributing two correlated
 * observations, so the baseline's true variance is larger than `n` implies and
 * the test is anti-conservative on that side — a cluster sample read as a simple
 * one. It is stated here rather than corrected because on the shape this rule
 * is built for the week dominates: at Össur's week 37 the week side carried 95%
 * of the variance (28 of 205 against 38 of 1,089), so the flag stands either
 * way. A longer baseline or a thinner week moves the balance, and the first
 * design that reuses this rule on one should carry a design-effect factor on
 * the baseline term rather than inherit this note.
 */
export function weekVsBaseline(input: {
  week: string
  denominators: readonly DenominatorSeries[]
  set: readonly PreRegisteredObject[]
  options?: WeekVsBaselineOptions
}): AnomalyReading {
  const floor = input.options?.floor ?? SHARE_BAND
  const alpha = input.options?.alpha ?? FAMILY_ALPHA
  const maxFlags = input.options?.maxFlags ?? MAX_FLAGS
  const requireMonths = input.options?.requireBaselineMonths ?? BASELINE_MONTHS

  const series = new Map(input.denominators.map((d) => [d.name, d]))
  const states = new Map(input.denominators.map((d) => [d.name, baselineStateOf(d, floor)]))
  const setSize = input.set.length

  const rows: AnomalyRow[] = input.set.map((obj) => {
    const den = series.get(obj.denominator)
    if (!den) throw new Error(`weekVsBaseline: no denominator "${obj.denominator}" for ${obj.kind} ${obj.id}`)
    const state = states.get(obj.denominator)!
    const monthKeys = new Set(den.months.map((m) => m.month))
    const baselineTotal = den.months.reduce((total, m) => total + m.videos, 0)
    // Only the denominator's own months count: an object row for a month the
    // baseline does not cover is not part of this comparison.
    const baselineVideos = sumMonths(obj.months, monthKeys)
    const base: Omit<AnomalyRow, 'verdict' | 'p' | 'holmThreshold' | 'state'> = {
      kind: obj.kind,
      id: obj.id,
      label: obj.label,
      denominator: obj.denominator,
      weekVideos: obj.weekVideos,
      weekTotal: den.weekVideos,
      weekPct: pct(obj.weekVideos, den.weekVideos),
      baselineVideos,
      baselineTotal,
      baselinePct: pct(baselineVideos, baselineTotal),
      baselineMonthsClearing: state.monthsClearing,
    }
    // A baseline under three months is not a thin comparison — it is no
    // comparison, and the check says so rather than drawing a band nobody
    // should read.
    if (state.monthsClearing < requireMonths) {
      return { ...base, verdict: null, p: null, holmThreshold: null, state: 'baseline_forming' }
    }

    const sides = {
      nowPct: base.weekPct,
      nowN: base.weekTotal,
      nowK: base.weekVideos,
      prevPct: base.baselinePct,
      prevN: base.baselineTotal,
      prevK: base.baselineVideos,
    }
    const verdict = proportionDelta(sides, floor)
    if (verdict.state === 'too_little_data') {
      return { ...base, verdict, p: null, holmThreshold: null, state: 'too_little_data' }
    }
    const se = standardErrorPts(sides)
    // The z uses the UNROUNDED difference; `verdict.change` is rounded to one
    // decimal for display, and a p-value should not inherit that rounding.
    const diff = base.weekPct - base.baselinePct
    const p = twoSidedP(se > 0 ? diff / se : diff === 0 ? NaN : Infinity)
    return { ...base, verdict, p, holmThreshold: null, state: 'no_clear_change' }
  })

  const testedIdx = rows.map((r, i) => (r.p == null ? -1 : i)).filter((i) => i >= 0)
  const holm = holmRejections(
    testedIdx.map((i) => rows[i].p as number),
    setSize,
    alpha,
  )
  testedIdx.forEach((rowIdx, j) => {
    const row = rows[rowIdx]
    row.holmThreshold = holm[j].threshold
    // Both gates: the product's band (floors and a 2-point minimum) and the
    // correction for having asked the whole set at once.
    if (holm[j].rejected && row.verdict?.state === 'moved') row.state = 'flagged'
  })

  const flagged = rows
    .filter((r) => r.state === 'flagged')
    .sort(
      (a, b) =>
        Math.abs(b.verdict!.change) - Math.abs(a.verdict!.change) ||
        (a.p ?? 1) - (b.p ?? 1) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )

  return {
    week: input.week,
    setSize,
    tested: testedIdx.length,
    baselines: input.denominators.map((d) => states.get(d.name)!),
    rows,
    flaggedCount: flagged.length,
    flags: flagged.slice(0, maxFlags),
  }
}
