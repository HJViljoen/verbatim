import type { SeriesPoint } from '../reading/bands'
import type { PairRow } from '../reading/comparability'
import { CATEGORY_AUDIENCE } from '../reading/pairs'

// The month-pair rule's neutral inputs for fixtures and tests that pin
// something else (market-first decision D, WP1.3).
//
// `monthChange` takes a REQUIRED `comparability`, and `directionWord` a
// REQUIRED `asOf` and `comparable`, so every caller says which pair applies.
// A fixture or a test that pins the band, the floors, a block's rendering or a
// direction's other rules says "no month pair applies here" (`comparability:
// null`, `pair: null`) and reads at a clock after every month it draws has
// ended. The pair rule itself is pinned in lib/reading/comparability.test.ts,
// lib/reading/pairs.test.ts and lib/reading/bands.test.ts.

/** A clock after every fixture month has ended (the fixtures draw 2026). */
export const FIXTURE_ENDED = '2027-01-01T00:00:00.000Z'

/** `DirectionInput`'s two required fields, open: every month ended, every step
 *  comparable. */
export const DIRECTION_OPEN = { asOf: FIXTURE_ENDED, comparable: (): boolean => true } as const

// ---- HYPOTHETICAL VALUES, IN ONE PLACE (WP1.3 review fix) -------------------------------
//
// No pair of months read the same way exists yet: the first is October
// against November (plan §2.11), measured from the 6 Dec update. So the
// comparable path, a direction word and a change a row measures under the flag
// share cannot be tested on real counts. The values below are HYPOTHETICAL and
// named so where they are used; every other count in the pair tests is real
// and says where it comes from.

/** October against November read the same way. The 377 market videos and
 *  the median of 23 dated comments a video are August's real reading (DR F39),
 *  re-dated to both months; the ZERO videos outside the searches is
 *  HYPOTHETICAL: what a month with no search change should show, not a
 *  measurement. Read through by the update that reads November last before
 *  13 Dec. */
export const HYPOTHETICAL_SAME_WAY: PairRow = {
  prevMonth: '2026-10-01',
  month: '2026-11-01',
  searchOutside: { prev: { k: 0, n: 377 }, curr: { k: 0, n: 377 } },
  codeChanges: [],
  depth: { prevMedian: 23, currMedian: 23 },
  gather: [],
  lateCapture: null,
  readThroughRun: 'run-2026-12-06',
  methodVersion: 'comparability_v1',
  computedAt: '2026-12-07T09:00:00.000Z',
}

/** A rising run for `directionWord`: 38, 60 and 90 of 377 in October,
 *  November and December. HYPOTHETICAL: three comparable months do not exist
 *  before late January 2027. 38 of 351 is August's real Looks & style count
 *  (research §1), and 377 August's real market n. */
export const HYPOTHETICAL_RISING_RUN: readonly SeriesPoint[] = [
  { month: '2026-10-01', videos: 377, k: 38, audience: CATEGORY_AUDIENCE, regime: 'n/a' },
  { month: '2026-11-01', videos: 377, k: 60, audience: CATEGORY_AUDIENCE, regime: 'n/a' },
  { month: '2026-12-01', videos: 377, k: 90, audience: CATEGORY_AUDIENCE, regime: 'n/a' },
]

/** August against September measured while September is so far, with the
 *  searches measured under the flag share. HYPOTHETICAL: the real row (WP1.4)
 *  will measure 81 of 351 and 206 of 625 outside the searches (CQ F27, GC F29).
 *  2 of 351 is a real August count of a different question (videos found only
 *  by the 13 to 17 Sep terms, DR F37), borrowed for its size. */
export const HYPOTHETICAL_SEARCHES_UNDER_FLAG: PairRow = {
  prevMonth: '2026-08-01',
  month: '2026-09-01',
  searchOutside: { prev: { k: 2, n: 351 }, curr: { k: 2, n: 625 } },
  codeChanges: [],
  depth: { prevMedian: 23, currMedian: 15 },
  gather: [],
  lateCapture: null,
  readThroughRun: 'run-2026-09-20',
  methodVersion: 'comparability_v1',
  computedAt: '2026-09-20T13:00:00.000Z',
}
