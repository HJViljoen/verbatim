import { COMPETITOR_QUESTIONS_MAX } from '../../config'
import type { DocumentTemplate } from './templates'
import type { DocumentSettings } from './types'
import type { MergedConcern } from './merge'

/**
 * The researcher's questions (pure). Fixed anchors first, the register's
 * question when the reader sells through professionals or shops, one per
 * included competitor, then the update's loudest concerns until the cap.
 * Anchors outnumber the data-driven questions on purpose: the brief reads
 * the same way each week because it asks the same things each week, and the
 * week's own concerns add to that, they do not replace it.
 *
 * The cap RISES to fit the anchors (WP7d, 2026-09-12). `max` sized the four
 * fixed templates, whose anchors have always fitted inside it; a composed
 * template asks its selected topic blocks' questions too, and a block "that
 * must be included" (Heinrich, 2026-08-30) is not included if its questions
 * are sliced off the end. So no anchor is ever dropped: the update's own
 * concerns are what yields, as they already did. The real ceiling stays the
 * build's dollar budget, which the picker is sized against
 * (templates.affordableBlocks).
 */

export interface ResearchQuestion {
  id: string
  text: string
  purpose: 'anchor' | 'register' | 'competitor' | 'concern'
  competitor?: string
  concernId?: string
}

/**
 * The market the brief asks about (`{market}`).
 *
 * THE STORED ONE-SENTENCE DESCRIPTION FIRST (WP3.11, plan §2.9; GA F41–F42):
 * `tracking_configs.market_description` (MF3), the market in the operator's
 * own words, read as a noun phrase with its closing stop taken off. The first
 * three industry keywords stood in for it, and their stored order moved the
 * phrase three times in a fortnight ("sustainable backpack, recycled bag,
 * upcycled bag", then "upcycled bag, recycled bag, sailcloth bag", then "eco
 * backpack, handmade bag, recycled bag"), twice leading with a maker's term.
 * Until the column exists, or where it is empty, the words are today's:
 * "products like Össur's (prosthetic leg, prosthetic arm)". A hashtag is a
 * search term, not a noun.
 */
export function marketPhrase(company: string, industryKeywords: string[], description?: string | null): string {
  const said = (description ?? '').trim().replace(/[.!?]+$/, '').trim()
  if (said) return said
  const words = industryKeywords
    .map((k) => k.trim())
    .filter((k) => k && !k.startsWith('#'))
    .map((k) => k.replace(/^#/, ''))
    .filter((k, i, arr) => arr.indexOf(k) === i)
    .slice(0, 3)
  const own = `products like ${possessive(company)}`
  return words.length ? `${own} (${words.join(', ')})` : own
}

export const possessive = (name: string): string => (/s$/i.test(name) ? `${name}'` : `${name}'s`)

export function composeQuestions(
  template: DocumentTemplate,
  s: {
    company: string
    industryKeywords: string[]
    /** `tracking_configs.market_description` (MF3); null or absent until it
     *  exists, and `{market}` then keeps today's words. */
    marketDescription?: string | null
    /** `topic`: whether the brand clears as a topic in the market this month
     *  (`month_brand_readings`, MF3). Only `true` earns a per-rival question. */
    competitors: { name: string; thin: boolean; topic?: boolean | null }[]
    concerns: MergedConcern[]
  },
  settings: DocumentSettings,
  max: number,
): ResearchQuestion[] {
  const market = marketPhrase(s.company, s.industryKeywords, s.marketDescription)
  const fill = (text: string, competitor?: string) =>
    text.replace(/\{market\}/g, market).replace(/\{company\}/g, s.company).replace(/\{competitor\}/g, competitor ?? '')

  const out: ResearchQuestion[] = []
  for (const a of template.anchors) {
    if (a.perCompetitor) continue
    if (a.sellsTo && !a.sellsTo.includes(settings.sellsTo)) continue
    out.push({ id: a.id, text: fill(a.text), purpose: a.sellsTo ? 'register' : 'anchor' })
  }
  const perCompetitor = template.anchors.find((a) => a.perCompetitor)
  if (perCompetitor) {
    // Two at most: a third competitor's card is written from the signals alone.
    // AND ONLY A BRAND THAT CLEARS AS A TOPIC (WP3.11, plan §2.9): the market
    // names it in 10 or more of 100 or more videos this month. A rival the
    // market barely mentions (Freitag, mostly the German word for Friday; a
    // brand of 6 videos) gets no question of its own, whatever its place in
    // the tracked list; where the brand readings are not there yet, no brand
    // is known to clear and none is asked about.
    for (const c of s.competitors.filter((x) => x.topic === true).slice(0, COMPETITOR_QUESTIONS_MAX)) {
      out.push({ id: `${perCompetitor.id}:${slug(c.name)}`, text: fill(perCompetitor.text, c.name), purpose: 'competitor', competitor: c.name })
    }
  }
  // Every anchor asked, then the update's concerns in whatever room is left.
  const cap = Math.max(max, out.length)
  const room = Math.max(0, Math.min(3, cap - out.length))
  // The loudest concerns, but not one that an anchor already covers head on:
  // the anchors ask about cost and hesitation; a concern literally about
  // price would spend a question twice.
  const covered = /\b(price|cost|afford|insurance|payment|pay)\b/i
  const concerns = s.concerns.filter((c) => !covered.test(c.label)).slice(0, room)
  for (const c of concerns) {
    out.push({
      id: `concern:${c.id}`,
      text: c.description
        ? `${c.description.replace(/\s+$/, '').replace(/([^.!?])$/, '$1.')} What do people say about this, and what would settle it for them?`
        : `What do people say about ${lower(c.label)}, and what would settle it for them?`,
      purpose: 'concern',
      concernId: c.id,
    })
  }
  return out.slice(0, cap)
}

const lower = (label: string) => label.replace(/^([A-Z])/, (m) => m.toLowerCase())
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
