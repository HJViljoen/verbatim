import { BRAND_RULE_VERSION } from '../brands/aliases'
import type { BRAND_HAND_CHECKS } from '../brands/precision'
import { SEALAND_CLIENT_ID } from '../config'
import { buildBrandsBlock, type BrandCountIn, type BrandsRead } from '../pages/overview-market/brands'

// Sealand's brands, as scripts/brand-mentions.ts planned them on staging on
// 27 Sep (exec/logs/stg-d3-rulings-brand-plan-2026-09-27.json: rules
// brands_v1, the same 427 rows as 26 Sep's plan, window 1 Aug to 1 Oct,
// market_month_videos' 377 August and 654 September videos). Staging's
// brand_mentions is still empty (the rehearsal stopped before the apply), so
// these counts exist only in that plan; every figure below is copied from it.
// The 8 videos naming Sealand are all its own posts, uploaded in September (2
// to 16 Sep); none outside them.
//
// THE HEADLINE COUNT LEAVES OUT EVERY VIDEO ANY OF OUR RIVAL SEARCHES FOUND
// (the 27 Sep ruling; lib/brands/rival-searches.ts): 138 of September's 654
// and 128 of August's 377, so every brand's headline count sits over 516 in
// September and 249 in August. On the seven terms configured on 24 Sep alone
// (the research's F37 set) the same rows give Patagonia 31, The North Face 11
// and Cotopaxi 10 over 555, against F37's 33, 11 and 11 over 563 (its 563
// holds Sealand's 8 own posts; brands_v1 drops the region and volcano
// matches F37's raw count kept); the bare names we searched until 9 Sep
// ("patagonia", "cotopaxi", "freitag", "poler", "topo designs") found the
// rest.

export const BRAND_KEYS = {
  cotopaxi: '6f9ef2d5-23f7-41bf-a1c7-41caf257623e',
  freitag: '73e961c9-1587-4673-9337-df7bcaa3e11c',
  rareform: 'ad0df44d-4264-4414-a59a-09622ff78545',
  theNorthFace: '0eebb75e-b6e1-4fbf-b2bd-25d0e284a691',
  patagonia: '60a459fe-84b6-4336-b4dd-25ccc8f91277',
  freedomOfMovement: 'f275101a-983b-454b-8971-265c57e5a175',
  oldSchool: '33465c12-8e47-4a95-9ba4-5058ee3476c6',
} as const

/** September (market 654; 516 without any video our rival searches found):
 *  came up in, in all and without them. */
export const SEPTEMBER_BRANDS: readonly BrandCountIn[] = [
  { brandKey: BRAND_KEYS.cotopaxi, label: 'Cotopaxi', hasRows: true, kAny: 28, kOrganic: 3 },
  { brandKey: BRAND_KEYS.freitag, label: 'Freitag', hasRows: true, kAny: 6, kOrganic: 1 },
  { brandKey: BRAND_KEYS.rareform, label: 'Rareform', hasRows: false, kAny: 0, kOrganic: 0 },
  { brandKey: BRAND_KEYS.theNorthFace, label: 'The North Face', hasRows: true, kAny: 36, kOrganic: 6 },
  { brandKey: BRAND_KEYS.patagonia, label: 'Patagonia', hasRows: true, kAny: 45, kOrganic: 13 },
  { brandKey: BRAND_KEYS.freedomOfMovement, label: 'Freedom of Movement', hasRows: false, kAny: 0, kOrganic: 0 },
  { brandKey: BRAND_KEYS.oldSchool, label: 'Old School', hasRows: false, kAny: 0, kOrganic: 0 },
]

/** August (market 377; 249 without any video our rival searches found). */
export const AUGUST_BRANDS: readonly BrandCountIn[] = [
  { brandKey: BRAND_KEYS.cotopaxi, label: 'Cotopaxi', hasRows: true, kAny: 32, kOrganic: 1 },
  { brandKey: BRAND_KEYS.freitag, label: 'Freitag', hasRows: true, kAny: 3, kOrganic: 0 },
  { brandKey: BRAND_KEYS.rareform, label: 'Rareform', hasRows: false, kAny: 0, kOrganic: 0 },
  { brandKey: BRAND_KEYS.theNorthFace, label: 'The North Face', hasRows: true, kAny: 15, kOrganic: 5 },
  { brandKey: BRAND_KEYS.patagonia, label: 'Patagonia', hasRows: true, kAny: 24, kOrganic: 4 },
  { brandKey: BRAND_KEYS.freedomOfMovement, label: 'Freedom of Movement', hasRows: false, kAny: 0, kOrganic: 0 },
  { brandKey: BRAND_KEYS.oldSchool, label: 'Old School', hasRows: false, kAny: 0, kOrganic: 0 },
]

/**
 * A STAND-IN FOR THE MON 5 OCT PRODUCTION HAND CHECK, for the render tests of
 * the counted state only. No production check exists yet, so
 * `BRAND_HAND_CHECKS` ships empty and deploy 3 prints every brand "not counted
 * yet" (`shippedBrandsRead`). These entries borrow the research's staging
 * ratios (brand-counting.md fact 8: Cotopaxi 14 of 16, Patagonia 14 of 16,
 * The North Face 15 of 15) and a check of Sealand's 9 matches (its 8 own posts
 * and 1 comment, every one the brand), so a test can draw what the block
 * prints once production has checked them. They never reach the page.
 */
export const STAND_IN_CHECKS: typeof BRAND_HAND_CHECKS = {
  [SEALAND_CLIENT_ID]: Object.fromEntries(([['Cotopaxi', 16, 14], ['Patagonia', 16, 14], ['The North Face', 15, 15], ['Sealand', 9, 9]] as const)
    .map(([brand, read, yes]) => [brand, { read, brand: yes, on: '2026-10-05', where: 'production' as const, ruleVersion: BRAND_RULE_VERSION, of: 'test stand-in', source: 'lib/test/brands-fixture.ts' }])),
}

/** Staging's September block, as the page builds it once production's hand
 *  check holds the three brands and your name (`STAND_IN_CHECKS`). */
export function stagingBrandsRead(month: '2026-09-01' | '2026-08-01' = '2026-09-01'): BrandsRead {
  const september = month === '2026-09-01'
  return buildBrandsBlock({
    clientId: SEALAND_CLIENT_ID,
    month,
    n: september ? 654 : 377,
    nOrganic: september ? 516 : 249,
    rivals: september ? SEPTEMBER_BRANDS : AUGUST_BRANDS,
    name: { hasRows: true, outside: [], ownPosts: september ? 8 : 0 },
    checks: STAND_IN_CHECKS,
  })
}

/** The same September as deploy 3 ships it: no production hand check yet, so
 *  every brand and your name print "not counted yet". */
export function shippedBrandsRead(): BrandsRead {
  return buildBrandsBlock({
    clientId: SEALAND_CLIENT_ID,
    month: '2026-09-01',
    n: 654,
    nOrganic: 516,
    rivals: SEPTEMBER_BRANDS,
    name: { hasRows: true, outside: [], ownPosts: 8 },
  })
}

/** The same month with nothing in the mention layer yet (staging today). */
export function emptyBrandsRead(): BrandsRead {
  return buildBrandsBlock({
    clientId: SEALAND_CLIENT_ID,
    month: '2026-09-01',
    n: 654,
    nOrganic: 516,
    rivals: SEPTEMBER_BRANDS.map((r) => ({ ...r, hasRows: false, kAny: 0, kOrganic: 0 })),
    name: { hasRows: false, outside: [], ownPosts: 0 },
  })
}
