import { SEALAND_CLIENT_ID } from '../config'
import { BRAND_PRECISION_FLOOR, BRAND_RULE_VERSION, brandRulesFor } from './aliases'

// What the hand checks found (market-first WP2.6): which brands the page may
// count, and whether the name line may print. The page reads these and never
// measures anything itself.
//
// A BRAND PRINTS ITS COUNTS ONLY ONCE ITS PRECISION IS MEASURED ON PRODUCTION
// (plan WP2.6; the lead's rulings of 26 and 27 Sep): until this table holds a
// PRODUCTION hand-check entry for it, a brand prints "not counted yet", never 0
// and never a count, because a count of a word that is mostly something else
// (Freitag is German for Friday) reads as the market talking about the brand.
// A brand checked under BRAND_PRECISION_FLOOR prints "mostly {another word} ·
// not counted". A check on any other database, or on a research sample, is
// not an entry: `where` admits production only, and `brandCountState` reads
// nothing else.
//
// WHAT THE RESEARCH MEASURED, AND WHY IT IS NOT HERE (the 27 Sep ruling): the
// research's mention pool on staging (comment level, brand-counting.md fact 8)
// read Cotopaxi 14 of 16, Patagonia 14 of 16 and The North Face 15 of 15. That
// was a sample of the research's own matching, not of brands_v1's rows on
// production, so Cotopaxi, Patagonia and The North Face wait for the
// production check like the rest.
//
// THE MON 5 OCT HAND CHECK (plan §3.7, step 9.5) covers all eight: Sealand and
// the seven tracked rivals (scripts/brand-mentions.ts --hand-check lists every
// one, a brand with no match included). Its results land here as one entry
// per brand, `where: 'production'`, with each part's counts (below), when it
// was read and on what; they
// reach the page through a commit, the gates and a tag.
//
// PRODUCTION'S FIRST CHECK, 27 SEP (deploy 3 moved up; data/hand-check-brands-
// prod-20260927T135758Z.md, judged row by row in its -judged copy): brands_v1's
// 532 rows, window 1 Aug to 1 Oct. Every part read at 1.00 (Sealand 2 of 2,
// Cotopaxi 7 of 7 and 30 of 30, Freitag 2 of 2 and 10 of 10, Rareform 2 of 2,
// The North Face 26 of 26 and 30 of 30, Patagonia 26 of 26 and 30 of 30), so
// those six count; Freedom of Movement and Old School had no match. The Mon 5
// Oct re-check reads September again.
//
// A BRAND WITH NO MATCH (the lead's ruling of 27 Sep, fast track): where the
// list holds no match of a brand outside its own posts (on staging Rareform,
// Freedom of Movement and Old School), there is nothing to read and no
// precision to measure, so its entry records `matches: 'none'` instead of two
// parts. The rule found nothing, a real zero by the rule, so the page and the
// monthly print it "none found" for a month in which the mention layer holds
// no match of it either; "not counted yet" stays only for a brand whose
// matches exist and have not passed the hand check.
//
// TWO PARTS, EACH GATED (the deploy-3 fresh review). The headline column
// counts only the videos none of our rival searches found
// (lib/brands/rival-searches.ts), and almost every match sits in the others:
// on staging 178 of Patagonia's 204 mention rows, 106 of Cotopaxi's 112 and
// 74 of The North Face's 91. In a video a search for the brand surfaced, the
// brand is nearly always the one meant, so a sample of all the matches says
// little about the headline figure, and the other meanings (Patagonia the
// region, Cotopaxi the volcano) gather in the videos the headline counts. So
// the check reads the headline set IN FULL (`headline`: every match in a video
// no rival search of ours found; 26, 6, 17 and 1 rows on staging for
// Patagonia, Cotopaxi, The North Face and Freitag, August and September) and a
// fixed sample of the rest (`rest`), and a brand counts only when every part
// that holds a match clears the floor. So "In all" never prints on a headline
// set nobody read, and neither column prints on a part under the floor.
//
// AN ENTRY HOLDS FOR THE RULES IT WAS READ UNDER (the deploy-3 fresh review):
// each names its `ruleVersion`, and `brandCountState` reads an entry only
// while it equals BRAND_RULE_VERSION. A change to an alias or an exclusion is
// a new version (lib/brands/aliases.ts), whose matches nobody has read, so
// every brand goes back to "not counted yet" until a check under the new
// rules lands here.
//
// THE NAME LINE (plan WP2.6's done-when): it prints only once the client's own
// name holds a production entry here (the Mon 5 check reads every match of it)
// AND every match of the name outside the client's own posts in the month has
// been read by hand on production (`NAME_READS`); it states the count the
// reading found. With no match outside its own posts there is nothing more to
// read (staging's September: the 8 videos naming Sealand are its own posts, BC
// F35), so once checked it prints "none".

/** One part of a hand check: matches read by hand, and how many of them
 *  were the brand. */
export interface HandCheckPart {
  read: number
  brand: number
}

/** One brand's hand check, on production: its matches read in two parts, or
 *  `matches: 'none'` where the list held no match of it outside its own posts
 *  (`BrandNoMatchCheck`). */
export type BrandHandCheck = BrandPartsCheck | BrandNoMatchCheck

/** A hand check that read the brand's matches, in two parts. */
export interface BrandPartsCheck extends HandCheckRecord {
  matches?: never
  /** Every match in a video none of our rival searches found: the videos
   *  the headline column counts, read in full. */
  headline: HandCheckPart
  /** A fixed sample of the brand's other matches, in videos a rival search of
   *  ours found (`scripts/brand-mentions.ts --hand-check`, its `--sample`). */
  rest: HandCheckPart
}

/** NO MATCH (the lead's ruling of 27 Sep, fast track): production's hand-check
 *  list held no match of the brand outside its own posts, so there was
 *  nothing to read. The rule found nothing in the window's market, a real
 *  zero by the rule, so the brand prints "none found" for a month in which
 *  the mention layer still holds no match of it (lib/pages/overview-market/
 *  brands.ts). The sheet's "Record" line says `matches: 'none'` for such a
 *  brand (scripts/brand-mentions.ts --hand-check). */
export interface BrandNoMatchCheck extends HandCheckRecord {
  matches: 'none'
}

/** What every entry records: when, where, under which rules, of what. */
export interface HandCheckRecord {
  /** When it was read. */
  on: string
  /** Production only: a staging or research sample is not an entry. */
  where: 'production'
  /** The rules the matches were planned under (BRAND_RULE_VERSION when it
   *  was read): an entry for other rules is read as no entry. */
  ruleVersion: string
  /** What the matches were: the window (a month outside it was not read). */
  of: string
  source: string
}

/** What production's hand check of 27 Sep read: brands_v1's rows on
 *  production, every Sealand match and up to 30 a brand. */
const PRODUCTION_27_SEP = {
  on: '2026-09-27',
  where: 'production',
  ruleVersion: 'brands_v1',
  of: 'brands_v1 matches, window 2026-08-01 to 2026-10-01, every Sealand match and up to 30 a brand',
  source: 'data/hand-check-brands-prod-20260927T135758Z.md',
} as const satisfies HandCheckRecord

/** Per tenant, per brand as the tenant names it (`competitor_names`, or the
 *  client's own name as its brand rule names it). */
export const BRAND_HAND_CHECKS: Readonly<Record<string, Readonly<Record<string, BrandHandCheck>>>> = {
  [SEALAND_CLIENT_ID]: {
    Sealand: { headline: { read: 2, brand: 2 }, rest: { read: 0, brand: 0 }, ...PRODUCTION_27_SEP },
    Cotopaxi: { headline: { read: 7, brand: 7 }, rest: { read: 30, brand: 30 }, ...PRODUCTION_27_SEP },
    Freitag: { headline: { read: 2, brand: 2 }, rest: { read: 10, brand: 10 }, ...PRODUCTION_27_SEP },
    Rareform: { headline: { read: 2, brand: 2 }, rest: { read: 0, brand: 0 }, ...PRODUCTION_27_SEP },
    'The North Face': { headline: { read: 26, brand: 26 }, rest: { read: 30, brand: 30 }, ...PRODUCTION_27_SEP },
    Patagonia: { headline: { read: 26, brand: 26 }, rest: { read: 30, brand: 30 }, ...PRODUCTION_27_SEP },
    'Freedom of Movement': { matches: 'none', ...PRODUCTION_27_SEP },
    'Old School': { matches: 'none', ...PRODUCTION_27_SEP },
  },
}

/** A match of the client's name outside its own posts, read by hand on
 *  production. */
export interface NameRead {
  videoId: string
  /** Is it the client? */
  brand: boolean
  month: string
  on: string
  where: 'production'
}

/** Per tenant: every match of its name outside its own posts that someone has
 *  read on production (plan WP2.6: "every Sealand match"). */
export const NAME_READS: Readonly<Record<string, readonly NameRead[]>> = {
  [SEALAND_CLIENT_ID]: [
    // 27 Sep, both in one September video about a Sea-Land (the shipping
    // line) item: "Sealand Gear" is the site a search for it turns up, the
    // client by name. A comment dated in September, then the caption.
    { videoId: 'a8fdd6fe-e2d6-434c-a207-6f17eb3f9b26', brand: true, month: '2026-09-01', on: '2026-09-27', where: 'production' },
    { videoId: 'a8fdd6fe-e2d6-434c-a207-6f17eb3f9b26', brand: true, month: '2026-09-01', on: '2026-09-27', where: 'production' },
  ],
}

/** What a brand's word means where it is not the brand, for the "mostly …
 *  not counted" line (the approved preview's Freitag). */
export const OTHER_MEANING: Readonly<Record<string, string>> = {
  Freitag: 'the German word for Friday',
}

/** `none`: production's list held no match of the brand (`BrandNoMatchCheck`);
 *  the page prints "none found" only for a month in which the mention layer
 *  holds none either (lib/pages/overview-market/brands.ts). */
export type BrandCountState = 'counted' | 'noise' | 'none' | 'not_yet'

const wellFormed = (p: HandCheckPart | null | undefined): p is HandCheckPart =>
  p != null && Number.isInteger(p.read) && Number.isInteger(p.brand) && p.read >= 0 && p.brand >= 0 && p.brand <= p.read

/** Production's entry for a brand under the rules the page counts with, or
 *  null: an entry from anywhere else, read under other rules, or malformed
 *  (a part that is not a whole count, more yes than read, or a no-match entry
 *  that also carries parts) is read as no entry. */
function productionEntry(clientId: string, brand: string, checks: typeof BRAND_HAND_CHECKS): BrandHandCheck | null {
  const c = checks[clientId]?.[brand]
  if (!c || c.where !== 'production' || c.ruleVersion !== BRAND_RULE_VERSION) return null
  if (c.matches === 'none') {
    const parts = c as unknown as { headline?: unknown; rest?: unknown }
    return parts.headline === undefined && parts.rest === undefined ? c : null
  }
  if (c.matches !== undefined) return null
  return wellFormed(c.headline) && wellFormed(c.rest) ? c : null
}

/** Whether a brand's counts may print: each part of its production hand
 *  check that holds a match against the floor (both columns print only when
 *  every such part clears it; one under it reads "mostly … not counted"),
 *  "none" where production's list held no match of it (`matches: 'none'`), or
 *  "not counted yet" where production has not checked it under the rules the
 *  page counts with (an entry from anywhere else, or read under other rules,
 *  or with parts that read no match at all, is read as no entry). A part with
 *  no match (no video outside our rival searches named the brand in the
 *  window) gates nothing: its count there is none. */
export function brandCountState(clientId: string, brand: string, checks: typeof BRAND_HAND_CHECKS = BRAND_HAND_CHECKS): BrandCountState {
  const c = productionEntry(clientId, brand, checks)
  if (!c) return 'not_yet'
  if (c.matches === 'none') return 'none'
  const read = [c.headline, c.rest].filter((p) => p.read > 0)
  if (read.length === 0) return 'not_yet'
  return read.every((p) => p.brand / p.read >= BRAND_PRECISION_FLOOR) ? 'counted' : 'noise'
}

/** The client's own name as its brand rule names it ("Sealand"), or null
 *  where the tenant has no rule for it. */
export function clientBrandName(clientId: string): string | null {
  return brandRulesFor(clientId).find((r) => r.key.kind === 'client')?.brand ?? null
}

/** Has production hand-checked the client's own name, under the rules the
 *  page counts with (any precision: the name line prints what the reading
 *  found, match by match)? A check whose every match is the client's own
 *  posts has nothing outside them to read (staging's September, BC F35): it
 *  is recorded `matches: 'none'` (or, as before the 27 Sep ruling, as two
 *  parts that read none), still counts as checked, and the name line says
 *  "none". */
export function nameChecked(clientId: string, checks: typeof BRAND_HAND_CHECKS = BRAND_HAND_CHECKS): boolean {
  const name = clientBrandName(clientId)
  return name != null && productionEntry(clientId, name, checks) != null
}

/** Did production's list hold no match of the client's own name outside its
 *  own posts (`matches: 'none'`)? The name line may then print "none" even
 *  where the mention layer holds no row of the name at all. */
export function nameNoMatch(clientId: string, checks: typeof BRAND_HAND_CHECKS = BRAND_HAND_CHECKS): boolean {
  const name = clientBrandName(clientId)
  return name != null && productionEntry(clientId, name, checks)?.matches === 'none'
}

/** "mostly the German word for Friday · not counted", or the plan's words. */
export const noiseWords = (brand: string): string => `mostly ${OTHER_MEANING[brand] ?? 'another word'} · not counted`

export const NOT_COUNTED_YET = 'not counted yet'

/** A brand production's hand-check list held no match of, in a month the
 *  mention layer holds none of either (the lead's ruling of 27 Sep). */
export const NONE_FOUND = 'none found'
