import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'

// The segment judge's per-tenant hints (segments_v2, plan WP3.2; CQ F105).
//
// WHY PER TENANT. "Maker" is category-specific (CQ constraint 7): Sealand's
// non-buyer content is sewing and craft, Össur's is lived experience and
// inspiration, with DIY only 5% of it. So the judge asks one general question,
// who a video's comment section is RELATIVE TO THE BUYER (buyer,
// buyer-adjacent, maker, off-topic, other), and each tenant says what those
// five mean in its market. The words below are the research's own class
// definitions and examples, from its hand-labelled samples (CQ §C, 150 Sealand
// videos; CQ §D, 60 Össur videos), not new judgement.
//
// A TENANT WITH NO HINTS IS NOT JUDGED. The judge refuses a batch for it
// (lib/segments/judge.ts), so a new tenant gets the free segments_v1 rule, or
// no rule, until its hints are written and checked.
//
// Two tracking settings sharpen the hints when the caller has them:
//   - `exclude_terms`, the client's own homonyms ("Cotopaxi the volcano"),
//     named the way the relevance gate names them (lib/gather/relevance.ts);
//   - `tracking_configs.market_description` (MF3, operator-only), which, once it
//     exists and is set, replaces the one-line market below.

export interface SegmentHints {
  /** What the market is: what its buyers buy. One line. */
  market: string
  /** The five roles, in this market's words. */
  buyer: string
  buyerAdjacent: string
  maker: string
  offTopic: string
  other: string
}

export const SEGMENT_HINTS: Readonly<Record<string, SegmentHints>> = {
  // CQ §C classes B, BA, M, N and O, with the examples of facts 19 and 20.
  [SEALAND_CLIENT_ID]: {
    market: 'bags, backpacks, luggage, packing and carry, including sustainable, recycled or upcycled bags bought as products',
    buyer:
      'people who buy, carry or compare bags, backpacks or luggage: reviews, packing, sizing, price, where to buy. '
      + 'A finished handmade bag shown for sale counts when its viewers ask the price or where to buy it. '
      + 'Content about another bag brand’s products counts',
    buyerAdjacent: 'sustainable or secondhand clothing, and outdoor gear that is not a bag',
    maker:
      'sewing, crochet, knitting, craft or upcycling how-tos and showcases of the making: jeans turned into a bag, '
      + 'plastic-bottle bags, quilting and sewing threads, crochet tutorials, bags from plastic bags or toilet rolls; '
      + 'also content about running a maker business, such as packaging rules for a bag maker or how a maker gets orders',
    offTopic:
      'videos a search word matched by accident: poker or gaming found by "poler", the Patagonia region’s scenery or folk music, '
      + 'Ecuador’s politics or its volcano found by "cotopaxi", Navy SEAL podcasts or a BYD Seal car found by "sealand gear", '
      + 'Friday news found by "freitag", Topo Athletic running shoes found by "topo designs", a food vlog or a condo tour',
    other: 'travel or outdoor lifestyle where the gear is incidental, documentaries about how goods are made and shipped, business-to-business content',
  },
  // CQ §D classes B, O, M and N (fact 35) and the by-keyword examples (fact 36).
  // The research named no buyer-adjacent class for Össur; the line below keeps
  // the role narrow so it is used sparingly.
  [OSSUR_CLIENT_ID]: {
    market: 'prostheses and prosthetic care: legs, arms, feet, liners and sockets',
    buyer:
      'people who use, buy or are fitted with prostheses: fit, cost, insurance, liners, sockets, function, customisation, how one works. '
      + 'Content about another maker’s prostheses, such as Ottobock’s, counts',
    buyerAdjacent: 'orthotics and other mobility aids that are not prostheses',
    maker: 'DIY or 3D-printed prosthetics made by hobbyists or makers',
    offTopic:
      'videos a search word matched by accident: games (an Assassin’s Creed update found by "#runningblade"), story channels, '
      + 'devotee content, donation pleas, re-uploaded viral stories',
    other: 'lived experience or inspiration with no product talk: motivation reels, humour, health updates, the Paralympic classification debate',
  },
}

/** The tenant's hints, or null: no hints, no judge. */
export function segmentHintsFor(clientId: string): SegmentHints | null {
  return SEGMENT_HINTS[clientId] ?? null
}

/** What the caller may know from the tenant's tracking settings. */
export interface HintSettings {
  /** tracking_configs.exclude_terms: other senses of the brand names. */
  excludeTerms?: readonly string[] | null
  /** tracking_configs.market_description (MF3; operator-only). */
  marketDescription?: string | null
}

/** The hints with the tracking settings folded in: the market line replaced by
 *  a stored description, and the homonyms listed once, trimmed and deduped. */
export function resolvedHints(hints: SegmentHints, settings: HintSettings = {}): { hints: SegmentHints; homonyms: string[] } {
  const description = settings.marketDescription?.trim()
  const homonyms = [...new Set((settings.excludeTerms ?? []).map((t) => `${t}`.trim()).filter(Boolean))]
  return { hints: description ? { ...hints, market: description } : hints, homonyms }
}
