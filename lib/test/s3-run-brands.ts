import type { PlannedMention } from '../brands/mentions'
import type { MonthVideo } from '../provenance/searches'

// Sealand's September brand topics on staging (plan §2.5 B1; BC F35 without
// the client audience): the market's 654 videos (625 in the category, 29
// filed under a brand you track), and the brands they come up in, "in all" and
// "without our own rival searches": Patagonia 47 and 33, The North Face 36 and
// 11, Cotopaxi 31 and 11. Video ids are labels; which search found each is
// what makes a video organic or not. The split of each brand's videos between
// content and comment, and between audiences, is not in the research: every
// match here is in the content and in the category (HYPOTHETICAL, named so).

export const SEP = '2026-09-01'
export const PATAGONIA = 'b0000000-0000-4000-8000-00000000000a'
export const NORTH_FACE = 'b0000000-0000-4000-8000-00000000000b'
export const COTOPAXI = 'b0000000-0000-4000-8000-00000000000c'

/** 625 category videos and 29 rival-filed ones (Cotopaxi's, a label). */
export const SEP_MARKET: MonthVideo[] = [
  ...Array.from({ length: 625 }, (_, i) => ({ id: `cat-${i}`, platform: 'tiktok', audience: 'industry-other', dated: 10 })),
  ...Array.from({ length: 29 }, (_, i) => ({ id: `riv-${i}`, platform: 'tiktok', audience: 'competitor:Cotopaxi', dated: 10 })),
]

/** brand, videos in all, of which found only by its own searches, its own search term. */
export const SEP_BRANDS = [
  { brand: 'Patagonia', key: PATAGONIA, all: 47, organic: 33, term: 'patagonia' },
  { brand: 'The North Face', key: NORTH_FACE, all: 36, organic: 11, term: 'the north face' },
  { brand: 'Cotopaxi', key: COTOPAXI, all: 31, organic: 11, term: 'cotopaxi backpack' },
] as const

/** The content mentions and each video's first-found terms that reproduce
 *  those figures: each brand's videos are its own block of the category, the
 *  first `all - organic` found only by its own term. */
export function sepMentions(): { mentions: PlannedMention[]; firstTerms: Map<string, string[]> } {
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
  return { mentions, firstTerms }
}
