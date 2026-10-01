import { pooledSide, type MarketCount } from '../../reading/market'
import { monthStartOf } from '../../reading/month-key'
import { printsMarket } from '../../subjects/calibration-state'

// "The market by subject" (market-first WP1.6, plan §2.2 block 6): each
// subject's market rows, ranked by size, with its calibration word as a row
// tag (decision C).
//
// THE MARKET SIDE (decision E): a subject's videos summed over the category and
// the tracked brands' audiences, over the market's videos that month
// (`pooledSide`). Not the client's side, and not the category's alone.
//
// THE THREE STATES (decision C, WP1.1). `ready` prints normally; `provisional`
// prints its market figure marked "provisional", with no verdict; `failed` is
// hidden as "being re-described". WP1.1's `subjectCalibration`
// (lib/subjects/calibration-state.ts) sets them on every row; a stored row
// may still carry the two-state 'calibrating', which `marketCalibration`
// reads as provisional.
//
// PURE.

/** Decision C's three states, as §4.2 pins `SubjectCalibration` (WP1.1). */
export type SubjectCalibrationWord = 'ready' | 'provisional' | 'failed'

/** Any stored or computed calibration value, as one of the three: the
 *  pre-WP1.1 'calibrating' is provisional, and anything unknown or missing is
 *  provisional too (it gets no verdict and never leads). */
export function marketCalibration(v: string | null | undefined): SubjectCalibrationWord {
  if (v === 'ready' || v === 'failed' || v === 'provisional') return v
  return 'provisional'
}

/** The row tag a state prints: none, in every state (T0a, §B.2; ruling U6).
 *  A subject that is not ready prints its name and no figure instead of a
 *  figure with "provisional" beside it. */
export const CALIBRATION_TAG: Record<SubjectCalibrationWord, string | null> = {
  ready: null,
  provisional: null,
  failed: null,
}

export interface MarketSide {
  k: number | null
  n: number | null
  pct: number | null
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * One subject's market side in one month. Without `opts.read`, whether the
 * subject was read is guessed from its rows (a row in any audience and any
 * month on the page): a subject named after the back-read has no row anywhere
 * and reads null, "not read yet", never 0, and a subject with rows reads 0 in
 * a month that has rows but none of its own.
 *
 * `opts.read` IS THE ANSWER WHEN THE CALLER HAS ONE (deploy 2 review): the
 * loader's read-in test (`subjectReadInOf`, the one the Subjects rows use).
 * A subject that test says was read in the month, and that was cited on no
 * video, reads 0 there: its rows are absent because none cited it, not
 * because nothing looked. So Your market and Subjects cannot disagree on
 * whether a subject was read.
 */
export function marketSubjectSide(
  rows: readonly { month: string; audience: string; subject_id: string; videos: number }[],
  counts: ReadonlyMap<string, MarketCount>,
  subjectId: string,
  month: string,
  rivalAudiences: readonly string[],
  opts: { read?: boolean } = {},
): MarketSide {
  const m = monthStartOf(month)
  const mine = rows.filter((r) => r.subject_id === subjectId)
  const monthHasRows = rows.some((r) => monthStartOf(r.month) === m)
  const side = pooledSide(
    mine.map((r) => ({ month: r.month, audience: r.audience, k: r.videos })),
    counts,
    m,
    rivalAudiences,
    { read: opts.read ?? (mine.length > 0 && monthHasRows) },
  )
  const pct = side.k != null && side.n != null && side.n > 0 ? round1((side.k / side.n) * 100) : null
  return { k: side.k, n: side.n, pct }
}

/** The block's order: by the market's k, largest first; a subject that is
 *  not ready (its figure is withheld, and so is its rank: T0a, ruling U6), or
 *  not read yet, after every subject with a figure; then by name, so the order
 *  never depends on how the rows came back. */
export function byMarketSize<T extends { label: string; market?: { k: number | null } | null; calibration?: SubjectCalibrationWord }>(a: T, b: T): number {
  const ka = printsMarket(a.calibration) ? a.market?.k ?? null : null
  const kb = printsMarket(b.calibration) ? b.market?.k ?? null : null
  if (ka == null && kb != null) return 1
  if (kb == null && ka != null) return -1
  return (kb ?? 0) - (ka ?? 0) || a.label.localeCompare(b.label)
}
