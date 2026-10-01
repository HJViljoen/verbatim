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
/** The preview's two pairs, each way round. */
const PAIRED: Record<string, string> = {
  'overview.subjects': 'overview.foryou',
  'overview.foryou': 'overview.subjects',
  'overview.moves': 'overview.rivals',
  'overview.rivals': 'overview.moves',
}
const ONE_LINE_ROWS: Record<string, number> = {
  'overview.subjects': 1,
  'overview.rivals': 1,
}

/**
 * THE PREVIEW'S PAIRS, EACH ON ONE ROW, BOTH TILES ONE HEIGHT (the lead's
 * ruling of 27 Sep, fast track, on deploy 3's open rulings; it replaces the
 * earlier "neither tile stretched", which the lead withdrew as a mistake).
 *
 * `Main.dc.html` draws each pair on its 12-column grid with `align-items:
 * stretch`, every section a flex column whose body is `flex: 1` with its
 * footer last: both tiles of a pair are as tall as the taller, both footer
 * links sit on one line, and the shorter tile carries its white above its
 * footer. So above `xl` every tile spans exactly one row (a pair's tiles once
 * spanned rows of different counts, published 3 against the brands' 1, and
 * ended 48px apart; a one-line pair staggered), `PageGrid` stretches both to
 * the row, and the page's `bodyClassName` makes each block's section fill its
 * tile (./index.tsx), whose body is `flex-1` with the footer after it
 * (`BlockFrame`'s roomy arm). The pairing and the order are the preview's;
 * neither tile is widened or re-paired.
 *
 * Below `xl` the page is one column and each tile keeps its floor (`ROWS`,
 * below), set so a short block holds no white under its footer.
 */
export function frontTile(key: string, oneLine: boolean, omitted: ReadonlySet<string> = new Set()): { col: 4 | 6 | 8 | 12; row: number; className: string } {
  // A TILE WHOSE PARTNER IS OMITTED SPANS THE ROW ALONE (T0a): an empty block
  // is left out, never drawn as an empty tile beside its pair.
  const partner = PAIRED[key]
  const col = partner && omitted.has(partner) ? 12 : (oneLine ? ONE_LINE_COLS : FRONT_COLS)[key] ?? 12
  return {
    col,
    row: (oneLine ? ONE_LINE_ROWS[key] : undefined) ?? ROWS[key] ?? 2,
    className: 'xl:row-span-1',
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
  // Two rows as well: Össur's (one line, no subject named) draws about 257px,
  // and a 380px floor held about 120px of white above its footer at 768 and
  // 390 (staging, 11 Oct; the deploy-3 design review's finding on the floors).
  'overview.foryou': 2,
  'overview.arrivals': 3,
}
