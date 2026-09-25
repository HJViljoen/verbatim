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
