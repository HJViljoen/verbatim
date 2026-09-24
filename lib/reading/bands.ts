import { sameRegime } from '../pipeline/clustering'
import { SHARE_BAND, type BandOptions } from '../report-bands'
import { nextMonth, monthStartOf } from './monthly'
import { bandVerdict, type ObjectKind, type Verdict, type VerdictFlag, type VerdictWindow } from './verdicts'

// The rules that turn a month series into a claim (design item 5, decisions
// L and M).
//
// ONE RULE, THREE WINDOWS. A month against the month before it, a quarter
// against the quarter before it, a week against the trailing three months: all
// three are `proportionDelta` with a real n on each side, and all three answer
// in the one `Verdict` shape. What differs is what the two sides ARE — and
// that is exactly the thing the old conventions got wrong, by comparing two
// readings of one cumulative corpus taken at two arbitrary moments and calling
// the difference a change.
//
// THE n IS A MONTH'S VIDEO COUNT, and it never was before. Every band call in
// the product today passes a RUN's judged or tracked count; nothing anywhere
// passed a month's. That single substitution is what makes a change a change in
// the conversation rather than a change in how much we happened to gather.
//
// A DIRECTION WORD IS EARNED, NOT DERIVED. `directionWord` is the only function
// in the codebase that may produce one, and it needs three consecutive monthly
// readings, each clearing the floor, agreeing in sign, inside one clustering
// regime and one name, with the first-to-last change clearing the band. That is
// deliberately hard: on today's corpus most audiences clear the floor in zero
// months, so the honest answer for most objects is no word at all — which is
// what `null` means here, and it is not the same as `flat`. `flat` says we
// looked at three readings and they do not agree; `null` says we never had
// three to look at.
//
// THE PER-READER GATE IS ELSEWHERE AND STAYS. `directionWordsFor`
// (lib/config.ts) gates the seven RUN-INDEXED surfaces, and this series is what
// each of them re-bases onto before its key flips. Nothing here reads the gate:
// a word earned on the comment-dated monthly series is the word the gate exists
// to make possible.

/** The shape a rule needs off one month. `MonthPoint` (lib/reading/series.ts)
 *  satisfies it; the structural type is what keeps this file from importing
 *  that one and the two from becoming a cycle. */
export interface SeriesPoint {
  /** First day of the month, `YYYY-MM-DD`. */
  month: string
  /** The audience's videos that month — the n. Null where there is no row. */
  videos: number | null
  /** The object's videos that month — the k. Null on a denominator-only
   *  series or a month with no denominator row. */
  k: number | null
  /** The audience key this month was filed under. A rename gives one line two
   *  of them, and a direction word may not cross that. */
  audience?: string | null
  /** The clustering that produced it. Null is UNKNOWN and never equal to
   *  another null (`sameRegime`), so a stretch of months frozen before the
   *  fingerprint shipped earns no direction word — conservative in the
   *  direction a reader survives. */
  clusteringKey?: string | null
  /**
   * `'n/a'` — THIS SERIES HAS NO CLUSTERING TO BE LIKE-FOR-LIKE ABOUT, which
   * is a different statement from `clusteringKey: null` and has to be made
   * out loud.
   *
   * `month_kind_readings` and `month_audience_stats` carry no clustering
   * column, on purpose: a re-grouping of insights into themes cannot move
   * `audience_insights.category` or a video's sentiment. But absence is not
   * agreement — two unknown keys are not one regime — so every point of such a
   * series arrived with an undefined key and `directionWord` refused EVERY
   * kind, in every month, for ever, reporting it as "we never had three
   * readings to look at" when three readings existed and were refused.
   *
   * So the absence is declared rather than inferred. A point that sets this is
   * in one regime with any other point that sets it, and in no regime at all
   * with a point that carries a real key.
   */
  regime?: 'n/a'
}

/** A point's regime for the two like-for-like rules — see `SeriesPoint.regime`. */
export const regimeOf = (point: SeriesPoint): string | null =>
  point.regime === 'n/a' ? 'n/a' : point.clusteringKey ?? null

export interface ObjectIdentity {
  kind: ObjectKind
  id: string
  label: string
}

/** Does this month carry enough of both sides to be compared at all? The two
 *  floors the product has had since 2026-08-18: 100 videos in the audience and
 *  10 of the object's own. A denominator-only series has no k and is judged on
 *  the denominator alone. */
export function clearsFloor(point: SeriesPoint, floor: BandOptions = SHARE_BAND): boolean {
  if (point.videos == null || point.videos < floor.minN) return false
  if (point.k == null) return true
  return floor.minK == null || point.k >= floor.minK
}

const counted = (point: SeriesPoint): { k: number; n: number } => ({
  k: point.k ?? 0,
  n: point.videos ?? 0,
})

const monthWindowOf = (month: string): VerdictWindow => ({
  kind: 'month',
  from: monthStartOf(month),
  to: nextMonth(month),
})

export interface MonthChangeInput {
  object: ObjectIdentity
  /** The key the line is drawn under. */
  audience: string
  curr: SeriesPoint
  prev: SeriesPoint
  floor?: BandOptions
  flags?: VerdictFlag[]
}

/**
 * This month against the month before it, banded, with each month's video
 * count as n.
 *
 * TWO THINGS IT REFUSES AND ONE IT ONLY MARKS (decision L). A rename is a hard
 * break: the two sides are two names, and the record cannot say whether the
 * rival's share moved or the string did, so the verdict is `refused`. A
 * clustering change is not: the line continues, the caveat is drawn, and the
 * band is still printed — a re-grouping moves which comments sit under a theme,
 * not how much conversation an audience carried, and refusing every comparison
 * across one would refuse nearly every comparison there is. The caveat rides as
 * the `clustering_changed` flag — or as `clustering_unknown` where one of the
 * two months carries no key at all, which is not the same claim and, until M2
 * has landed and runs have stamped a few months, is the one every comparison
 * on the seeded history earns.
 *
 * A hollow or below-floor month needs no special case: it arrives with a zero
 * or thin denominator and `proportionDelta` answers `too_little_data`, which is
 * the same sentence a reader would want anyway.
 */
export function monthChange(input: MonthChangeInput): Verdict {
  const flags = [...(input.flags ?? [])]
  const renamed =
    input.curr.audience != null && input.prev.audience != null && input.curr.audience !== input.prev.audience
  // Two facts, not one. Both keys known and different is a re-grouping; either
  // key missing is a stretch nobody recorded a grouping for, which is what
  // every frozen month on today's corpus looks like. Both stop a direction
  // word and neither refuses the band, but only one of them may be printed as
  // "themes were re-grouped".
  const bothKnown = Boolean(regimeOf(input.curr)) && Boolean(regimeOf(input.prev))
  const regimeChanged = !sameRegime(regimeOf(input.curr), regimeOf(input.prev))
  const regimeFlag: VerdictFlag = bothKnown ? 'clustering_changed' : 'clustering_unknown'
  if (regimeChanged && !flags.includes(regimeFlag)) flags.push(regimeFlag)
  if (renamed && !flags.includes('renamed')) flags.push('renamed')

  return bandVerdict({
    objectKind: input.object.kind,
    objectId: input.object.id,
    objectLabel: input.object.label,
    audience: input.audience,
    window: monthWindowOf(input.curr.month),
    basis: { from: monthStartOf(input.prev.month), to: nextMonth(input.prev.month) },
    value: counted(input.curr),
    baseline: counted(input.prev),
    flags,
    floor: input.floor,
    ...(renamed ? { refused: 'rename' as const } : {}),
  })
}

/** Readings a window-against-window comparison needs behind it before it may be
 *  drawn at all: two quarters' worth. Under it the answer is
 *  `baseline_forming`, which resolves on the calendar rather than on volume. */
export const QUARTER_UNLOCKS_AT = 6

export interface QuarterChangeInput {
  object: ObjectIdentity
  audience: string
  window: VerdictWindow
  basis: { from: string; to: string }
  /** Both sides come from the WINDOW read (`window_denominators` /
   *  `window_theme_readings`), never from summing month rows: a video whose
   *  thread spans two months is one member of a window and two of a sum, and
   *  the surplus runs to +38.7% over twelve months on live data.
   *
   *  THE RULE HOLDS EVERYWHERE, and This week's §3 is the one place it had to
   *  be reconciled rather than asserted (Block B fix pass). That block bands a
   *  month-to-date share against the three months behind it, and it took its
   *  baseline off a sum of month rows — disclosed, tested, and measured at 449
   *  video-months against 446 distinct videos on Sealand, so the digits were
   *  fine and the product held two contradictory rules ~600 lines apart.
   *  `buildRising` now reads that baseline over its window, keeps the sum as a
   *  fallback for as long as M3's functions are unapplied, and prints the
   *  "added together" note only on that fallback. */
  value: { k: number; n: number }
  baseline: { k: number; n: number }
  /** How many monthly readings exist behind this comparison — the count of
   *  months on the series that could be read at all. */
  readings: number
  floor?: BandOptions
  flags?: VerdictFlag[]
  unlocksAt?: number
}

/**
 * A window against the equal window before it.
 *
 * The design's rule at longer horizons, and the shape of a quarter. It is not a
 * sum of monthly verdicts and it is not a sum of month rows; it is one banded
 * comparison over two windowed reads, so its n is a distinct-video count on
 * both sides.
 */
export function quarterChange(input: QuarterChangeInput): Verdict {
  const unlocksAt = input.unlocksAt ?? QUARTER_UNLOCKS_AT
  const base = {
    objectKind: input.object.kind,
    objectId: input.object.id,
    objectLabel: input.object.label,
    audience: input.audience,
    window: input.window,
    basis: input.basis,
    value: input.value,
    flags: input.flags ?? [],
    floor: input.floor,
  }
  if (input.readings < unlocksAt) {
    return { ...bandVerdict(base), state: 'baseline_forming' }
  }
  return bandVerdict({ ...base, baseline: input.baseline })
}

// ---- Thin months -------------------------------------------------------------

/** A month is thin when it carried under this share of the trailing median's
 *  conversation. The share moves on very little in such a month, and the band
 *  alone will not say so: 30 videos against a median of 600 clears no floor,
 *  but 90 against 600 does and still reads on a sixth of the evidence. */
export const THIN_MONTH_SHARE = 0.6

/** Updates in a month below which it is thin — but only for months the tenant
 *  was actually being run in. See `thinMonth`. */
export const THIN_MONTH_UPDATES = 2

/** The median of the numbers that exist. Months with no row are not zeros for
 *  this purpose: a median that counts them drags towards nothing and calls a
 *  normal month thin. */
function median(values: readonly (number | null | undefined)[]): number | null {
  const present = values.filter((v): v is number => typeof v === 'number').sort((a, b) => a - b)
  if (present.length === 0) return null
  const mid = Math.floor(present.length / 2)
  return present.length % 2 === 1 ? present[mid] : (present[mid - 1] + present[mid]) / 2
}

export interface ThinMonthInput {
  /** How many updates ran in this month, by `pipeline_runs.started_at`. Null
   *  when nobody has counted. */
  updates?: number | null
  /** The month of the tenant's first run ever. The updates arm applies only
   *  from here on. */
  firstRunMonth?: string | null
  share?: number
  minUpdates?: number
}

/**
 * Did this month carry so little conversation that its share is not worth
 * reading (decision M)?
 *
 * TWO ARMS, AND THE SECOND ONE HAS A GATE THE DESIGN DID NOT HAVE. The design
 * says a month is thin when it had fewer than two delivered updates OR its
 * analysed videos fall below 60% of the trailing median. Taken literally the
 * first arm marks essentially the whole back-read thin: Össur's first run ever
 * is 2026-04-06 and Sealand's 2026-06-28, so 51 of Össur's 55 category months
 * and 64 of Sealand's 66 have zero updates BY CONSTRUCTION, and the history the
 * trial is sold on would print as unreadable. So the updates arm applies only
 * to months from the tenant's first run onward; before that a month is not thin,
 * it is read back at setup, and it carries that label instead.
 *
 * The median arm is computed on the comment-dated series — the same numbers the
 * chart draws — and over the months that have a row, because a month with no
 * row is a hollow month and has its own token.
 */
export function thinMonth(
  point: SeriesPoint,
  trailing: readonly (number | null | undefined)[],
  input: ThinMonthInput = {},
): boolean {
  const share = input.share ?? THIN_MONTH_SHARE
  const minUpdates = input.minUpdates ?? THIN_MONTH_UPDATES
  const from = input.firstRunMonth ? monthStartOf(input.firstRunMonth) : null
  const inRunEra = from != null && monthStartOf(point.month) >= from
  if (inRunEra && input.updates != null && input.updates < minUpdates) return true

  if (point.videos == null) return false
  const mid = median(trailing)
  if (mid == null || mid <= 0) return false
  return point.videos < share * mid
}

// ---- The direction word ------------------------------------------------------

/** Consecutive monthly readings a direction word needs. Three, from the design:
 *  two readings are one change, and one change is what the run-indexed series
 *  was already wrong about. */
export const DIRECTION_RUN = 3

/**
 * "3rd month" — the tail every artboard prints after the direction word
 * (Block D wave 3, M19).
 *
 * Both forms are honest: the word is earned over `DIRECTION_RUN` consecutive
 * monthly readings, so "3 months" is how many and "3rd month" is which one
 * this is. The ruling is that wording follows the mock, and every one of the
 * twelve artboards that prints the word prints it this way — twenty-seven
 * times, with no instance of "3 months" anywhere.
 *
 * DERIVED FROM `DIRECTION_RUN`, never typed: a hard-coded "3" beside the word
 * is a second copy of the rule, and the one thing this label may never do is
 * name a run length the word was not earned over.
 *
 * It lives HERE, beside the run, because there are two `DirectionWord` nodes
 * in the product — `components/pages/overview/subjects.tsx` (shared by
 * Overview's rows and movers, both emails, Voice and the leadership sheet) and
 * `components/pages/subjects/subject.tsx` (local to the Subjects page) — and
 * M19 moved only the first. Two copies of this string is how one page went on
 * saying "3 months" after the product had stopped.
 */
const ORDINAL_SUFFIX = ['th', 'st', 'nd', 'rd'] as const
export const DIRECTION_RUN_LABEL = ((n: number) => {
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ORDINAL_SUFFIX[n % 10] ?? 'th'
  return `${n}${suffix} month`
})(DIRECTION_RUN)

export type Direction = 'growing' | 'fading' | 'flat'

export interface DirectionInput {
  floor?: BandOptions
  run?: number
}

const pct = (point: SeriesPoint): number => {
  const n = point.videos ?? 0
  return n > 0 ? ((point.k ?? 0) / n) * 100 : 0
}

/**
 * The only function that may produce a direction word.
 *
 * `points` are a series' months in calendar order, hollow months included — the
 * generated axis, not the rows. The word is read off the LAST `run` of them and
 * every one of the following has to hold, or the answer is `null`:
 *
 *   * there are `run` of them and they are CONSECUTIVE calendar months. A
 *     hollow month or a below-floor month breaks the run rather than being
 *     skipped over: on Ottobock 16 of 36 months are hollow, and "the last three
 *     that cleared the floor" would happily span a year and call it a trend.
 *   * each clears both floors — 100 videos in the audience, 10 of the object's
 *     own — so no reading in the run is one the product would refuse on its own.
 *   * each HAS a k. A denominator-only series has no numerator at all
 *     (`SeriesPoint.k` null), every point reads 0%, the steps agree at zero and
 *     the word would come out `flat` — a direction earned from nothing.
 *     `clearsFloor` deliberately passes a null k, so this module invites the
 *     call and has to answer it with the same `null` as the other exits.
 *   * all of them sit in ONE clustering regime. Two unknown keys are not one
 *     regime, so a stretch frozen before the fingerprint shipped earns no word.
 *     A series with no clustering to be like-for-like about says so with
 *     `regime: 'n/a'` and is not refused for it — see `SeriesPoint.regime`.
 *   * all of them are filed under ONE name. A renamed rival's two halves are
 *     drawn as one line with the break marked; a word spoken across the break
 *     would be a claim about the conversation that is really a claim about a
 *     string.
 *
 * Then the word: the two steps must agree in RAW SIGN — not each clear its own
 * band, which at these n would fire approximately never — and the first-to-last
 * change must clear the band drawn between those two months. `flat` is the
 * honest answer when three readings exist and do not agree; `null` is the
 * honest answer when three readings do not exist.
 */
export function directionWord(
  points: readonly SeriesPoint[],
  input: DirectionInput = {},
): Direction | null {
  const floor = input.floor ?? SHARE_BAND
  const run = input.run ?? DIRECTION_RUN
  if (points.length < run) return null
  const tail = points.slice(points.length - run)

  for (let i = 1; i < tail.length; i++) {
    if (monthStartOf(tail[i].month) !== nextMonth(tail[i - 1].month)) return null
  }
  if (!tail.every((p) => clearsFloor(p, floor))) return null
  if (tail.some((p) => p.k == null)) return null
  for (let i = 1; i < tail.length; i++) {
    if (!sameRegime(regimeOf(tail[i]), regimeOf(tail[i - 1]))) return null
    if ((tail[i].audience ?? null) !== (tail[i - 1].audience ?? null)) return null
  }

  const steps: number[] = []
  for (let i = 1; i < tail.length; i++) steps.push(pct(tail[i]) - pct(tail[i - 1]))
  const up = steps.every((s) => s >= 0) && steps.some((s) => s > 0)
  const down = steps.every((s) => s <= 0) && steps.some((s) => s < 0)
  if (!up && !down) return 'flat'

  const first = tail[0]
  const last = tail[tail.length - 1]
  const span = bandVerdict({
    objectKind: 'theme',
    objectId: 'direction',
    objectLabel: 'direction',
    audience: last.audience ?? '',
    window: monthWindowOf(last.month),
    basis: { from: monthStartOf(first.month), to: nextMonth(first.month) },
    value: counted(last),
    baseline: counted(first),
    floor,
  })
  if (span.state !== 'moved') return 'flat'
  return up ? 'growing' : 'fading'
}
