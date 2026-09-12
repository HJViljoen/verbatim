/**
 * Tenant config derivation (Tier 0 T0-7, 2026-08-18).
 *
 * Onboarding wrote brand_keywords, competitor_names, industry_keywords and
 * platforms, and never competitor_keywords. But gather searches from
 * competitor_KEYWORDS (lib/gather/gather.ts) while tagging matches on
 * competitor_NAMES (lib/gather/tagging.ts), so a self-serve tenant would gather
 * nothing about its competitors, forever, silently. Every real tenant was
 * hand-seeded, which is why nobody noticed.
 *
 * Pure so the same rule runs at signup and at every settings save.
 */

/** Names too generic to search on their own: a one-word brand that is also an
 *  ordinary noun drags in the whole internet (the Poler → pole dancing and
 *  Patagonia → the region lesson, which cost 331 of 602 videos on Sealand's
 *  first run). They stay in competitor_names for tagging; they just do not
 *  become search terms until an operator says so. */
export const MIN_KEYWORD_CHARS = 4

/** The tracking_configs cardinality ceiling, per bucket (T0-2 CHECK). */
export const MAX_TERMS_PER_BUCKET = 15

/** Longest a single term may be. The DB CHECK bounds how MANY terms a bucket
 *  holds and nothing bounds how long one is, but every term becomes an Apify
 *  search query — so "cost is bounded below the UI" needs this too. Far above
 *  any real term ("urban adventure backpacks" is 25). */
export const MAX_TERM_CHARS = 40

/**
 * Tidy a list of search terms: trim, collapse inner whitespace, drop anything
 * under MIN_KEYWORD_CHARS, de-dupe case-insensitively, cap at the DB ceiling.
 * Shared by the derivation below and by every list a client edits itself
 * (app/dashboard/settings), so the same word is the same term everywhere.
 */
export function cleanTerms(terms: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of terms) {
    const term = `${raw}`.trim().replace(/\s+/g, ' ')
    if (term.length < MIN_KEYWORD_CHARS) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(term)
  }
  return out.slice(0, MAX_TERMS_PER_BUCKET)
}

export function deriveCompetitorKeywords(competitorNames: string[]): string[] {
  return cleanTerms(competitorNames)
}

/** Videos per keyword search for a new tenant. The column default is 10, which
 *  is a demo-sized corpus: the analysis floors (>= 5 comments per video, >= 2
 *  videos per theme) leave almost nothing standing. Real tenants run 50-70. */
export const ONBOARDING_MAX_VIDEOS = 30

/**
 * The competitor search list after a competitor-name change: the derived floor
 * topped up onto whatever is already stored (2026-09-12).
 *
 * A union, never a replacement. The settings page used to skip this write
 * whenever the stored list diverged from the derivation, reading divergence as
 * "an operator curated this, don't clobber it". That was true while only an
 * operator could write the column; now that a client edits its own search
 * terms, the first edit would have frozen the derivation forever and adding a
 * competitor would silently stop adding a search term for it — T0-7 again.
 *
 * Derived terms come FIRST so that a list already at the 15 cap still admits
 * the floor: a competitor the client just named must be searchable, and a
 * curated extra is the thing that can afford to fall off the end.
 */
export function mergeCompetitorKeywords(stored: string[], competitorNames: string[]): string[] {
  return cleanTerms([...deriveCompetitorKeywords(competitorNames), ...stored])
}
