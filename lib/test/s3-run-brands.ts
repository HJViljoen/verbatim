import type { PlannedMention } from '../brands/mentions'
import { rivalFoundOf } from '../brands/rival-searches'
import type { MonthVideo } from '../provenance/searches'

// Sealand's September brand topics on staging, on the ONE BASE of the 27 Sep
// ruling (decision E, the research's F37; lib/brands/rival-searches.ts): the
// market's 654 videos (625 in the category, 29 filed under a brand you
// track), of which 138 were found by one of our rival searches, current or
// retired, so every brand's headline count sits over 516. The brands, "in
// all" and "without any video our rival searches found": Patagonia 45 and 13,
// The North Face 36 and 6, Cotopaxi 28 and 3 (scripts/brand-mentions.ts on
// staging, 27 Sep, the same 427 brands_v1 rows as 26 Sep;
// exec/logs/d3-rulings-brands-f37-check.txt; lib/test/brands-fixture.ts).
// Video ids are labels. Which videos the rival searches found beyond the
// three brands' own (51 of the 138), and the split of each brand's videos
// between content and comment and between audiences, are not in the read:
// here every match is in the content and in the category, and the 51 are the
// 29 rival-filed videos and 22 category ones (HYPOTHETICAL, named so).

export const SEP = '2026-09-01'
export const PATAGONIA = 'b0000000-0000-4000-8000-00000000000a'
export const NORTH_FACE = 'b0000000-0000-4000-8000-00000000000b'
export const COTOPAXI = 'b0000000-0000-4000-8000-00000000000c'

/** 625 category videos and 29 rival-filed ones (Cotopaxi's, a label). */
export const SEP_MARKET: MonthVideo[] = [
  ...Array.from({ length: 625 }, (_, i) => ({ id: `cat-${i}`, platform: 'tiktok', audience: 'industry-other', dated: 10 })),
  ...Array.from({ length: 29 }, (_, i) => ({ id: `riv-${i}`, platform: 'tiktok', audience: 'competitor:Cotopaxi', dated: 10 })),
]

/** Staging's rival searches, current and retired (12, 27 Sep). */
export const SEP_RIVAL_TERMS = [
  'cotopaxi', 'cotopaxi backpack', 'fombrand', 'freitag', 'freitag bag', 'frtg',
  'north face backpack', 'patagonia', 'patagonia black hole', 'poler', 'rareform bag', 'topo designs',
] as const

/** September's market videos any rival search found, and the one base. */
export const SEP_RIVAL_FOUND = 138
export const SEP_BASE = 516

/** brand, videos in all, of which no rival search found, the rival search
 *  that found the rest. */
export const SEP_BRANDS = [
  { brand: 'Patagonia', key: PATAGONIA, all: 45, organic: 13, term: 'patagonia black hole' },
  { brand: 'The North Face', key: NORTH_FACE, all: 36, organic: 6, term: 'north face backpack' },
  { brand: 'Cotopaxi', key: COTOPAXI, all: 28, organic: 3, term: 'cotopaxi backpack' },
] as const

/** The content mentions, each market video's first-found terms, and the
 *  videos a rival search found, that reproduce those figures: each brand's
 *  videos are its own block of the category, the first `all - organic` found
 *  by a rival search; then 22 more category videos and the 29 rival-filed
 *  ones found by one, the rest by a category search. */
export function sepMentions(): { mentions: PlannedMention[]; firstTerms: Map<string, string[]>; rivalFound: Set<string> } {
  const mentions: PlannedMention[] = []
  const firstTerms = new Map<string, string[]>()
  let at = 0
  for (const b of SEP_BRANDS) {
    for (let i = 0; i < b.all; i++, at++) {
      const video = `cat-${at}`
      mentions.push({
        brand: b.brand, excerpt: `${b.brand} bag`,
        row: { client_id: 'sealand', video_id: video, brand_key: b.key, source: 'content', field: 'caption', comment_id: null, comment_month: null, method: 'rule', rule_version: 'brands_v1' },
      })
      firstTerms.set(video, i < b.all - b.organic ? [b.term] : ['upcycled bag'])
    }
  }
  const brandFound = SEP_BRANDS.reduce((s, b) => s + b.all - b.organic, 0)
  const extra = SEP_RIVAL_FOUND - brandFound - 29
  for (let i = 0; i < 625 - at; i++) firstTerms.set(`cat-${at + i}`, i < extra ? ['freitag bag'] : ['upcycled bag'])
  for (let i = 0; i < 29; i++) firstTerms.set(`riv-${i}`, ['cotopaxi backpack'])
  const rivalFound = rivalFoundOf([...firstTerms].map(([id, terms]) => ({ id, terms })), new Set(SEP_RIVAL_TERMS))
  return { mentions, firstTerms, rivalFound }
}
