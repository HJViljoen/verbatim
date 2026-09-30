import { CURATION_GATE } from '../curation'
import { calibrateSure } from '../reports/documents/scrub'
import type { PoolCandidate, SureWord } from './types'

// How sure a finding is (plan T3), shared by compose (which decides) and the
// prompt (which tells the writer which candidates can carry a finding alone).

/** What a finding rests on this week: the DISTINCT lenient-gated videos
 *  across its candidates (a video two themes share counts once). */
export function evidenceOf(cited: readonly Pick<PoolCandidate, 'lenientVideoIds'>[]): number {
  return new Set(cited.flatMap((c) => c.lenientVideoIds)).size
}

/** The same union over the month to date. */
export function monthEvidenceOf(cited: readonly Pick<PoolCandidate, 'monthVideoIds'>[]): number {
  return new Set(cited.flatMap((c) => c.monthVideoIds)).size
}

/**
 * What prints about how sure a finding is, or null where it does not print at
 * all. The document engine's `calibrateSure`, adapted to videos: the cited
 * candidates are its strands and the distinct (lenient-)gated videos its
 * count, so a video two themes share counts once. Under `reasonable` a
 * finding is held.
 * "Strong evidence" needs the distinct gated videos AND the week figure
 * printed beside it at the product's line, so the count on the page never
 * disproves the marker (lib/curation.ts, the 27 Sep "9 of 1,782" lesson).
 */
export function sureOf(strands: number, videos: number, printedWeek: number): SureWord | null {
  const points = Array.from({ length: Math.max(strands, 1) }, (_, i) => ({ conversationCount: i === 0 ? videos : 0 }))
  if (calibrateSure(points).sure === 'thin') return null
  const line = CURATION_GATE.confirmedMinVideos
  return videos >= line && printedWeek >= line ? 'strong' : 'reasonable'
}

/** Can this candidate carry a finding on its own evidence? (Its evidence
 *  line would print its own count beside it.) */
export const standsAlone = (c: Pick<PoolCandidate, 'lenientVideos'>): boolean => sureOf(1, c.lenientVideos, c.lenientVideos) != null
