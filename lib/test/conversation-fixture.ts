import { themeFlags, type MarketTheme } from '../pages/overview-market/board'

// Sealand's and Össur's September category themes at 10 or more, AS STAGING
// HOLDS THEM (market-first WP2.4). REAL NUMBERS, NONE INVENTED: read on staging
// (zfmxrrugaihxpubunleu, data to 20 Sep) on 26 Sep, read-only, through the MCP:
//
// - k: `month_theme_readings`, September, audience industry-other;
// - prevK: the same for August (0 where August has no row for the theme);
// - heardBefore: any row with videos for the registry id before September, in
//   any audience (the WP's "no row in any earlier month");
// - label and kind: `theme_observations` on the latest themed run (b67b56de);
// - maker and noise: `theme_maker_shares` for September on that run (MF1 is
//   applied on staging), as [maker, noise, videos].
//
// Sealand's category read 625 videos in September and 351 in August; Össur's
// 338 and 537. The ids are the registry ids' first eight characters: identity
// is only ever compared inside one fixture.

type Row = [id: string, label: string, k: number, prevK: number, heardBefore: boolean, kind: string, seg: [maker: number, noise: number, videos: number] | null]

export const STAGING_SEPTEMBER_N = 625
export const STAGING_AUGUST_N = 351
export const OSSUR_SEPTEMBER_N = 338
export const OSSUR_AUGUST_N = 537

const SEALAND: Row[] = [
  ['03cabe7e', 'Buying interest and ordering questions', 88, 33, true, 'purchase_intent', [31, 0, 88]],
  ['faaa44da', 'Love for creative upcycling', 72, 42, true, 'praise', [63, 0, 72]],
  ['184e2461', 'Admiration for handmade craftsmanship', 65, 32, true, 'praise', [46, 0, 65]],
  ['0b05fdf0', 'Praise for beautiful bag design', 60, 23, true, 'praise', [21, 0, 60]],
  ['e514443f', 'Requests for step-by-step tutorials', 28, 15, true, 'question', [23, 0, 28]],
  ['fb4361bb', 'Questions about materials and tools', 25, 15, true, 'question', [24, 0, 25]],
  ['4c312c8b', 'More colors and variants wanted', 20, 2, true, 'feature_request', [6, 1, 20]],
  ['22e2445c', 'Price and sale questions', 18, 7, true, 'purchase_intent', [4, 1, 18]],
  ['c32c2efd', 'Need for exact measurements', 15, 6, true, 'question', [12, 0, 15]],
  ['daf78e91', 'Tutorial praised as easy to follow', 14, 7, true, 'praise', [14, 0, 14]],
  ['2c7238b7', 'Interest in shipping and locations', 13, 10, true, 'purchase_intent', [0, 1, 13]],
  ['f329a7dd', 'Confusion about airline size rules', 12, 6, true, 'question', [1, 0, 12]],
  ['056a478a', 'Appreciation for smart packing tips', 12, 3, true, 'praise', [2, 0, 12]],
  ['d812ace3', 'Shopping interest from featured items', 12, 5, true, 'purchase_intent', [4, 1, 12]],
  ['8b33a663', 'Requests for the sewing pattern', 11, 6, true, 'question', [11, 0, 11]],
  ['0c0784d8', 'Frustration with bag weight', 11, 6, true, 'pain_point', [0, 1, 11]],
  ['8285e151', 'Praise for laptop carry features', 11, 3, true, 'praise', [0, 2, 11]],
  ['daf7426d', 'Comfort problems when carrying', 10, 7, true, 'pain_point', [0, 0, 10]],
  ['ce659d82', 'Appreciation for thrifting value', 10, 2, true, 'praise', [1, 2, 10]],
  ['aed3a6d0', 'Preference for secondhand fashion', 10, 0, false, 'purchase_intent', [2, 0, 10]],
  ['4f4bc420', 'Laundry planning for travel', 10, 0, false, 'question', [1, 0, 10]],
]

/** Össur has no maker rule (`SEGMENT_RULES_ENABLED`, §2.13), so no shares. */
const OSSUR: Row[] = [
  ['29837c1a', 'Audience identities and amputation types', 44, 102, true, 'demographic_signal', null],
  ['2418f4d7', 'Admiration for personal resilience', 34, 87, true, 'praise', null],
  ['3c28b5fe', 'Questions about prosthetic function', 28, 51, true, 'question', null],
  ['86349219', 'Requests for prosthetic help', 20, 45, true, 'purchase_intent', null],
  ['19c24f49', 'Brand boycott over politics', 16, 0, false, 'objection', null],
  ['559bbc8c', 'Praise for prosthetic look', 15, 28, true, 'praise', null],
  ['140e43a7', 'Price and availability questions', 14, 19, true, 'question', null],
  ['b6db00ac', 'Cost blocks access', 14, 14, true, 'pain_point', null],
  ['d548dd42', 'Excitement about prosthetic innovation', 12, 19, true, 'praise', null],
  ['57d9a5a3', 'Prosthetics need more personalization', 11, 16, true, 'pain_point', null],
  ['515ca100', 'Socket fit keeps changing', 11, 13, true, 'pain_point', null],
  ['4e506728', 'Insurance delays and denials', 10, 10, true, 'pain_point', null],
]

function themesOf(rows: readonly Row[], n: number, prevN: number): MarketTheme[] {
  return rows.map(([registryId, label, k, prevK, heardBefore, kind, seg]) => ({
    registryId,
    label,
    labelStripped: false,
    kind,
    k,
    n,
    prev: { month: '2026-08-01', k: prevK, n: prevN },
    makerShare: seg ? seg[0] / seg[2] : null,
    noiseShare: seg ? seg[1] / seg[2] : null,
    identityNewThisRun: false,
    flags: themeFlags({ k, prevK, heardBefore, regrouped: false }),
    provenance: null,
  }))
}

/** Sealand's September on staging: 21 themes at 10+, 7 of them maker-led. */
export const stagingSealandThemes = (): MarketTheme[] => themesOf(SEALAND, STAGING_SEPTEMBER_N, STAGING_AUGUST_N)

/** Össur's September on staging: 12 themes at 10+, no maker rule. */
export const stagingOssurThemes = (): MarketTheme[] => themesOf(OSSUR, OSSUR_SEPTEMBER_N, OSSUR_AUGUST_N)

/** Whether each staging row carries a row before September (the fixture's
 *  input to `themeFlags`), by id. */
export const STAGING_HEARD_BEFORE: ReadonlyMap<string, boolean> = new Map([...SEALAND, ...OSSUR].map((r) => [r[0], r[4]]))
