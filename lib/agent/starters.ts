import { makerWords } from '../pages/overview-market/board'
import type { AsksBlock, MarketTheme, ThemeBoard } from '../pages/overview-market/board'
import type { HeroLead } from '../pages/overview-market/hero'
import type { SubjectCalibration } from '../subjects/calibration-state'

/**
 * Ask's starter questions, written by code from the front page's biggest
 * objects (market-first plan §2.8, WP3.9).
 *
 * WHY CODE AND NOT A MODEL, AND WHY THE FRONT PAGE. A reader who opens Ask
 * has just read Your market; the questions that page raises are the ones worth
 * one click. So each card is one of its objects (the lead theme, the asks, the
 * biggest buying theme, the biggest subject) with the object's own count
 * under it, and the question is a template filled with the object's words. No
 * model writes them, so nothing here can promise what the page does not hold,
 * and no card costs a cent until the reader presses Ask.
 *
 * THE WORDING IS THE READER'S. A theme label is a model's noun phrase
 * ("Confusion over airline bag sizes"); a question asks about its topic, so a
 * leading "Confusion over", "Questions about" or "Interest in" is taken off
 * (`topicOf`) and the rest is asked about verbatim. A subject's question is the
 * one Subjects' "Ask about this" sends, so both land on the subject's own
 * figure (lib/agent/scope.ts).
 */

/** One row under a card: the object it was written from, with its count. */
export interface StarterRow {
  /** A theme's label is a model's (`pass_b_theme`); a subject's name is the
   *  client's own. The card marks which. */
  kind: 'theme' | 'subject'
  label: string
  /** Videos in the reading month (the category's for a theme, the market's
   *  for a subject). */
  k: number
  /** "about a third makers", "provisional": the tags the front page prints
   *  beside the same row. */
  tags: string[]
}

export interface StarterQuestion {
  question: string
  rows: StarterRow[]
}

/** At most this many cards: the preview's two rows of three. */
export const STARTERS_SHOWN = 6

const LEADING = /^(confusion|questions?|interest|curiosity|frustrations?|praise|love|requests?|needs?|demand|worries|concerns?|complaints?|appreciation|admiration|respect|excitement|doubts?)\s+(over|about|in|with|for|on|around|regarding)\s+/i

/** A trailing "questions" says again what "ask about" already says. */
const TRAILING = /\s+(questions?)$/i

/** A theme label's topic: the label without its leading noun phrase or a
 *  trailing "questions", first letter lowered. "Confusion over airline bag
 *  sizes" → "airline bag sizes"; on staging's 20 Sep update, "Confusion about
 *  airline size rules" → "airline size rules" and "Price and sale questions"
 *  → "price and sale", where the card had read "ask about confusion about
 *  airline size rules" and "ask about price and sale questions". A first word
 *  that is a name ("TikTok", "USB-C") keeps its capital: it carries another
 *  capital after its first letter. The one copy: Your moves' "In one line"
 *  (lib/pages/market-line.ts) names its themes with it too. */
export function topicOf(label: string): string {
  const t = label.trim().replace(LEADING, '').replace(TRAILING, '')
  const first = t.split(/\s/)[0] ?? ''
  if (/[A-Z]/.test(first.slice(1))) return t
  return t.charAt(0).toLowerCase() + t.slice(1)
}

/**
 * The question about one theme, asked by its topic: the lead's starter card,
 * and the question Conversation's "Ask about this" sends for the theme it has
 * open, so both land on the same question, as Subjects' link and the subject
 * card do (the approved preview: Conversation's lead, "Confusion over airline
 * bag sizes", is asked on Ask as "What does my market ask about carry-on
 * sizes?"). "Ask about" only where the theme IS a question: Össur's lead on
 * staging is "Admiration for personal resilience", and "What does my market
 * ask about personal resilience?" claimed questions the theme does not hold.
 * No month: the answer reads the window and names its month itself, and a
 * month in the question would say August over an answer read on September
 * when the reader had Conversation on August.
 */
export function themeQuestion(t: { label: string; kind: string | null }): string {
  return `What does my market ${t.kind === 'question' ? 'ask' : 'say'} about ${topicOf(t.label)}?`
}

const themeRow = (t: Pick<MarketTheme, 'label' | 'k' | 'makerShare'>): StarterRow => {
  const maker = makerWords(t.makerShare)
  return { kind: 'theme', label: t.label, k: t.k, tags: maker ? [maker] : [] }
}

export interface StarterInput {
  themes?: ThemeBoard | null
  hero?: HeroLead | null
  asks?: AsksBlock | null
  /** The front page's subject rows, with their market level (decision E). */
  subjects?: readonly { label: string; calibration?: SubjectCalibration | null; market?: { k: number | null } | null; makerShare?: number | null }[]
}

/**
 * The cards, in the front page's order: what buys, the lead's question, the
 * other questions, the complaints, the wishes, the biggest subject. Pure. A
 * card with no object behind it is not written, so a thin month has fewer
 * cards rather than empty ones.
 */
export function starterQuestions(input: StarterInput): StarterQuestion[] {
  const out: StarterQuestion[] = []
  const seen = new Set<string>()
  const push = (question: string, rows: StarterRow[]) => {
    if (rows.length === 0 || seen.has(question)) return
    seen.add(question)
    out.push({ question, rows })
  }
  const board = input.themes?.rows ?? []

  // What makes people ready to buy: the biggest buying theme on the board.
  const buying = board.find((t) => t.kind === 'purchase_intent')
  if (buying) push('What makes people ready to buy?', [themeRow(buying)])

  // The lead theme the front page quotes, asked about by its topic
  // (`themeQuestion`, the question Conversation's "Ask about this" sends).
  const lead = input.hero && input.hero.kind === 'themes' ? input.hero.lead : null
  if (lead) push(themeQuestion(lead), [themeRow(lead)])

  const lists = input.asks?.lists ?? []
  const listOf = (kind: string) => lists.find((l) => l.kind === kind)?.rows ?? []
  const shareOf = (id: string) => board.find((t) => t.registryId === id)?.makerShare ?? null
  // The next question on the asks list, asked about by its topic.
  const nextQuestion = listOf('question').find((r) => r.registryId !== lead?.registryId)
  if (nextQuestion) push(`What do people ask about ${topicOf(nextQuestion.label)}?`, [themeRow({ ...nextQuestion, makerShare: shareOf(nextQuestion.registryId) })])
  // The complaints and the wishes, each as the list the front page prints.
  const pains = listOf('pain_point').slice(0, 2)
  if (pains.length) push('What does my market complain about?', pains.map((r) => themeRow({ ...r, makerShare: shareOf(r.registryId) })))
  const wishes = listOf('feature_request').slice(0, 2)
  if (wishes.length) push('What does my market wish for?', wishes.map((r) => themeRow({ ...r, makerShare: shareOf(r.registryId) })))

  // The biggest subject on the market, in Subjects' own wording. ONLY A READY
  // ONE (T0a, AK-4; ruling U6): a provisional subject's count, its rank and
  // its maker share all rest on its unverified matching, and a failed one is
  // being re-described.
  const subject = [...(input.subjects ?? [])]
    .filter((s) => s.calibration === 'ready' && s.market?.k != null && s.market.k > 0)
    .sort((a, b) => (b.market?.k ?? 0) - (a.market?.k ?? 0))[0]
  if (subject) {
    const maker = makerWords(subject.makerShare)
    const tags = [...(maker ? [maker] : [])]
    push(`What does my market say about ${subject.label}?`, [{ kind: 'subject', label: `${subject.label}, a subject`, k: subject.market?.k ?? 0, tags }])
  }
  return out.slice(0, STARTERS_SHOWN)
}
