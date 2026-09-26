import type { MarketTheme } from '../pages/overview-market/board'

// Sealand's September market themes, as the front page reads them
// (market-first WP1.6). REAL NUMBERS, NONE INVENTED:
//
// - labels and Sep / Aug videos: production's category themes as at 24 Sep
//   (the grounding digest, "Top category themes"; plan §2.2's print), over
//   production's category n, 626 in September and 351 in August;
// - kinds (`theme_observations.category`): each theme's staging twin's kind
//   on the 20 Sep run (staging, read 26 Sep). Two themes have no staging twin
//   ("Backpack brand and model comparisons", "Questions about bag materials")
//   and carry `question` off their own label: an inference, marked here;
// - maker shares: BY ANALOGY with the staging twins (CQ F29: maker-proxy
//   members over members resolved), as plan §2.2's print uses them until WP1.8
//   measures production. A theme with no staging twin in F29 is unmeasured
//   (null), which is what `theme_maker_shares` would say of a theme it did not
//   read.
//
// THE REGISTRY IDS ARE NAMES, NOT PRODUCTION'S UUIDS: the grounding digest
// does not carry them, and identity is only ever compared inside one fixture.
// Twenty-one themes at 10 or more are listed in the digest; production counts
// 23 (§2.12), and the other two are not in the research, so `atTen` here is 21.

type Row = [id: string, label: string, k: number, prevK: number, kind: string, maker: [number, number] | null]

const ROWS: Row[] = [
  ['th-upcycling', 'Admiration for upcycled bag creativity', 71, 42, 'praise', [112, 138]],
  ['th-ready-to-buy', 'Ready to buy handmade bags', 69, 23, 'purchase_intent', [50, 140]],
  ['th-craftsmanship', 'Respect for handmade craftsmanship', 64, 29, 'praise', [70, 96]],
  ['th-bag-design', 'Love for stylish bag design', 60, 23, 'praise', [36, 106]],
  ['th-tutorials', 'Requests for step-by-step tutorials', 30, 15, 'question', [37, 44]],
  ['th-airline', 'Confusion over airline bag sizes', 21, 9, 'question', [3, 17]],
  ['th-shipping', 'Questions about buying and shipping', 20, 7, 'purchase_intent', [0, 28]],
  ['th-brand-comparisons', 'Backpack brand and model comparisons', 18, 12, 'question', null],
  ['th-price', 'Price checks before purchase', 18, 6, 'purchase_intent', [9, 29]],
  ['th-packing', 'Praise for practical packing tips', 15, 8, 'praise', [3, 14]],
  ['th-measurements', 'Need for exact measurements', 15, 6, 'question', [17, 20]],
  ['th-beginner', 'Appreciation for beginner-friendly tutorials', 14, 7, 'praise', [22, 22]],
  ['th-sewing-tools', 'Questions about sewing tools', 13, 11, 'question', [40, 42]],
  ['th-featured', 'Interest in featured products', 12, 5, 'purchase_intent', null],
  ['th-heavy', 'Frustration with heavy travel bags', 11, 6, 'pain_point', [1, 19]],
  ['th-materials', 'Questions about bag materials', 11, 4, 'question', null],
  ['th-patterns', 'Requests for sewing patterns', 11, 4, 'question', [16, 17]],
  ['th-laptop', 'Praise for laptop-friendly organization', 11, 3, 'praise', [0, 14]],
  ['th-colors', 'Interest in specific colors', 11, 2, 'feature_request', [7, 26]],
  ['th-comfort', 'Backpack comfort and fit issues', 10, 7, 'pain_point', [0, 17]],
  ['th-thrifting', 'Thrifting as smart shopping', 10, 2, 'praise', null],
]

export const SEPTEMBER = '2026-09-01'
export const AUGUST = '2026-08-01'
/** Production's category videos: September 626, August 351. */
export const SEPTEMBER_CATEGORY_N = 626
export const AUGUST_CATEGORY_N = 351

/** Sealand's September category themes at 10 or more, MF1 measured (by
 *  analogy). `measured: false` gives the state before MF1 is applied. */
export function septemberThemes(opts: { measured?: boolean } = {}): MarketTheme[] {
  const measured = opts.measured ?? true
  return ROWS.map(([registryId, label, k, prevK, kind, maker]) => ({
    registryId,
    label,
    labelStripped: false,
    kind,
    k,
    n: SEPTEMBER_CATEGORY_N,
    prev: { month: AUGUST, k: prevK, n: AUGUST_CATEGORY_N },
    makerShare: measured && maker ? maker[0] / maker[1] : null,
    noiseShare: measured && maker ? 0 : null,
    identityNewThisRun: false,
    flags: [],
    provenance: null,
  }))
}
