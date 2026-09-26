import { SEALAND_CLIENT_ID } from '../config'
import { BRAND_PRECISION_FLOOR } from './aliases'

// What the hand checks found (market-first WP2.6): which brands the page may
// count, and whether the name line may print. The page reads these and never
// measures anything itself.
//
// A BRAND PRINTS ITS COUNTS ONLY ONCE ITS PRECISION IS MEASURED (plan WP2.6;
// the lead's default of 26 Sep): a brand nobody has hand-checked prints "not
// counted yet", never 0 and never a count, because a count of a word that is
// mostly something else (Freitag is German for Friday) reads as the market
// talking about the brand. A brand checked under BRAND_PRECISION_FLOOR prints
// "mostly {another word} · not counted".
//
// WHAT IS MEASURED TODAY (staging, the research's mention pool, comment level:
// brand-counting.md fact 8): Cotopaxi 14 of 16, Patagonia 14 of 16, The North
// Face 15 of 15. Freitag's 9 of 39 there was its bare name, before brands_v1
// asked for a company sign beside it, so it is not this rule's precision and
// Freitag waits for the production hand check (Wed 7 Oct), as do Rareform,
// Freedom of Movement and Old School, which the research never sampled. The
// Wed 7 Oct check's results replace or join these entries, one line each, with
// where and when they were read.
//
// THE NAME LINE (plan WP2.6's done-when): it prints only when every match of
// the client's name outside its own posts in the month has been read by hand,
// and it states the count the reading found. With no match outside its own
// posts there is nothing to read (staging's September: the 8 videos naming
// Sealand are its own posts, BC F35), so it prints "none". A match nobody has
// read keeps the line at "not counted yet".

/** One brand's hand check. */
export interface BrandHandCheck {
  /** Matches read by hand, and how many of them were the brand. */
  read: number
  brand: number
  /** When, and on which database. */
  on: string
  where: 'production' | 'staging'
  /** What the matches were: the rule version, or the research's input. */
  of: string
  source: string
}

/** Per tenant, per brand as the tenant names it (`competitor_names`). */
export const BRAND_HAND_CHECKS: Readonly<Record<string, Readonly<Record<string, BrandHandCheck>>>> = {
  [SEALAND_CLIENT_ID]: {
    Cotopaxi: { read: 16, brand: 14, on: '2026-09-24', where: 'staging', of: 'the mention pool, comment level', source: 'research brand-counting.md, fact 8' },
    Patagonia: { read: 16, brand: 14, on: '2026-09-24', where: 'staging', of: 'the mention pool, comment level', source: 'research brand-counting.md, fact 8' },
    'The North Face': { read: 15, brand: 15, on: '2026-09-24', where: 'staging', of: 'the mention pool, comment level', source: 'research brand-counting.md, fact 8' },
  },
}

/** A match of the client's name outside its own posts, read by hand. */
export interface NameRead {
  videoId: string
  /** Is it the client? */
  brand: boolean
  month: string
  on: string
  where: 'production' | 'staging'
}

/** Per tenant: every match of its name outside its own posts that someone has
 *  read (plan WP2.6: "every Sealand match"). Empty until one exists. */
export const NAME_READS: Readonly<Record<string, readonly NameRead[]>> = {
  [SEALAND_CLIENT_ID]: [],
}

/** What a brand's word means where it is not the brand, for the "mostly …
 *  not counted" line (the approved preview's Freitag). */
export const OTHER_MEANING: Readonly<Record<string, string>> = {
  Freitag: 'the German word for Friday',
}

export type BrandCountState = 'counted' | 'noise' | 'not_yet'

/** Whether a brand's counts may print: its hand check's precision against the
 *  floor, or "not counted yet" where nobody has checked it. */
export function brandCountState(clientId: string, brand: string, checks: typeof BRAND_HAND_CHECKS = BRAND_HAND_CHECKS): BrandCountState {
  const c = checks[clientId]?.[brand]
  if (!c || !(c.read > 0) || !(c.brand >= 0) || c.brand > c.read) return 'not_yet'
  return c.brand / c.read >= BRAND_PRECISION_FLOOR ? 'counted' : 'noise'
}

/** "mostly the German word for Friday · not counted", or the plan's words. */
export const noiseWords = (brand: string): string => `mostly ${OTHER_MEANING[brand] ?? 'another word'} · not counted`

export const NOT_COUNTED_YET = 'not counted yet'
