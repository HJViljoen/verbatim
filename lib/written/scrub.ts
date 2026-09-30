import { allowTokens, scrubProse, splitSentences, stripThemeRefs } from '../prose/scrub'
import { capText, noDashes } from '../reports/documents/scrub'
import type { FigureTable } from '../reports/types'
import type { PoolCandidate, StandingFact } from './types'
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
//  5. in the report's implications and watch lines only (v3), advice and
//     forecasts drop their sentence too (`ADVICE`, `FORECAST`, and the
//     company told what it could or should do): the report is intelligence,
//     never instructions, and a question worth watching is never a forecast;
//  6. a field cap, cut at a sentence boundary; a one-line field (the week's
//     line, a watch line) over its cap is dropped whole rather than cut, so
//     no claim prints half said.
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

/**
 * Advice, which the report never gives ("we are the intelligence platform",
 * not a consultant): applied to the implications and the watch lines only,
 * where the writer is most tempted, and each entry kept to what is advice on
 * any reading. "Buyers consider the price" and "owners focus on the straps"
 * are the market talking, so neither verb is here: the prompt forbids them,
 * this is the backstop.
 */
export const ADVICE: readonly { name: string; re: RegExp }[] = [
  { name: 'should', re: /\bshould\b|\bought\s+to\b/i },
  { name: 'advice verbs', re: /\bmake\s+sure\b|\blean\s+into\b|\bdouble\s+down\b|\bprioriti[sz]e\b/i },
  { name: 'opportunity', re: /\bopportunit(?:y|ies)\b/i },
  // A sentence that opens on a verb telling someone to act. Kept to verbs
  // that do not also open a noun phrase ("Build quality…", "Stock levels…").
  { name: 'imperative', re: /^(?:show|offer|add|highlight|lead\s+with|invest\s+in|launch|emphasi[sz]e|consider)\b/i },
]

/** A forecast, which a question worth watching never is: applied with
 *  `ADVICE`. "Buyers expect a bag to last" is the market, so "expect" is not
 *  here. */
export const FORECAST: readonly { name: string; re: RegExp }[] = [
  { name: 'forecast', re: /\b(?:un)?likely\b|\bprobably\b|\bforecast\w*|\bpredict\w*|\bpoised\s+to\b|\bbound\s+to\b|\b(?:is|are)\s+going\s+to\b|\bwill\s+(?:likely|probably|soon)\b/i },
]

/** The company told what it could or should do ("Sealand could show…").
 *  "Sealand can be compared…" is a reading, not advice, so a modal before
 *  "be" passes, but for "should" and "must". */
export function toldWhatToDo(company: string): { name: string; re: RegExp } | null {
  const name = company.trim()
  if (name.length < 2) return null
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return { name: 'told what to do', re: new RegExp(`\\b${escaped}(?:'s)?\\s+(?:(?:could|can|might|may)(?!\\s+be\\b)|should|must|needs?\\s+to|has\\s+to|would\\s+do\\s+well)\\b`, 'i') }
}

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
  /** …because they gave advice or a forecast (the report's implications and
   *  watch lines, v3). */
  droppedAdvice: number
  /** One-line fields dropped whole for running over their cap (v3). */
  droppedLong: number
  /** Something had to be removed: the flag for `ai_call_log`. */
  leaked: boolean
}

const ZERO: WeekScrubCounts = { dropped: 0, droppedDigits: 0, droppedDirection: 0, droppedBanned: 0, droppedAdvice: 0, droppedLong: 0, leaked: false }

const add = (a: WeekScrubCounts, b: WeekScrubCounts): WeekScrubCounts => ({
  dropped: a.dropped + b.dropped,
  droppedDigits: a.droppedDigits + b.droppedDigits,
  droppedDirection: a.droppedDirection + b.droppedDirection,
  droppedBanned: a.droppedBanned + b.droppedBanned,
  droppedAdvice: a.droppedAdvice + b.droppedAdvice,
  droppedLong: a.droppedLong + b.droppedLong,
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
  /** Keep at most this many sentences (an implication's two, the week's
   *  one line). */
  maxSentences?: number
  /** A headline: one line, no full stop. */
  headline?: boolean
  /** Rules a sentence must also pass, beyond the §0a list (`ADVICE`,
   *  `FORECAST`, `toldWhatToDo`): a hit drops the sentence, counted as advice. */
  extra?: readonly { name: string; re: RegExp }[]
  /** A one-line field: over `max`, it is dropped whole rather than cut, so a
   *  claim never prints half said. */
  whole?: boolean
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
    if (o.extra && bannedHits(sentence, o.extra).length > 0) {
      counts = add(counts, { ...ZERO, dropped: 1, droppedAdvice: 1, leaked: true })
      continue
    }
    kept.push(sentence)
  }
  const r = scrubProse('week_read', kept.join(' '), { figures: o.figures ?? {}, allow: o.allow ?? [], verdicts: [] })
  counts = add(counts, { ...ZERO, dropped: r.dropped, droppedDigits: r.droppedDigits, droppedDirection: r.droppedDirection, leaked: r.leaked })
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
  if (o.whole && out.join('\n\n').length > max) {
    return { text: '', counts: add(counts, { ...ZERO, droppedLong: 1, leaked: true }) }
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

/** Slack on a one-line field's stated cap before it is dropped whole: the
 *  writer is told the cap, and a line a little over it still reads. */
export const WHOLE_SLACK = 1.25

/**
 * Every field through `scrubWeekText`, with its cap; figures only in `saw`.
 * The implications and watch lines also drop advice and forecasts (`ADVICE`,
 * `FORECAST`, and the company told what to do where `company` is given); the
 * week's line and each watch line are one line each, dropped whole past their
 * cap. Ids are passed through untouched (compose resolves them). Pure.
 */
export function scrubWeekRead(
  w: WeekReadOutput,
  figures: FigureTable,
  allow: readonly string[] = [],
  opts: { company?: string } = {},
): { output: ScrubbedWeekRead; counts: WeekScrubCounts } {
  let counts = ZERO
  const run = (raw: string, max: number, o: WeekScrubOptions = {}) => {
    const r = scrubWeekText(raw, max, { allow, ...o })
    counts = add(counts, r.counts)
    return r.text
  }
  const told = opts.company ? toldWhatToDo(opts.company) : null
  const extra = [...ADVICE, ...FORECAST, ...(told ? [told] : [])]
  const ids = (xs: readonly string[] | null | undefined): string[] => [...(xs ?? [])]
  const findings = (w.findings ?? []).map((f) => ({
    headline: run(f.headline, WEEK_READ_MAX.headline, { headline: true }),
    saw: run(f.saw, WEEK_READ_MAX.saw, { figures }),
    means: run(f.means, WEEK_READ_MAX.means),
    based_on: ids(f.based_on),
    quote_from: f.quote_from ?? null,
  }))
  const story = (w.story ?? []).map((p) => ({
    paragraph: run(p.paragraph, WEEK_READ_MAX.paragraph),
    based_on: ids(p.based_on),
    quote_from: p.quote_from ?? null,
  }))
  const implications = (w.implications ?? []).map((i) => ({
    implication: run(i.implication, WEEK_READ_MAX.implication, { maxSentences: WEEK_READ_MAX.implicationSentences, extra }),
    based_on: ids(i.based_on),
  }))
  const new_this_week = (w.new_this_week ?? []).map((n) => ({ candidate: n.candidate, sentence: run(n.sentence, WEEK_READ_MAX.newItem) }))
  const watch = (w.watch ?? []).map((q) => ({
    question: run(q.question, Math.round(WEEK_READ_MAX.watch * WHOLE_SLACK), { maxSentences: 1, headline: true, whole: true, extra }),
    based_on: ids(q.based_on),
  }))
  const week_in_one_line = run(w.week_in_one_line ?? '', Math.round(WEEK_READ_MAX.weekLine * WHOLE_SLACK), { maxSentences: 1, whole: true })
  const standing = (w.standing ?? []).map((s) => ({ subject_id: s.subject_id, sentence: run(s.sentence, WEEK_READ_MAX.standing) }))
  return { output: { findings, story, implications, new_this_week, watch, week_in_one_line, standing }, counts }
}
