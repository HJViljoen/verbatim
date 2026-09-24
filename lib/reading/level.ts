import { fmtInt } from '../format'
import { SHARE_BAND } from '../report-bands'

// How a level prints: a share where the population can carry one, a count
// where it cannot.
//
// THE FLOOR IS THE BAND'S (`SHARE_BAND.minN`, 100 videos), the same floor under
// which a change reads "too few to compare". "100.0%" of five videos is a
// percentage with a decimal on a sample that cannot hold a whole-number one,
// and it reads as a finding. "5 of 5" is the same fact at its real size. At or
// over the floor the share prints as a whole number: the band a change has to
// clear is two points, so a tenth of one is noise in the reading's own terms.

export const LEVEL_FLOOR_N = SHARE_BAND.minN ?? 100

/** True where `n` can carry a percentage. */
export const carriesShare = (n: number | null | undefined): boolean => (n ?? 0) >= LEVEL_FLOOR_N

/**
 * "4 of 5" under the floor, "51%" at or over it. Null where there is no
 * population at all: a share of nothing is no reading, not 0%.
 */
export function levelText(k: number, n: number | null | undefined): { text: string; kind: 'count' | 'share' } | null {
  if (n == null || n <= 0) return null
  if (!carriesShare(n)) return { text: `${fmtInt(k)} of ${fmtInt(n)}`, kind: 'count' }
  return { text: `${Math.round((k / n) * 100)}%`, kind: 'share' }
}
