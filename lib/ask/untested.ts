import type { ClaimResult } from './types'

// What an untested claim says (Heinrich, 9 Nov): whether people raise it at
// all. On the thread, Your moves, Market's card and the quarterly alike, so it
// lives here, import-free but for a type, where the thread's client bundle can
// read it.
//
// "Untested" was one state for two different things: nobody raises the claim,
// or a few videos do and that is too few to judge. A reading now stores the
// videos it found behind an untested claim (`ClaimResult.raisedIn`), and a
// reading stored before it gets a line that is true either way.

/** Your moves' own words for an untested claim, kept for the claim nobody
 *  raises. */
export const NOBODY_RAISES_IT = 'Nobody raises it'

/** A reading stored before the count was: true whether nobody raised it or a
 *  few did. */
export const TOO_FEW_TO_JUDGE = 'Too few videos to judge'

const videos = (n: number) => `${n} ${n === 1 ? 'video' : 'videos'}`

/**
 * An untested claim in words, no full stop (a table cell prints it bare, a
 * sentence adds one). A claim the hold leaves untested while a verdict waits
 * stood on enough videos and is waiting for a second update to agree, so it
 * never reads "too few". Pure.
 */
export function untestedWords(c: Pick<ClaimResult, 'raisedIn' | 'pending'>): string {
  const n = typeof c.raisedIn === 'number' && Number.isFinite(c.raisedIn) ? Math.max(0, Math.round(c.raisedIn)) : null
  if (c.pending) return n ? `Raised in ${videos(n)}, waiting for a second update to agree` : 'Waiting for a second update to agree'
  if (n === null) return TOO_FEW_TO_JUDGE
  if (n === 0) return NOBODY_RAISES_IT
  return `Raised in ${videos(n)}, too few to judge`
}
