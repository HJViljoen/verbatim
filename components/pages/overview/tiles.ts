// Your market's tiles (market-first WP1.6, WP2.5; the approved preview's
// Main.dc.html): which blocks pair, how wide each is, and each one's floor
// below xl. PURE, so the page (./index.tsx) and its loading skeleton
// (app/dashboard/loading.tsx) draw the same tiles.

/**
 * The front page's tiles in their order: the app page's `TILE_BLOCKS` keys
 * (./index.tsx, pinned equal by its test), for the skeleton.
 */
export const FRONT_TILE_KEYS = [
  'overview.sentence',
  'overview.themes',
  'overview.arrivals',
  'overview.category',
  'overview.asks',
  'overview.subjects',
  'overview.foryou',
  'overview.moves',
  'overview.rivals',
  'overview.change',
] as const

/**
 * The front page's widths: every block the width of the page but the
 * preview's two pairs (`Main.dc.html`), the subjects beside what it means for
 * you (8 : 4) and what you published beside the brands (6 : 6).
 */
const FRONT_COLS: Record<string, 4 | 6 | 8 | 12> = {
  'overview.subjects': 8,
  'overview.foryou': 4,
  'overview.moves': 6,
  'overview.rivals': 6,
}

/** Where the subjects are one line (no subject named yet, Össur), the same
 *  pairs, half and half. */
const ONE_LINE_COLS: Record<string, 4 | 6 | 8 | 12> = {
  'overview.subjects': 6,
  'overview.foryou': 6,
  'overview.moves': 6,
  'overview.rivals': 6,
}
const ONE_LINE_ROWS: Record<string, number> = {
  'overview.subjects': 1,
  'overview.rivals': 1,
}

/**
 * THE PREVIEW'S PAIRS, EACH ON ONE ROW, NEITHER TILE STRETCHED (the lead's
 * ruling of 27 Sep on the deploy-3 design review).
 *
 * `PageGrid` stretches every tile in a row to the row's height, so the
 * shorter tile of a pair carried the difference as white inside itself, with
 * its footer link pushed to the bottom: about 350px in "What you published"
 * beside the brands and about 150px in "The market by subject" beside what it
 * means for you, on staging at 11 Oct. And the spans below were rows of
 * different counts inside one pair (published 3, brands 1), so a pair's tiles
 * ended 48px apart and a one-line pair staggered, the next tile starting
 * beside the middle of the one before.
 *
 * So above `xl` every tile spans exactly one row, which puts each pair on one
 * row in the preview's order, and a paired tile is `self-start`: it is as tall
 * as what it draws, its footer under its content, and the pair shares its top
 * edge. The pairing and the order are the preview's; neither tile is widened
 * or re-paired to hide the difference.
 */
export function frontTile(key: string, oneLine: boolean): { col: 4 | 6 | 8 | 12; row: number; className: string } {
  const col = (oneLine ? ONE_LINE_COLS : FRONT_COLS)[key] ?? 12
  return {
    col,
    row: (oneLine ? ONE_LINE_ROWS[key] : undefined) ?? ROWS[key] ?? 2,
    className: col < 12 ? 'xl:row-span-1 xl:self-start' : 'xl:row-span-1',
  }
}

/**
 * How tall each block's tile is BELOW `xl`, where the page is one stacked
 * column and `Tile`'s `MIN_H` gives each tile a floor so the page keeps its
 * rhythm as it scrolls. Above `xl` every tile spans one row (`frontTile`).
 */
const ROWS: Record<string, number> = {
  'overview.bar': 1,
  'overview.sentence': 3,
  'overview.subjects': 3,
  // Floors, not sizes. Lowered in the layout sweep (2026-09-24): the category
  // block lost its absence-only column, so the old floors left a tile of white
  // under it below xl.
  'overview.category': 3,
  // One line inside a drawn block at deploy 2: a floor of one row, so the
  // stacked page does not hold 380px of white under it.
  'overview.rivals': 1,
  // Two rows (248px), not three: without the followers list (staging's
  // Sealand at 768) "What you published" draws about 250px, and a 380px floor
  // held about 90px of white above its footer (the deploy-3 design review).
  'overview.moves': 2,
  'overview.themes': 4,
  'overview.asks': 3,
  'overview.change': 2,
  'overview.foryou': 3,
  'overview.arrivals': 3,
}
