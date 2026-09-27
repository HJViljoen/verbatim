import { windowEnd, type ReadingMonth } from '../reading/reading-month'

/**
 * What an Ask question is about, and the window it is read over (market-first
 * plan §2.8, WP3.9). Pure: the loaders hand in the names; nothing here reads.
 *
 * THE QUESTION'S OWN WORDS DECIDE, NEVER THE MODEL'S. A subject, a rival, a
 * kind or the mood is "named" when the question the client typed names it:
 * Subjects' "Ask about this" sends a question that carries the subject's own
 * name ("What does my market say about Waterproofing?"), so the link lands on
 * that subject's own figure without a parameter of its own; Conversation's
 * quotes its theme's label, whose words are a name (`withoutQuoted`).
 * The interpret step's queries are a model's rewrite and are not read here: a
 * model that could widen the scope by phrasing a query would decide whose
 * voices an answer rests on.
 */

/** The window's length by default (plan §2.8: "the default window is 90 days,
 *  with an 'all time' switch"). */
export const ASK_WINDOW_DAYS = 90

/** The two windows a reader may pick. */
export type AskWindowChoice = 'days90' | 'all'

/** `?window=` on the Ask pages, and the field the composer posts. */
export const ASK_WINDOW_PARAM = 'window'

/** The reader's words for each window. */
export const ASK_WINDOW_WORDS: Record<AskWindowChoice, string> = {
  days90: 'Last 90 days',
  all: 'All time',
}

/** Anything but "all" is the default. */
export function parseAskWindow(raw: unknown): AskWindowChoice {
  return raw === 'all' ? 'all' : 'days90'
}

/** The most of a sent question the Ask box takes (Conversation's link cuts
 *  its question to the same length, lib/pages/voice-surface.ts `ASK_MAX`). */
export const ASK_SENT_MAX = 300

/**
 * The question another page sent the reader to Ask with (`?ask=`, Subjects'
 * and Conversation's "Ask about this", Ask's own starter cards): the first
 * value where the address repeats it, trimmed, at most `ASK_SENT_MAX`
 * characters. Undefined when there is none or it is blank, so the box opens
 * empty rather than on spaces.
 */
export function sentQuestion(raw: unknown): string | undefined {
  const first = Array.isArray(raw) ? raw[0] : raw
  if (typeof first !== 'string') return undefined
  const q = first.trim().slice(0, ASK_SENT_MAX)
  return q ? q : undefined
}

const DAY_MS = 86_400_000

/**
 * The window, as half-open `[from, to)` days, dated by the comment.
 *
 * IT ENDS WHERE THE PAGES' 90-DAY WINDOWS END, NEVER AT THE CLOCK
 * (`windowEnd`, plan §4.2): the reading month's end or its last update,
 * whichever is earlier. On 1 to 15 October every page reads September, and a
 * window that ran to the clock would put October's first days into an answer
 * the page beside it does not hold. `to` is the day after the last one, so the
 * window holds exactly `ASK_WINDOW_DAYS` days. Null for all time.
 */
export function askWindow(reading: ReadingMonth | null, choice: AskWindowChoice, now: string): { from: string; to: string } | null {
  if (choice === 'all') return null
  const end = reading ? windowEnd(reading) : now
  const endMs = Date.parse(end)
  const base = Number.isFinite(endMs) ? endMs : Date.parse(now)
  // A month's end is the next month's first instant, already exclusive; an
  // update's instant falls inside its day, so the day after it is the end.
  const last = new Date(base)
  const midnight = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate())
  const to = new Date(midnight === base ? midnight : midnight + DAY_MS)
  const from = new Date(to.getTime() - ASK_WINDOW_DAYS * DAY_MS)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

/** Accents folded and case dropped, the way a reader types a name ("Ossur"
 *  for "Össur", "cotopaxi" for "Cotopaxi"). */
export const foldText = (s: string): string => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Does `text` name `name` as a whole word or phrase? "Looks & style" is named
 * by "looks and style" too, because a reader types the word and a subject's
 * name may carry the symbol. A name under three characters is never matched:
 * two letters inside a sentence are a word, not a brand.
 */
export function names(text: string, name: string): boolean {
  const folded = foldText(name).trim()
  if (folded.length < 3) return false
  const t = ` ${foldText(text).replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ')} `
  const n = folded.replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  if (!n) return false
  return new RegExp(`\\s${escape(n)}(s|es)?\\s`, 'u').test(t)
}

/** The names a question names, in the order given. */
export function namedIn<T extends { name: string }>(text: string, items: readonly T[]): T[] {
  return items.filter((i) => names(text, i.name))
}

/**
 * The kinds a question asks about, by the words a reader uses for them.
 *
 * A SHORT LIST ON PURPOSE. Each entry is a word that names what people were
 * doing in the reader's own vocabulary (lib/reading/kinds.ts `KIND_LABELS`),
 * so "what does my market complain about" reads the problems kind and "what
 * makes people ready to buy" the buying kind. A word that could name two kinds
 * names neither.
 */
export const KIND_WORDS: Readonly<Record<string, readonly string[]>> = {
  question: ['ask', 'asks', 'asked', 'asking', 'question', 'questions'],
  pain_point: ['complain', 'complains', 'complaint', 'complaints', 'problem', 'problems', 'frustration', 'frustrated'],
  praise: ['praise', 'praising', 'love', 'loves'],
  purchase_intent: ['buy', 'buying', 'purchase', 'ready to buy'],
  objection: ['push back', 'pushing back', 'objection', 'objections'],
  feature_request: ['wish', 'wishes', 'wished', 'wish for', 'request', 'requests'],
  switching_signal: ['switch', 'switching', 'leaving'],
}

/**
 * The question without the names it quotes.
 *
 * A QUOTED LABEL IS A NAME, NOT THE READER'S WORDS ABOUT WHAT PEOPLE DID.
 * Conversation's "Ask about this" sends the open theme's label in quotation
 * marks ("What is behind “Buying interest and ordering questions” in
 * September?"), and a theme label leads with what its people were doing
 * ("Praise for", "Frustration with", "… questions"). Read as the reader's own
 * words, Sealand's September labels on staging named the "asking how it
 * works" and "ready to buy" kinds, "saying it worked" and "hitting a
 * problem": readings of the whole market beside an answer about one theme. A
 * kind and the mood are named only by the words around the quotation. A
 * subject or a brand inside it is still a name (`namedIn` reads the whole
 * question): "Price and sale questions" names Price.
 */
export function withoutQuoted(text: string): string {
  return text.replace(/“[^”]*”/g, ' ')
}

export function kindsNamedIn(text: string): string[] {
  const t = ` ${foldText(withoutQuoted(text)).replace(/[^\p{L}\p{N}]+/gu, ' ')} `
  return Object.entries(KIND_WORDS)
    .filter(([, words]) => words.some((w) => t.includes(` ${w} `)))
    .map(([kind]) => kind)
}

/** Does the question ask how the market feels? */
export const MOOD_WORDS: readonly string[] = ['mood', 'feel', 'feels', 'feeling', 'sentiment', 'positive', 'negative', 'warm', 'warming']

export function moodAsked(text: string): boolean {
  const t = ` ${foldText(withoutQuoted(text)).replace(/[^\p{L}\p{N}]+/gu, ' ')} `
  return MOOD_WORDS.some((w) => t.includes(` ${w} `))
}
