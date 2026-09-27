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
// per brand, `where: 'production'`, with when it was read and on what; they
// reach the page through a commit, the gates and a tag. Until then deploy 3
// prints every brand, and the name line, as "not counted yet".
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

/** One brand's hand check, on production. */
export interface BrandHandCheck {
  /** Matches read by hand, and how many of them were the brand. */
  read: number
  brand: number
  /** When it was read. */
  on: string
  /** Production only: a staging or research sample is not an entry. */
  where: 'production'
  /** The rules the matches were planned under (BRAND_RULE_VERSION when it
   *  was read): an entry for other rules is read as no entry. */
  ruleVersion: string
  /** What the matches were: the window. */
  of: string
  source: string
}

/** Per tenant, per brand as the tenant names it (`competitor_names`, or the
 *  client's own name as its brand rule names it). Empty until the Mon 5 Oct
 *  production hand check. */
export const BRAND_HAND_CHECKS: Readonly<Record<string, Readonly<Record<string, BrandHandCheck>>>> = {
  [SEALAND_CLIENT_ID]: {},
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
 *  read on production (plan WP2.6: "every Sealand match"). Empty until one
 *  exists. */
export const NAME_READS: Readonly<Record<string, readonly NameRead[]>> = {
  [SEALAND_CLIENT_ID]: [],
}

/** What a brand's word means where it is not the brand, for the "mostly …
 *  not counted" line (the approved preview's Freitag). */
export const OTHER_MEANING: Readonly<Record<string, string>> = {
  Freitag: 'the German word for Friday',
}

export type BrandCountState = 'counted' | 'noise' | 'not_yet'

/** Whether a brand's counts may print: its production hand check's precision
 *  against the floor, or "not counted yet" where production has not checked
 *  it under the rules the page counts with (an entry from anywhere else, or
 *  read under other rules, is read as no entry). */
export function brandCountState(clientId: string, brand: string, checks: typeof BRAND_HAND_CHECKS = BRAND_HAND_CHECKS): BrandCountState {
  const c = checks[clientId]?.[brand]
  if (!c || c.where !== 'production' || c.ruleVersion !== BRAND_RULE_VERSION) return 'not_yet'
  if (!(c.read > 0) || !(c.brand >= 0) || c.brand > c.read) return 'not_yet'
  return c.brand / c.read >= BRAND_PRECISION_FLOOR ? 'counted' : 'noise'
}

/** The client's own name as its brand rule names it ("Sealand"), or null
 *  where the tenant has no rule for it. */
export function clientBrandName(clientId: string): string | null {
  return brandRulesFor(clientId).find((r) => r.key.kind === 'client')?.brand ?? null
}

/** Has production hand-checked the client's own name (any precision: the name
 *  line prints what the reading found, match by match)? */
export function nameChecked(clientId: string, checks: typeof BRAND_HAND_CHECKS = BRAND_HAND_CHECKS): boolean {
  const name = clientBrandName(clientId)
  return name != null && brandCountState(clientId, name, checks) !== 'not_yet'
}

/** "mostly the German word for Friday · not counted", or the plan's words. */
export const noiseWords = (brand: string): string => `mostly ${OTHER_MEANING[brand] ?? 'another word'} · not counted`

export const NOT_COUNTED_YET = 'not counted yet'
