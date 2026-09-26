import { pooledSide, type MarketCount } from '../../reading/market'
import { monthStartOf } from '../../reading/month-key'

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
// hidden as "being re-described". WP1.1 widens `SubjectCalibration` to these
// three in lib/subjects/types.ts; until it merges, `subjectCalibration` answers
// 'calibrating' or 'ready', and `marketCalibration` reads 'calibrating' as
// provisional, so this block is right on both sides of the merge.
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

/** The row tag a state prints: "provisional", "being re-described", or none. */
export const CALIBRATION_TAG: Record<SubjectCalibrationWord, string | null> = {
  ready: null,
  provisional: 'provisional',
  failed: 'being re-described',
}

export interface MarketSide {
  k: number | null
  n: number | null
  pct: number | null
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * One subject's market side in one month. `measured` is whether the subject
 * has been read at all (a row in any audience and any month on the page): a
 * subject named after the back-read has no row anywhere and reads null, "not
 * read yet", never 0. A measured subject with no row in a month that has rows
 * reads 0.
 */
export function marketSubjectSide(
  rows: readonly { month: string; audience: string; subject_id: string; videos: number }[],
  counts: ReadonlyMap<string, MarketCount>,
  subjectId: string,
  month: string,
  rivalAudiences: readonly string[],
): MarketSide {
  const m = monthStartOf(month)
  const mine = rows.filter((r) => r.subject_id === subjectId)
  const monthHasRows = rows.some((r) => monthStartOf(r.month) === m)
  const side = pooledSide(
    mine.map((r) => ({ month: r.month, audience: r.audience, k: r.videos })),
    counts,
    m,
    rivalAudiences,
    { read: mine.length > 0 && monthHasRows },
  )
  const pct = side.k != null && side.n != null && side.n > 0 ? round1((side.k / side.n) * 100) : null
  return { k: side.k, n: side.n, pct }
}

/** The block's order: by the market's k, largest first; a subject being
 *  re-described, or not read yet, after every subject with a figure; then by
 *  name, so the order never depends on how the rows came back. */
export function byMarketSize<T extends { label: string; market?: { k: number | null } | null; calibration?: SubjectCalibrationWord }>(a: T, b: T): number {
  const ka = a.calibration === 'failed' ? null : a.market?.k ?? null
  const kb = b.calibration === 'failed' ? null : b.market?.k ?? null
  if (ka == null && kb != null) return 1
  if (kb == null && ka != null) return -1
  return (kb ?? 0) - (ka ?? 0) || a.label.localeCompare(b.label)
}
