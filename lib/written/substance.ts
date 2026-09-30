// How much a quote says on its own (writer v3, 30 Sep). Pure.
//
// THE PROBLEM. The fit (lib/written/fit.ts) measures how close a quote's
// INSIGHT sits to the finding as written, and v2 printed the closest: "What is
// your recommendation for a checked bag?" under "Buyers compare bags by exact
// travel and carry needs", and "Now an umbrella. I come from using hiking
// bags…" under "Comfort is judged with weight in the bag". Each was on the
// theme, gated, and the best fit; neither says anything a reader can take away.
// A bare question claims nothing, and a line that opens mid-reply ("Now an
// umbrella.") needs the comment above it.
//
// THE GATE'S OWN SCORE DOES NOT CATCH THEM. `quoteGate` scores how squarely a
// line speaks to the block's claim (four a concept or shared stem), names the
// carry good, reads at card length and is its own English: the question scored
// 12 and the fragment 16 on the strict theme gate, both at the top, because
// they repeat the label's words ("recommendation", "comfort", "structure").
//
// THE RULE. The pool reads each quote option's FORM from its readable English
// while it still holds the words (lib/written/pool.ts `judgeTheme`) and keeps
// the form and the gate's score beside the ref; the words stay behind. Compose
// ranks a finding's options by the fit PLUS `SUBSTANCE_WEIGHT` times
// `substanceScore`: mostly the form (a self-contained line with a claim in it
// over a short statement, over a bare question or a fragment), a little the
// gate's score. A bare question or a fragment loses to a self-contained claim
// unless it fits the finding better by about a fifth of the cosine scale,
// which inside one finding's options (all strict-gated to the same themes)
// means the claim is about something else. v2's two lost by 0.015 and 0.054.

/** What a quote is, read from its words:
 *  · claim: self-contained, with a statement of at least five words;
 *  · statement: self-contained, but too short to claim anything;
 *  · question: nothing but a question (a word of greeting aside);
 *  · fragment: opens as a continuation of something the reader cannot see. */
export type QuoteForm = 'claim' | 'statement' | 'question' | 'fragment'

/** Kept beside a quote option's ref: its form and the strict gate's score. */
export interface QuoteSubstance {
  form: QuoteForm
  /** `quoteGate`'s score under the gate the option passed. */
  gate: number
}

/** How far substance can move a quote against the fit (a cosine). */
export const SUBSTANCE_WEIGHT = 0.25
/** The form's value; a bare question and a fragment are worth nothing. */
export const FORM_VALUE: Readonly<Record<QuoteForm, number>> = { claim: 1, statement: 0.5, question: 0, fragment: 0 }
/** The gate score counted in full at this: a concept and a stem plus the
 *  carry good and card length. More says the label's words again. */
export const GATE_SCORE_CAP = 12
/** The form's share of the substance score; the gate's score has the rest. */
const FORM_SHARE = 0.8

/** Substance, 0 to 1: mostly the form, a little the gate's score. An option
 *  with none recorded (a pool saved before v3) is 0, so the fit alone decides
 *  between such options, as it did. */
export function substanceScore(s: QuoteSubstance | null | undefined): number {
  if (!s) return 0
  const gate = Math.min(Math.max(Number.isFinite(s.gate) ? s.gate : 0, 0), GATE_SCORE_CAP) / GATE_SCORE_CAP
  return FORM_SHARE * FORM_VALUE[s.form] + (1 - FORM_SHARE) * gate
}

/** An option's value for a finding: its fit (0 where there is none) plus its
 *  substance at `SUBSTANCE_WEIGHT`. */
export const quoteValue = (fit: number | null | undefined, s: QuoteSubstance | null | undefined): number =>
  (fit ?? 0) + SUBSTANCE_WEIGHT * substanceScore(s)

// ---- Reading the form ----------------------------------------------------------------------

const EMOJI = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}️‍]/gu

/** The sentences of a line, emoji out, each with its closing marks. A sentence
 *  needs a letter. */
export function sentencesOf(text: string): string[] {
  const t = (text ?? '').replace(EMOJI, ' ').replace(/\s+/g, ' ').trim()
  return (t.match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? []).map((s) => s.trim()).filter((s) => /\p{L}/u.test(s))
}

const wordsIn = (s: string): number => (s.match(/[\p{L}\p{N}'’]+/gu) ?? []).length

/** A question with no question mark: a wh-word ("what a bag" is not one), or
 *  a verb before its subject ("do you have", "is this"), after a greeting or a
 *  "but". Only on a short line: a long run-on that opens "Why is it worth…"
 *  goes on to say something. */
const QUESTION_OPENER = /^(?:(?:but|and|so|ok(?:ay)?|also|hey|hi|wait|um+|hmm+|then)[,\s]+)?(?:(?:what(?!\s+an?\b)|which|where|when|why|who|whose|how)\b(?!['’])|(?:do|does|did|is|are|was|were|can|could|would|will|should|has|have|had|may|might)\s+(?:you|u|they|it|this|that|these|those|i|we|he|she|anyone|anybody|someone|somebody|there|the|a|an|your|any)\b)/i
const QUESTION_OPENER_MAX_WORDS = 12

/** Is this sentence a question? */
export function isQuestion(sentence: string): boolean {
  const s = sentence.trim()
  if (/\?[.!?…]*$/.test(s)) return true
  if (/!+$/.test(s)) return false
  return wordsIn(s) <= QUESTION_OPENER_MAX_WORDS && QUESTION_OPENER.test(s)
}

/** Words a reply opens with that carry on from what it answers: a line that
 *  begins with one needs the comment above it. */
const CONTINUES = /^(?:\.{2,}|…|(?:and|but|also|plus|or|which|same|too|as well|either|neither|except|unless|although|though)\b(?!['’]))/i
/** Words that carry on only where the opening sentence is a stub: "Now an
 *  umbrella." does, "Now I carry my laptop without pain." does not. */
const CONTINUES_IF_SHORT = /^(?:now|then|so)\b(?!['’])/i
const STUB_WORDS = 4

/** Does the line open mid-thought? */
export function opensMidThought(text: string): boolean {
  const first = sentencesOf(text)[0]
  if (!first) return false
  if (CONTINUES.test(first)) return true
  return CONTINUES_IF_SHORT.test(first) && wordsIn(first) <= STUB_WORDS
}

/** A statement long enough to claim something. */
const CLAIM_WORDS = 5
/** A statement shorter than this is a greeting or an exclamation ("Wow."),
 *  which does not stop a line from being a bare question. */
const CONTENT_WORDS = 3

/**
 * The form of a quote, from its readable English (`readableEnglish`,
 * lib/quote-gate.ts). In order: a fragment (it opens mid-thought), a bare
 * question (questions and nothing else of three words or more), a claim (a
 * statement of at least five words), else a statement. Pure.
 */
export function quoteForm(english: string): QuoteForm {
  const sentences = sentencesOf(english)
  if (sentences.length === 0) return 'statement'
  if (opensMidThought(english)) return 'fragment'
  const statements = sentences.filter((s) => !isQuestion(s))
  if (statements.length < sentences.length && !statements.some((s) => wordsIn(s) >= CONTENT_WORDS)) return 'question'
  return statements.some((s) => wordsIn(s) >= CLAIM_WORDS) ? 'claim' : 'statement'
}
