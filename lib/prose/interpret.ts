import { isAnswer, type Verdict } from '../reading/verdicts'
import type { FigureTable } from '../reports/types'

import { INTERPRETATION_SLOTS, scrubProse, splitSentences, type ProseScrub } from './scrub'

// The three places the model may argue (design §7, item 9).
//
// Everywhere else in this product the model describes and code rates. In these
// three the model is allowed to say why and so what — the monthly report's two
// sentences, the quarterly review's page, the weekly report's explanation of an
// unusual week — and each one carries the word *Interpretation* on the page, set
// apart from the record.
//
// WHAT IT IS ALLOWED TO ARGUE FROM, and nothing else: the verdicts code issued
// and the figures code computed. It never earns a direction word (three
// readings do that), and never holds a quote's words — a quote travels as a ref
// and resolves at render, so the freeze discipline holds and a digit inside
// somebody's sentence cannot cost the product its own.
//
// THE NUMBERS IT DOES AND DOES NOT SEE. A FIGURE is a key and a label and never
// a value: a figure is what the prose will cite, the surface substitutes it at
// render, and a model that had seen "3.42%" would type "about 3%" into a
// sentence the product then has to stand behind. A VERDICT carries its numbers
// — change, band and n — because a verdict is what the prose may ARGUE FROM,
// and an argument from a claim without its n is not checkable: whether 5.4
// points against a band of ±4.1 on 28 videos is worth a sentence is exactly
// the judgement these three slots exist to make. Those numbers are the model's
// evidence and not its output; any it types into prose is deleted with its
// sentence by the digit rule, which is what keeps the distinction honest
// rather than hoped-for.
//
// WHAT HAPPENS WHEN IT SAYS NOTHING USABLE. The scrubbers can empty a slot, and
// the model can be unavailable, refuse, or have nothing to work with because
// nothing cleared a band. All four end the same way: the product writes the
// slot itself, out of the same verdicts, and says on the page that it did.
// "A brief that loses all its sentences falls back to code-composed prose and
// says so" is the design's line, and the saying-so is the part that makes the
// label honest — a reader who cannot tell our sentence from the model's cannot
// calibrate either.

export type InterpretationSlot = (typeof INTERPRETATION_SLOTS)[number]

/** The word every one of these carries on the page. Not configurable: the
 *  label is what makes the slot legible as the exception it is. */
export const INTERPRETATION_LABEL = 'Interpretation'

/** A quote as it travels: a ref and who said it, never the words. The surface
 *  resolves the ref at render (lib/renderables/quotes-freeze.ts), and a quote
 *  is a SIBLING of the prose, never a span inside it. */
export interface QuoteRef {
  ref: string
  /** For the model's shortlist only — the audience and platform, no text. */
  context?: string
}

export type FallbackReason = 'no_model' | 'nothing_usable' | 'nothing_moved'

export interface Interpretation {
  slot: InterpretationSlot
  /** The word the surface prints above it. */
  label: typeof INTERPRETATION_LABEL
  /** Sentences, in order, with `[[key]]` figure tokens intact. */
  sentences: string[]
  /** The quotes shown beside it, as refs. */
  quotes: QuoteRef[]
  /** True when the product wrote this, not the model. */
  fallback: boolean
  reason?: FallbackReason
  /** Retired 2026-09-24 (copy de-clutter L9): "We wrote this read ourselves"
   *  is an internal distinction a reader cannot act on, so nothing sets it. */
  note?: string
  scrub: ProseScrub
}

const EMPTY_SCRUB: ProseScrub = { text: '', dropped: 0, droppedDigits: 0, droppedDirection: 0, flaggedDirection: 0, leaked: false }

/** How many quotes each slot shows beside its prose. WK1 says two. Exported
 *  because a caller that groups refs per object has to cap each group at the
 *  same number the slot will print. */
export const QUOTE_LIMIT: Record<InterpretationSlot, number> = {
  interpretation_monthly: 2,
  interpretation_quarterly: 4,
  interpretation_anomaly: 2,
}

/** How many sentences each slot may run to. MR is two sentences by design; the
 *  quarterly review is a page; the anomaly explanation is a paragraph. */
const SENTENCE_LIMIT: Record<InterpretationSlot, number> = {
  interpretation_monthly: 2,
  interpretation_quarterly: 18,
  interpretation_anomaly: 5,
}

export interface ComposeOptions {
  /** The model's prose, if there is any. Figure tokens intact, quotes NOT
   *  inside it. Absent, empty or scrubbed to nothing → the product writes the
   *  slot itself and says so. */
  draft?: string | null
  /** The run's allow-list of digit-bearing product names. */
  allow?: readonly string[]
}

/**
 * The one composer for the three labelled slots.
 *
 * Runs the slot's policy over the model's draft — both scrubbers, because these
 * are the only slots handed verdicts in the first place — and falls back to
 * code-composed prose when nothing usable survives.
 */
export function composeInterpretation(
  slot: InterpretationSlot,
  verdicts: readonly Verdict[],
  figures: FigureTable,
  quotes: readonly QuoteRef[],
  options: ComposeOptions = {},
): Interpretation {
  const shown = quotes.slice(0, QUOTE_LIMIT[slot])
  const draft = (options.draft ?? '').trim()

  if (draft) {
    const scrub = scrubProse(slot, draft, { figures, verdicts, allow: options.allow })
    const sentences = splitSentences(scrub.text).slice(0, SENTENCE_LIMIT[slot])
    if (sentences.length > 0) {
      return { slot, label: INTERPRETATION_LABEL, sentences, quotes: shown, fallback: false, scrub }
    }
    return { ...fallbackFor(slot, verdicts, figures, shown, 'nothing_usable'), scrub }
  }
  return fallbackFor(slot, verdicts, figures, shown, 'no_model')
}

/** The product's own read, from the same verdicts. */
function fallbackFor(
  slot: InterpretationSlot,
  verdicts: readonly Verdict[],
  figures: FigureTable,
  quotes: readonly QuoteRef[],
  reason: FallbackReason,
): Interpretation {
  const moved = verdicts.filter((v) => v.state === 'moved')
  const answered = verdicts.filter((v) => isAnswer(v.state))
  const refused = verdicts.filter((v) => v.state === 'refused')
  const thin = verdicts.filter((v) => v.state === 'too_little_data' || v.state === 'baseline_forming')
  const sentences: string[] = []

  if (slot === 'interpretation_monthly') {
    // The design's own gate sentence, verbatim (§3 line 223).
    if (moved.length === 0) sentences.push('Nothing moved clearly this month. Here is where you stand.')
    else sentences.push(`${listObjects(moved)} moved clearly this month${moved.length > 1 ? ', and the rest held where they were' : ''}.`)
    const level = levelSentence(answered[0] ?? verdicts[0], figures)
    if (level) sentences.push(level)
  }

  if (slot === 'interpretation_quarterly') {
    sentences.push(
      moved.length === 0
        ? 'Nothing cleared its band this quarter. What follows is the level each of these is running at, and the count behind it.'
        : `${listObjects(moved)} cleared the band this quarter. Everything else on this page is a level, not a change.`,
    )
    // SENTENCE-INITIAL, AND THE VERB AGREES. `countWord` is built for
    // mid-sentence use in listObjects; reusing it to OPEN a sentence shipped
    // "two of these carried…" in lower case, and the refusal sentence shipped
    // "two could have been compared and WAS not". Both in prose the product
    // signs as its own.
    if (thin.length > 0) {
      sentences.push(
        thin.length === 1
          ? 'One of these carried too few videos to compare, so it is printed as a level only.'
          : `${capitalise(countWord(thin.length))} of these carried too few videos to compare, so they are printed as levels only.`,
      )
    }
    if (refused.length > 0) {
      sentences.push(
        refused.length === 1
          ? `One could have been compared and was not, because ${refusedBecause(refused)}.`
          : `${capitalise(countWord(refused.length))} could have been compared and were not, because ${refusedBecause(refused)}.`,
      )
    }
    const level = levelSentence(answered[0] ?? verdicts[0], figures)
    if (level) sentences.push(level)
  }

  if (slot === 'interpretation_anomaly') {
    sentences.push(
      moved.length === 0
        ? 'This week reads like the three months behind it.'
        : `${listObjects(moved)} ran unlike the three months behind ${moved.length > 1 ? 'them' : 'it'} this week.`,
    )
    sentences.push('A week is measured against its trailing months, never on its own, and one week rarely settles anything.')
  }

  return {
    slot,
    label: INTERPRETATION_LABEL,
    sentences: sentences.filter(Boolean),
    quotes: [...quotes],
    fallback: true,
    reason: reason === 'no_model' && moved.length === 0 ? 'nothing_moved' : reason,
    scrub: EMPTY_SCRUB,
  }
}

/** "Durability", "Durability and fit", "Durability, fit and three others". */
function listObjects(verdicts: readonly Verdict[]): string {
  const names = verdicts.map((v) => v.objectLabel).filter(Boolean)
  if (names.length === 0) return 'Something'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names[0]}, ${names[1]} and ${countWord(names.length - 2)} other${names.length - 2 === 1 ? '' : 's'}`
}

/** A level, with its denominator, in tokens where the table holds them. Never a
 *  bare count: "3 of the 28 videos in your audience" is the unit. */
function levelSentence(verdict: Verdict | undefined, figures: FigureTable): string | null {
  if (!verdict || verdict.value.n <= 0) return null
  const k = tokenFor(figures, `${verdict.objectId}_videos`, `${verdict.objectKind}_videos`)
  const n = tokenFor(figures, `${verdict.audience}_videos`, 'audience_videos')
  if (!k || !n) return null
  return `${verdict.objectLabel} came up in ${k} of the ${n} videos read for this audience.`
}

/** The first key the table actually holds, as a `[[token]]`. A sentence citing
 *  a key the table lacks is dropped by the scrubber, so it is asked for here. */
function tokenFor(figures: FigureTable, ...keys: string[]): string | null {
  for (const key of keys) if (figures[key]) return `[[${key}]]`
  return null
}

const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

/** A count in words: a figure the model may not type is a figure code writes,
 *  and small counts read better as words in a sentence. */
function countWord(n: number): string {
  return n >= 0 && n < WORDS.length ? WORDS[n] : String(n)
}

/** A count word opening a sentence. `countWord` is written for mid-sentence
 *  use and reusing it at the start of one shipped lower-case sentences. */
function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** Why a refusal, in the reader's words. The reasons are about our own
 *  bookkeeping, and each one says so rather than blaming the conversation. */
function refusedBecause(refused: readonly Verdict[]): string {
  const reasons = new Set(refused.map((v) => v.refusedReason))
  if (reasons.has('rename')) return 'a brand was renamed inside the window'
  if (reasons.has('clustering_changed')) return 'the themes were re-grouped inside the window'
  if (reasons.has('tracking_change')) return 'what we track changed inside the window'
  if (reasons.has('unlogged_era')) return 'the window reaches back before we began recording changes'
  return 'the two sides were not measured the same way'
}

/**
 * The verdict contract, rendered for a prompt.
 *
 * One renderer, so the three slots hand the model the same thing in the same
 * shape and a difference between two interpretations is a difference in their
 * readings. Figures are KEYS and labels, never values — the model cannot round
 * a number it has never seen.
 *
 * ONE FIGURE TYPE crosses this seam. A caller holding the reading layer's
 * measured figures (`lib/reading/verdicts.ts`) converts them once with
 * `proseFigures` (lib/prose/figures.ts) and passes the result here and to
 * `composeInterpretation` and `scrubProse`. This used to take a union of the
 * two shapes and cast its way to a label, which meant every later package
 * getting figures from the reading layer would have written the conversion
 * again, and differently.
 */
export function verdictBlock(verdicts: readonly Verdict[], figures: FigureTable): string {
  const lines: string[] = []
  lines.push('VERDICTS — the only movement claims you may make. Each is ours, not yours.')
  if (verdicts.length === 0) lines.push('- none. You may not say anything moved, in any direction.')
  for (const v of verdicts) {
    const parts = [
      `- ${v.objectLabel} (${v.objectKind}, ${v.audience}, ${v.window.kind} ${v.window.from})`,
      `verdict=${v.state}`,
      v.changePts != null ? `change=${v.changePts}pts` : 'change=none',
      v.bandPts != null ? `band=±${v.bandPts}pts` : 'band=none',
      `n=${v.value.n}`,
      v.direction ? `direction=${v.direction}` : 'direction=NONE — you may not say which way it is going',
      v.flags.length ? `flags=${v.flags.join(',')}` : '',
      v.refusedReason ? `refused=${v.refusedReason}` : '',
    ].filter(Boolean)
    lines.push(parts.join(' · '))
  }
  lines.push('')
  lines.push('FIGURES — cite by placeholder, exactly as written. You do not know their values.')
  const keys = Object.keys(figures)
  if (keys.length === 0) lines.push('- none. Any digit you type deletes the sentence it is in.')
  for (const key of keys) lines.push(`- [[${key}]] — ${figures[key].label}`)
  return lines.join('\n')
}
