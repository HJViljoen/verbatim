import { allowTokens, scrubProse, splitSentences, stripThemeRefs } from '../prose/scrub'
import { capText, noDashes } from '../reports/documents/scrub'
import type { FigureTable } from '../reports/types'
import { DEPARTMENTS, type Department, type PoolCandidate, type StandingFact } from './types'
import { WEEK_READ_MAX, type WeekReadOutput } from './write'

// What the writer's words go through before code composes the read (plan T3).
// Pure. Sentence by sentence, the unit both product rules drop:
//
//  1. the ids strip: a C2 or S1 the model typed never reaches a reader;
//  2. `noDashes`: a dash between clauses becomes a comma, house style;
//  3. the §0a backstop: a sentence about how the read was made (searches,
//     data, coverage, sources, updates, the tool, Verbatim, "this report",
//     why something cannot be said) or in the first person is dropped whole.
//     The prompt forbids all of it; this is what holds when a prompt does not;
//  4. the `week_read` policy (lib/prose/scrub.ts, `both`), with NO verdicts:
//     a sentence with a digit the model typed, or a `[[key]]` the table does
//     not hold, drops; so does any sentence naming a direction, because
//     nothing licensed one; magnitude words are stripped as words;
//  5. a field cap, cut at a sentence boundary.
//
// FIGURES ONLY IN `saw`. Every other field is scrubbed against an EMPTY table,
// so a placeholder there drops its sentence: the counts print beside each
// finding in code, and the rest of the read carries no number (T5's budget).

// ---- The §0a backstop ------------------------------------------------------------------------

/**
 * Phrases that talk about how the read was made rather than about the market
 * (§0a.1 and §0a.3). EXPORTED: a guard test over the client surfaces reuses
 * it, so each entry is written to be safe on ordinary market prose too. Every
 * entry is a phrase or a guarded word, never a bare common word, and each one
 * names the false positive it steps round:
 *  · "the search for a bag that lasts" is the market's search, not ours;
 *  · "warranty coverage" is what a buyer is owed, not what we read;
 *  · "sources of frustration" is a market phrase;
 *  · "scraped the leather" is a durability complaint;
 *  · "a data plan" is travel talk;
 *  · "a tool roll" is a product.
 */
export const BANNED_PHRASES: readonly { name: string; re: RegExp }[] = [
  { name: 'searches', re: /\bsearch\s+terms?\b|\bsearches\b|\b(?:our|these|those|new|added|tracked)\s+search(?:es)?\b|\bthe\s+search(?:es)?\b(?!\s+for\b)/i },
  { name: 'data', re: /\b(?:our|the|this|that|these|available|collected|gathered|limited)\s+data\b(?!\s+(?:plans?|cables?|sims?|roaming)\b)|\bdata\s+(?:collection|set|sets|shows?|suggests?|points?|sources?)\b|\bdatasets?\b/i },
  { name: 'coverage', re: /(?<!\b(?:warranty|insurance|guarantee|repair|lifetime|rain|weather|water|waterproof|full)\s+)\bcoverage\b/i },
  { name: 'sources', re: /\b(?:our|across|multiple|several|different|all|the|these)\s+sources\b(?!\s+of\b)|\bsources?\s+(?:we|used|read|gathered|collected)\b/i },
  { name: 'scraped', re: /\bscrap(?:ed|ing)\s+(?:comments?|videos?|posts?|data|the\s+(?:web|internet|platforms?))\b|\bscrapers?\b/i },
  { name: 'gathered', re: /\b(?:we|was|were|been|comments?|videos?|posts?|data)\s+gathered\b|\bgathered\s+(?:this\s+week|from|for\s+this)\b/i },
  { name: 'collected', re: /\b(?:comments?|videos?|posts?|data)\s+(?:were\s+|was\s+)?collected\b|\bdata\s+collection\b/i },
  { name: 'platform', re: /\bplatforms?\b/i },
  { name: 'the tool', re: /\b(?:the|this|our)\s+tool\b(?!\s+(?:roll|bag|pouch|kit|pocket|loop|holder))/i },
  { name: 'Verbatim', re: /\bverbatim\b/i },
  { name: 'this report', re: /\bthis\s+(?:report|brief|briefing|read|summary|email|newsletter|issue|analysis|week'?s\s+read)\b/i },
  { name: 'updates', re: /\b(?:this|last|next|latest|previous|each|every|our|with\s+the)\s+updates?\b|\bupdates?\s+(?:we|of\s+ours)\b/i },
  { name: 'sample', re: /\b(?:our|the|this|a\s+small|small|limited)\s+samples?\b(?!\s+sales?\b)|\bsampled\b/i },
  { name: 'readiness', re: /\breadiness\b|\bcalibrat\w*|\bprovisional\b/i },
  // Why something is not said, in the impersonal forms only: "buyers can't
  // tell the two zips apart" is the market talking.
  { name: 'cannot say', re: /\btoo\s+(?:early|soon)\s+to\s+(?:say|tell|compare)\b|\btoo\s+(?:few|little\s+data)\s+to\b|\bcan(?:no|')?t\s+(?:yet\s+)?be\s+(?:said|compared|measured|read|counted|told)\b|\b(?:can(?:no|')?t|could\s+not|couldn'?t)\s+yet\s+(?:say|tell|compare)\b|\bnot\s+(?:yet\s+)?possible\s+to\s+(?:say|tell|compare)\b|\bnot\s+enough\s+(?:data|videos|evidence|comments)\b|\bnot\s+read\s+as\s+a\s+change\b|\bcomparison\s+(?:is\s+|was\s+)?refused\b/i },
  { name: 'what is ours', re: /\bwhat\s+is\s+ours\b/i },
  { name: 'methodology', re: /\bmethodolog\w*/i },
]

/** Our own voice and our own machinery, which the house style forbids and
 *  which are not safe to reuse on every client surface (the product's own
 *  copy says "your market", and a theme may be about "insights"): the first
 *  person, and pipeline words a reader should never meet. */
const LOCAL_BANNED: readonly { name: string; re: RegExp }[] = [
  { name: 'first person', re: /\b(?:[Ww]e|[Oo]urs?|us)\b/ },
  { name: 'pipeline words', re: /\b(?:candidates?|insights?|clustering|clustered|the\s+pipeline)\b|\b(?:this|last|next|each|every|latest)\s+runs?\b/i },
  { name: 'AI', re: /\bAI\b|\bthe\s+(?:language\s+)?model\s+(?:wrote|read|found|says?)\b/ },
]

/** The banned phrases a text names, by name, in the order listed. Exported
 *  for the guard test that reuses `BANNED_PHRASES` on the client surfaces. */
export function bannedHits(text: string, list: readonly { name: string; re: RegExp }[] = BANNED_PHRASES): string[] {
  return list.filter(({ re }) => re.test(text ?? '')).map(({ name }) => name)
}

// ---- One field ---------------------------------------------------------------------------------

export interface WeekScrubCounts {
  /** Sentences dropped, whatever the reason. */
  dropped: number
  droppedDigits: number
  droppedDirection: number
  /** …because they talked about how the read was made (§0a). */
  droppedBanned: number
  /** Something had to be removed: the flag for `ai_call_log`. */
  leaked: boolean
}

const ZERO: WeekScrubCounts = { dropped: 0, droppedDigits: 0, droppedDirection: 0, droppedBanned: 0, leaked: false }

const add = (a: WeekScrubCounts, b: WeekScrubCounts): WeekScrubCounts => ({
  dropped: a.dropped + b.dropped,
  droppedDigits: a.droppedDigits + b.droppedDigits,
  droppedDirection: a.droppedDirection + b.droppedDirection,
  droppedBanned: a.droppedBanned + b.droppedBanned,
  leaked: a.leaked || b.leaked,
})

/** The ids a model types (C2, S1, in brackets or not), never a reader's. */
const stripIds = (s: string): string =>
  s.replace(/\s*\[(?:[CS]\d+(?:,\s*)?)+\]/g, '').replace(/\s*\((?:[CS]\d+(?:,\s*)?)+\)/g, '').replace(/\b[CS]\d{1,2}\b/g, '')

export interface WeekScrubOptions {
  /** The figures this field may cite; every other field passes `{}`. */
  figures?: FigureTable
  /** Names that carry digits and may be written (`allowTokens`). */
  allow?: readonly string[]
  /** Keep at most this many sentences (the In short's three). */
  maxSentences?: number
  /** A headline: one line, no full stop. */
  headline?: boolean
}

/** One paragraph, sentence by sentence. */
function scrubParagraph(raw: string, o: WeekScrubOptions): { text: string; counts: WeekScrubCounts } {
  const source = noDashes(stripIds(stripThemeRefs(raw ?? '')))
  let counts = ZERO
  const kept: string[] = []
  for (const sentence of splitSentences(source)) {
    if (bannedHits(sentence).length > 0 || bannedHits(sentence, LOCAL_BANNED).length > 0) {
      counts = add(counts, { ...ZERO, dropped: 1, droppedBanned: 1, leaked: true })
      continue
    }
    kept.push(sentence)
  }
  const r = scrubProse('week_read', kept.join(' '), { figures: o.figures ?? {}, allow: o.allow ?? [], verdicts: [] })
  counts = add(counts, { dropped: r.dropped, droppedDigits: r.droppedDigits, droppedDirection: r.droppedDirection, droppedBanned: 0, leaked: r.leaked })
  return { text: splitSentences(r.text).map(capitalised).join(' '), counts }
}

/** A sentence whose first word the magnitude strip took ("Many buyers…")
 *  starts lower case; put the capital back. Only where the next letter is
 *  lower case too, so a name like "eBay" or "iPhone" is left as written. */
const capitalised = (s: string): string => (/^[a-z][a-z]/.test(s) ? s[0].toUpperCase() + s.slice(1) : s)

/**
 * One field of the writer's output through every rule, then capped at a
 * sentence boundary. Paragraphs survive (a `saw` runs to two); the cap is on
 * the whole field.
 */
export function scrubWeekText(raw: string, max: number, o: WeekScrubOptions = {}): { text: string; counts: WeekScrubCounts } {
  const paragraphs = (raw ?? '').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)
  let counts = ZERO
  const out: string[] = []
  let sentences = 0
  for (const para of paragraphs) {
    const r = scrubParagraph(para, o)
    counts = add(counts, r.counts)
    if (!r.text) continue
    let text = r.text
    if (o.maxSentences != null) {
      const room = o.maxSentences - sentences
      if (room <= 0) break
      const ss = splitSentences(text)
      text = ss.slice(0, room).join(' ')
      sentences += Math.min(ss.length, room)
    }
    out.push(text)
  }
  let text = capParagraphs(out, max)
  if (o.headline) text = text.replace(/\s+/g, ' ').replace(/[.!]+$/, '').trim()
  return { text, counts }
}

/** Paragraphs inside a cap: whole paragraphs while they fit, then the next one
 *  cut at a sentence end if there is room enough for one. */
function capParagraphs(paragraphs: readonly string[], max: number): string {
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

// ---- The whole output --------------------------------------------------------------------------

/** The writer's output after scrub: the same shape, every string clean. */
export type ScrubbedWeekRead = WeekReadOutput

/** Names in the material that carry digits and may be repeated ("3R78"), mined
 *  from what the writer was shown. A bare size ("35L") never qualifies. */
export function weekAllowTokens(candidates: readonly PoolCandidate[], standing: readonly StandingFact[]): string[] {
  return allowTokens([
    ...candidates.flatMap((c) => [c.label, c.description ?? '', ...c.notes]),
    ...standing.flatMap((f) => [f.name, ...f.contents, ...f.notes]),
  ])
}

/**
 * Every field through `scrubWeekText`, with its cap; figures only in `saw`.
 * Ids are passed through untouched (compose resolves them). Pure.
 */
export function scrubWeekRead(
  w: WeekReadOutput,
  figures: FigureTable,
  allow: readonly string[] = [],
): { output: ScrubbedWeekRead; counts: WeekScrubCounts } {
  let counts = ZERO
  const run = (raw: string, max: number, o: WeekScrubOptions = {}) => {
    const r = scrubWeekText(raw, max, { allow, ...o })
    counts = add(counts, r.counts)
    return r.text
  }
  const findings = (w.findings ?? []).map((f) => ({
    headline: run(f.headline, WEEK_READ_MAX.headline, { headline: true }),
    saw: run(f.saw, WEEK_READ_MAX.saw, { figures }),
    means: run(f.means, WEEK_READ_MAX.means),
    for: Object.fromEntries(DEPARTMENTS.map((d) => [d, run(f.for?.[d] ?? '', WEEK_READ_MAX.for)])) as Record<Department, string>,
    based_on: [...(f.based_on ?? [])],
    quote_from: f.quote_from ?? null,
  }))
  const in_short = run(w.in_short ?? '', WEEK_READ_MAX.inShort, { maxSentences: WEEK_READ_MAX.inShortSentences })
  const standing = (w.standing ?? []).map((s) => ({ subject_id: s.subject_id, sentence: run(s.sentence, WEEK_READ_MAX.standing) }))
  return { output: { findings, in_short, standing }, counts }
}
