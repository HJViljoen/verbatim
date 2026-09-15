import { allowTokens, scrubProse, stripThemeRefs } from '../../prose/scrub'
import type { FigureTable } from '../types'

/**
 * What the writer's words go through before they are kept (pure). The same
 * discipline as the cover, block by block: a sentence citing a key the
 * figure table does not hold is dropped; a sentence in which the model typed
 * a number of its own is dropped; magnitude words are stripped; bracket
 * handles ([G3], (S1, S2)) never reach the reader; dashes between clauses
 * become a comma or a full stop (house style, enforced here rather than in a
 * prompt); and a block cannot run past its cap, so pages look alike week to
 * week.
 */

/** Em and en dashes between clauses, and the spaced hyphen, become a comma;
 *  a hyphen inside a word (long-term) is left alone. A dash that opened a
 *  sentence-final aside becomes a full stop when nothing follows. House style,
 *  and the writer's alone — the other slots keep their dashes. */
export function noDashes(s: string): string {
  return s
    .replace(/\s*[—–]\s*$/g, '.')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s+-\s+/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()
}

export interface ScrubResult {
  text: string
  dropped: number
  leaked: boolean
}

/** Cut at the last sentence end inside the cap; if no sentence fits, at the
 *  last word inside it. */
export function capText(s: string, max: number): string {
  if (s.length <= max) return s
  const head = s.slice(0, max)
  const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '))
  if (end > 0 && end >= max * 0.3) return head.slice(0, end + 1)
  const sp = head.lastIndexOf(' ')
  return `${head.slice(0, sp > 0 ? sp : max).replace(/[,;:]$/, '')}.`
}

/** Paragraphs survive (a developed finding runs to two or three); each is
 *  scrubbed sentence by sentence and the whole is capped. */
/** The run's allow-list of digit-bearing NAMES ("3R78", "C-Leg 4"), mined
 *  from this document's own inputs. The implementation is shared now — every
 *  slot's digit rule needs the same list, and a list derived per document is a
 *  list that differs per document. */
export const productTokens = (texts: string[]): string[] => allowTokens(texts)

export interface ScrubOptions {
  /** Product names that may carry digits. */
  allow?: string[]
}

export function scrubText(raw: string, figures: FigureTable, max: number, opts: ScrubOptions = {}): ScrubResult {
  const paragraphs = (raw ?? '').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)
  const out: string[] = []
  let dropped = 0
  let leaked = false
  for (const para of paragraphs) {
    const r = scrubParagraph(para, figures, opts.allow ?? [])
    dropped += r.dropped
    leaked = leaked || r.leaked
    if (r.text) out.push(r.text)
  }
  return { text: capParagraphs(out, max), dropped, leaked }
}

function capParagraphs(paragraphs: string[], max: number): string {
  const kept: string[] = []
  let used = 0
  for (const p of paragraphs) {
    if (used + p.length <= max) { kept.push(p); used += p.length + 2; continue }
    const room = max - used
    if (kept.length === 0 || room > 80) kept.push(capText(p, Math.max(room, 1)))
    break
  }
  return kept.join('\n\n')
}

function scrubParagraph(raw: string, figures: FigureTable, allow: string[]): ScrubResult {
  // The writer's own three extras, then the shared loop: internal handles
  // ([G3], (S1, S2), bare J7) never reach a reader, and a dash between clauses
  // is house style enforced in code rather than asked for in a prompt.
  const source = noDashes(stripThemeRefs(raw ?? '').replace(/\[[GSJ]\d+\]/g, '').replace(/\b[GSJ]\d+\b/g, ''))
  // `document_write`'s own row in the policy table, rather than a hard-wired
  // call to one of the two rules: the table has to DRIVE its wired slots or it
  // is a comment about them.
  const r = scrubProse('document_write', source, { figures, allow })
  return { text: r.text, dropped: r.dropped, leaked: r.leaked }
}

/** A short line (a headline, a list item): one sentence's worth, same rules,
 *  no trailing full stop on a headline. */
export function scrubLine(raw: string, figures: FigureTable, max: number, opts: { headline?: boolean } & ScrubOptions = {}): ScrubResult {
  const r = scrubText(raw, figures, max, opts)
  const text = opts.headline ? r.text.replace(/[.!]+$/, '') : r.text
  return { ...r, text }
}

/** Indices the writer cited that exist. Unknown ones are dropped and counted,
 *  never thrown: an invented reference is not a reason to lose the block. */
export function resolveIndices(cited: string[] | null | undefined, known: Set<string>): { ok: string[]; rejected: number } {
  const ok: string[] = []
  let rejected = 0
  for (const raw of cited ?? []) {
    const id = String(raw).trim().toUpperCase()
    if (known.has(id)) { if (!ok.includes(id)) ok.push(id) } else rejected += 1
  }
  return { ok, rejected }
}

export type Sure = 'solid' | 'reasonable' | 'thin'

/** How sure we are, decided by the evidence behind the finding, never by the
 *  model: distinct conversations across the grounded points it rests on and
 *  how many points there are. Words, not scores, on paper. */
export function calibrateSure(points: { conversationCount: number }[]): { sure: Sure; conversations: number } {
  const conversations = points.reduce((n, p) => n + p.conversationCount, 0)
  if (points.length >= 2 && conversations >= 12) return { sure: 'solid', conversations }
  if (conversations >= 5) return { sure: 'reasonable', conversations }
  return { sure: 'thin', conversations }
}

export const SURE_WORDS: Record<Sure, string> = {
  solid: 'Solid: several strands of the conversation say this, and they agree.',
  reasonable: 'Reasonable: the conversation says this, though not from many directions yet.',
  thin: 'Thin: a few voices say this. Treat it as a lead, not a rule.',
}

/** A count of one reads as "1 conversations" once the figure is substituted.
 *  The noun after a count key is the writer's; the number is ours, so the
 *  fix is ours too: "[[g3_conversations]] conversations" becomes "one
 *  conversation" when the table says 1. A word, not a digit, so the digit
 *  rules still hold. */
export function singularise(text: string, figures: FigureTable): string {
  return text.replace(/\[\[([a-z][a-z0-9_]*)\]\]\s+(conversations|videos|themes)\b/g, (m, key: string, noun: string) => {
    const f = figures[key]
    if (!f || f.kind !== 'count' || f.value !== '1') return m
    return `one ${noun.replace(/s$/, '')}`
  })
}
