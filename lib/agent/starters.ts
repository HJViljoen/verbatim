import { makerWords } from '../pages/overview-market/board'
import type { AsksBlock, MarketTheme, ThemeBoard } from '../pages/overview-market/board'
import type { HeroLead } from '../pages/overview-market/hero'
import { CALIBRATION_WORDS, type SubjectCalibration } from '../subjects/calibration-state'

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

const LEADING = /^(confusion over|questions about|question about|interest in|frustration with|praise for|love for|requests for|request for|need for|demand for|worries about|concerns about|appreciation for|admiration for|respect for)\s+/i

/** A theme label's topic: the label without its leading noun phrase, first
 *  letter lowered. "Confusion over airline bag sizes" → "airline bag sizes". */
export function topicOf(label: string): string {
  const t = label.trim().replace(LEADING, '')
  return t.charAt(0).toLowerCase() + t.slice(1)
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

  // The lead theme the front page quotes, asked about by its topic.
  const lead = input.hero && input.hero.kind === 'themes' ? input.hero.lead : null
  const ask = (t: { label: string }) => `What does my market ask about ${topicOf(t.label)}?`
  if (lead) push(ask(lead), [themeRow(lead)])

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

  // The biggest subject on the market, in Subjects' own wording. A failed one
  // is being re-described and is never offered (decision C).
  const subject = [...(input.subjects ?? [])]
    .filter((s) => s.calibration !== 'failed' && s.market?.k != null && s.market.k > 0)
    .sort((a, b) => (b.market?.k ?? 0) - (a.market?.k ?? 0))[0]
  if (subject) {
    const maker = makerWords(subject.makerShare)
    const tags = [
      ...(subject.calibration === 'provisional' ? [CALIBRATION_WORDS.provisional] : []),
      ...(maker ? [maker] : []),
    ]
    push(`What does my market say about ${subject.label}?`, [{ kind: 'subject', label: `${subject.label}, a subject`, k: subject.market?.k ?? 0, tags }])
  }
  return out.slice(0, STARTERS_SHOWN)
}
