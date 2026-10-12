import { z } from 'zod'

import { splitSentences } from '../../prose/scrub'
import { collectQuoteRefs, resolveQuotes } from '../../renderables/quotes-freeze'
import type { QuoteResolution } from '../../renderables/types'
import type { QuoteWordsOf } from './compose'
import { distinctChips, heardIn, ideasArgued, planDeck, tagLine, type DeckPage } from './deck'
import type { BriefRole, MonthlyBriefData, StoredBriefData } from './types'
import { BRIEF_LENS, BRIEF_NAME, BRIEF_ROLES } from './types'

// IN SHORT SAYS ONLY WHAT PRINTS (the September dry build, 12 Oct). The writer
// writes In short before the deck is paginated, so it can sum up a section the
// canvas has no page for, a page left out as thin, or an item past what fits
// its page. The composer's check by meaning (compose.ts
// `summaryAgainstPrinted`) passes a sentence that sits close to one printed
// line, which a two-clause sentence does while its second clause names
// something no page carries. So the set is paginated as it will print, and ONE
// call reads each brief's PRINTED pages (the words a reader reads on them,
// never a quote's: nothing under lib/reports/ sends a comment's text to a
// model) and says, sentence by sentence, whether the brief's own pages carry
// everything the sentence names. A sentence they do not carry drops whole,
// into `held` (the scrubs' sentence rule: never a word edit). A brief whose In
// short drops to nothing loses its In short page, as any page missing its
// main piece is left out (deck.ts `planDeck`).

export const IN_SHORT_PROMPT_VERSION = 'brief_in_short_v1'

/** One printed page as the check reads it: its header and its lines. */
export interface PrintedPage { page: string; lines: string[] }

/** The brief with its quotes' words put back, where `words` has them, as the
 *  deck draws it: a voice's length decides what fits a page. Pure. */
export function hydrateBrief<T extends StoredBriefData>(d: T, words?: QuoteWordsOf): T {
  if (!words) return d
  const texts = new Map<string, QuoteResolution>()
  for (const ref of collectQuoteRefs(d)) {
    const w = words(ref)
    if (w?.text) texts.set(ref, w)
  }
  return resolveQuotes(d, texts)
}

const join = (parts: readonly (string | null | undefined)[]): string => parts.map((x) => (x ?? '').trim()).filter(Boolean).join(' | ')
const pct = (x: number | undefined | null): string => (x == null ? '' : `${x}%`)

/** A section page's lines: everything it prints in words, but its voices. */
function sectionLines(b: Extract<DeckPage['body'], { kind: 'section' }>, d: StoredBriefData): string[] {
  const s = b.section
  const out: (string | null | undefined)[] = [b.continued ? `${s.title}, continued` : s.title, b.sub, s.lead, s.note]
  for (const g of s.groups) {
    if (g.label) out.push(g.label)
    if (g.base) out.push(g.base)
    for (const i of g.items) {
      // A line naming another brief prints too (its first sentence), and
      // the page's footnote or its card's foot says where it is argued.
      const measure = s.key === 'leadership.shares'
        ? `comments ${pct(i.measure?.comments)}, videos ${pct(i.measure?.videos)}`
        : pct(i.measure?.pct)
      out.push(join([
        i.you ? `${d.company} (you)` : i.title, i.pill, measure, i.status?.replace(/_/g, ' '), i.text, i.detail,
        i.persona?.want, i.persona?.stops, i.persona?.moves, i.persona?.forSale ? `For a sale: ${i.persona.forSale}` : null,
        s.key === 'leadership.risks' ? tagLine(i.tag) : null,
      ]))
    }
    out.push(...(g.lines ?? []))
  }
  out.push(s.also, ...(s.lines ?? []))
  for (const c of s.chips ?? []) out.push(`${c.label}: ${c.words.join(', ')}`)
  if (s.panel?.rows.length) out.push(s.panel.title, ...s.panel.rows.map((r) => join([r.title, r.text])))
  if (s.kinds) out.push(join(['What people do in the comments', s.kinds.base, ...s.kinds.rows.map((r) => `${r.label} ${Math.round(r.pct)}%`)]))
  if (s.mood) out.push(join(['The mood', s.mood.base, ...s.mood.rows.map((r) => `${r.label} ${r.pct}%`)]))
  if (s.shares) out.push(`Share of comments: ${s.shares.comments.line}`, s.shares.videos ? `Share of videos: ${s.shares.videos.line}` : null)
  if (s.posts?.rows.length) out.push(s.posts.title, ...s.posts.rows.map((r) => `${r.you ? `${r.name} (you)` : r.name}: ${r.posts} posts, ${r.five} with five or more comments, ${r.pct}%`))
  if (s.position?.text) out.push(`${d.company}'s position, in one line: ${s.position.text}`)
  if (s.key === 'leadership.holds') for (const x of ideasArgued(d)) out.push(`${x.headline} (${x.own ? 'this brief' : BRIEF_NAME[x.brief]})`)
  if (b.companion) out.push(...sectionLines({ ...b, section: b.companion, continued: false, companion: null, sub: null, footnote: null }, d))
  out.push(b.footnote)
  return out.map((x) => (x ?? '').trim()).filter(Boolean)
}

/**
 * The words a brief's printed pages carry, page by page, as the deck plans
 * them (pages left out, and what does not fit a page, are not here), with the
 * quotes' words in hand where `words` has them so the pages fit as they will
 * draw. A voice's words are never here. The cover is its contents only, and
 * In short is its figures. Pure.
 */
export function printedPages(d: StoredBriefData, words?: QuoteWordsOf): PrintedPage[] {
  const h = hydrateBrief(d, words)
  const out: PrintedPage[] = []
  for (const p of planDeck(h).pages) {
    const b = p.body
    if (b.kind === 'cover') continue
    if (b.kind === 'in_short') {
      const lines = h.inShort.figures.slice(0, 2).map((f) => `${f.value} ${f.label}`)
      if (lines.length) out.push({ page: 'In short', lines })
      continue
    }
    if (b.kind === 'finding') {
      const f = b.finding
      out.push({
        page: p.eyebrow,
        lines: [
          f.headline, ...f.saw, `${BRIEF_LENS[h.role]}: ${f.means}`, ...f.practice.slice(0, b.plan.practice), heardIn(f), f.subjectLine,
          ...(f.heardFor?.length ? [`What each brand is heard for: ${f.heardFor.map((c) => `${c.name}, ${c.phrase}`).join('; ')}`] : []),
        ].map((x) => (x ?? '').trim()).filter(Boolean),
      })
      continue
    }
    out.push({ page: p.eyebrow, lines: sectionLines(b, h) })
  }
  return out.filter((p) => p.lines.length > 0)
}

/** Every line a brief's printed pages carry (`printedPages`), once. Pure. */
export const printedLines = (pages: readonly PrintedPage[]): string[] => [...new Set(pages.flatMap((p) => p.lines))]

/** One In short sentence as the check sees it. */
export interface InShortItem { id: string; role: BriefRole; sentence: string }

/** The set's In short sentences, numbered S1… across the set in role order.
 *  Pure. */
export function inShortItems(briefs: readonly Pick<MonthlyBriefData, 'role' | 'inShort'>[]): InShortItem[] {
  const out: InShortItem[] = []
  for (const role of BRIEF_ROLES) {
    const d = briefs.find((b) => b.role === role)
    if (!d) continue
    for (const sentence of splitSentences(d.inShort.summary.trim())) out.push({ id: `S${out.length + 1}`, role, sentence })
  }
  return out
}

export const inShortSchema = () => z.object({
  sentences: z.array(z.object({
    sentence: z.string().describe('The sentence id, as given (S1, S2...).'),
    printed: z.boolean().describe('True only where the printed pages of the same brief say everything this sentence says.'),
    missing: z.string().describe('What the sentence names or claims that no page of its brief says, in a few words; "" where printed is true.'),
  })),
})
export type InShortOutput = z.infer<ReturnType<typeof inShortSchema>>

export function buildInShortPrompts(a: { company: string; briefs: readonly { role: BriefRole; pages: readonly PrintedPage[] }[]; items: readonly InShortItem[] }): { system: string; user: string } {
  const system = [
    `You check the "In short" of department briefs written for ${a.company} about one month of talk in its market. In short opens each brief and may sum up only what that brief's printed pages say.`,
    '',
    'For every sentence, answer:',
    '- printed: true only where the printed pages of the SAME brief say everything the sentence says: every group of people, product, brand, place, behaviour, reason, comparison and claim in it. The wording may differ; the meaning must be on a page. A sentence that names even one thing no page of its brief says is not printed, however much of the rest is.',
    '- missing: what the sentence names or claims that no page of its brief says, in a few words; "" where printed is true.',
    '',
    'Judge each sentence against its own brief\'s pages only: never another brief\'s pages, the other sentences, or what you know about the market.',
    'Answer for every sentence, in the order given.',
  ].join('\n')
  const user: string[] = []
  for (const b of [...a.briefs].sort((x, y) => BRIEF_ROLES.indexOf(x.role) - BRIEF_ROLES.indexOf(y.role))) {
    const mine = a.items.filter((i) => i.role === b.role)
    if (mine.length === 0) continue
    user.push(`# ${BRIEF_NAME[b.role]}`, '', '## Its printed pages')
    for (const p of b.pages) user.push(`### ${p.page}`, ...p.lines.map((l) => `- ${l}`))
    user.push('', '## Its In short', ...mine.map((i) => `${i.id} ${i.sentence}`), '')
  }
  return { system, user: user.join('\n').trim() }
}

/** A sentence the check dropped, and what it named that no page carries. */
export interface InShortDrop { role: BriefRole; sentence: string; missing: string | null }

/**
 * The check's answer acted on (pure): each brief keeps the In short sentences
 * its printed pages carry, in order; a sentence they do not carry, or one the
 * check gave no answer for, drops whole into `held`. `kept` is each brief's
 * sentences that passed (what `--from` holds a stored summary to).
 */
export function applyInShort<T extends MonthlyBriefData>(
  briefs: readonly T[],
  items: readonly InShortItem[],
  out: InShortOutput | null,
): { briefs: T[]; kept: Partial<Record<BriefRole, string[]>>; dropped: InShortDrop[] } {
  const verdicts = new Map((out?.sentences ?? []).map((v) => [String(v.sentence).trim().toUpperCase(), v]))
  const kept: Partial<Record<BriefRole, string[]>> = {}
  const dropped: InShortDrop[] = []
  const next = briefs.map((d) => {
    const mine = items.filter((i) => i.role === d.role)
    const keep: string[] = []
    const held = [...d.held]
    for (const i of mine) {
      const v = verdicts.get(i.id)
      if (v?.printed === true) { keep.push(i.sentence); continue }
      const missing = v ? v.missing.trim() || null : null
      dropped.push({ role: d.role, sentence: i.sentence, missing })
      held.push({ what: `in short: ${i.sentence.slice(0, 90)}`, reason: v ? `no printed page says it${missing ? `: ${missing}` : ''}` : 'the In short check gave no answer for it' })
    }
    kept[d.role] = keep
    return keep.length === mine.length ? d : { ...d, inShort: { ...d.inShort, summary: keep.join(' ') }, held }
  })
  return { briefs: next, kept, dropped }
}

/** The In short sentences a summary holds, as the check numbered them. */
export const summarySentences = (summary: string): string[] => splitSentences(summary.trim())

/** A printed line as `inShortStillHolds` compares it with a saved record:
 *  the curly quotes round a footnote's names, and a chip that only repeats
 *  another's plural, are how the deck draws the page, not what it says
 *  (deck.ts `footnoteOf`, `distinctChips`; 12 Oct), so a line the check read
 *  before either (the September v2 build) still matches the line that prints
 *  now. Pure. */
export function sameWords(line: string): string {
  const plain = line.replace(/[“”]/g, '')
  const at = plain.indexOf(': ')
  return at < 0 ? plain : `${plain.slice(0, at + 2)}${distinctChips(plain.slice(at + 2).split(', ')).join(', ')}`
}

/** Is every sentence of a stored summary one the check found printed, and
 *  does every line the check read still print (`sameWords`)? What a stored
 *  brief is held to without a model call (`--from`). Pure. */
export function inShortStillHolds(
  d: StoredBriefData,
  record: { read: readonly string[]; kept: readonly string[] },
  words?: QuoteWordsOf,
): { holds: boolean; why: string | null } {
  const sentences = summarySentences(d.inShort.summary)
  // No In short, nothing to hold (its page is left out).
  if (sentences.length === 0) return { holds: true, why: null }
  const unchecked = sentences.filter((s) => !record.kept.includes(s))
  if (unchecked.length) return { holds: false, why: `its In short has ${unchecked.length === 1 ? 'a sentence' : `${unchecked.length} sentences`} the In short check did not pass: "${unchecked[0].slice(0, 80)}"` }
  const now = new Set(printedLines(printedPages(d, words)).map(sameWords))
  const gone = record.read.filter((l) => !now.has(sameWords(l)))
  if (gone.length) return { holds: false, why: `${gone.length === 1 ? 'a line' : `${gone.length} lines`} the In short check read no longer ${gone.length === 1 ? 'prints' : 'print'} under the current deck: "${gone[0].slice(0, 80)}"` }
  return { holds: true, why: null }
}
