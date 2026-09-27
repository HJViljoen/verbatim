import { fmtInt, longMonth, shortDate } from '../format'
import { THEME_FLOOR } from './overview-market/board'
import type { ClaimSubjects, MarketSurfaceData } from './market-surface'

// Your moves' "In one line" (the approved preview's hero, WP3.6 wave 2).
//
// WHAT THE PAGE SAYS BEFORE ANY TABLE: the questions your market asked most in
// the reading month, where your moves stand, and, in the line under it, the
// counts behind the first sentence and what your own posts talk about most.
// Every word is composed here from fields the page already carries (Y1's
// question themes, Y4's moves, Y3's claims by subject), so the hero cannot
// count one thing two ways: no read of its own, and no figure the blocks under
// it do not print.
//
// ONE DENOMINATOR PER SENTENCE (plan §4.0): the question counts are of the
// month's category videos, the claims of your claims read to date, and each
// sits in its own sentence.
//
// THE CLAIMS SENTENCE WAITS FOR THE JUDGE. "Talk most about" ranks subjects by
// the claims the post-and-claim judge filed under each (MF3), so it prints only
// once every claim is filed for every subject (`state: 'checked'`): a partial
// filing's counts are floors, and "45 of your 120 claims" would state a floor
// as a count. Say and hear prints the partial counts with the unfiled beside
// them; the hero says nothing it would have to hedge.

/** Question themes the hero names: the preview's three. */
export const LINE_THEMES = 3

export interface LineTheme {
  registryId: string
  /** The theme's label, as the questions table prints it. */
  label: string
  /** The label as a topic inside a sentence: "airline bag sizes". */
  topic: string
  videos: number
}

/** Where your moves stand, as the hero says it. */
export type LineMoves =
  /** `moves` (M4) is not applied here: the hero says nothing about moves. */
  | { state: 'unrecorded' }
  | { state: 'none' }
  | { state: 'dated'; count: number; title: string; datedOn: string }

export interface LineClaims {
  claims: number
  lead: { name: string; k: number }
  second: { name: string; k: number } | null
}

export interface MarketLine {
  month: string
  themes: LineTheme[]
  /** The category's videos in the month: the themes' base. */
  n: number | null
  /** The makers rule was read this month, so "not led by makers" is known. */
  makersRead: boolean
  moves: LineMoves
  claims: LineClaims | null
}

// A LEAF COPY of mf/s3-ask-reports' `topicOf` (lib/agent/starters.ts, Ask's
// starter cards), which is not on this base: one theme label, one topic, on
// both pages once the two merge. Fold into the one function at that merge.
const LEADING = /^(confusion|questions?|interest|curiosity|frustrations?|praise|love|requests?|needs?|demand|worries|concerns?|complaints?|appreciation|admiration|respect|excitement|doubts?)\s+(over|about|in|with|for|on|around|regarding)\s+/i
const TRAILING = /\s+(questions?)$/i

/**
 * A theme label's topic, for the middle of a sentence: without its leading
 * noun phrase or a trailing "questions", first letter lowered. "Confusion over
 * airline bag sizes" → "airline bag sizes", "Price and sale questions" →
 * "price and sale". A first word that is a name ("TikTok", "USB-C") keeps its
 * capital: it carries another capital after its first letter.
 */
export function topicOf(label: string): string {
  const t = label.trim().replace(LEADING, '').replace(TRAILING, '')
  const first = t.split(/\s/)[0] ?? ''
  if (/[A-Z]/.test(first.slice(1))) return t
  return t.charAt(0).toLowerCase() + t.slice(1)
}

/** The date a move is read from: the day it was dated, else the day it was
 *  declared (every move before MF5). */
const readFrom = (m: { datedOn?: string | null; declaredAt: string }): string => (m.datedOn ?? m.declaredAt).slice(0, 10)

function lineMoves(m: MarketSurfaceData['moves']): LineMoves {
  if (!m.recorded) return { state: 'unrecorded' }
  // A PAGE READ IN THE MARKET lists its moves as `market`; a stored copy
  // without it lists `rows`. Either way every move counts, as Y4 draws them.
  const moves: { title: string; declaredAt: string; datedOn?: string | null }[] = m.market ?? m.rows
  if (moves.length === 0) return { state: 'none' }
  const latest = [...moves].sort((a, b) => readFrom(b).localeCompare(readFrom(a)) || a.title.localeCompare(b.title))[0]
  return { state: 'dated', count: moves.length, title: latest.title, datedOn: readFrom(latest) }
}

/**
 * What your posts talk about most, by the claims filed under each subject.
 * Null until every claim is filed (see the header), where no subject carries
 * one, or where the lead is not clear: the second subject is named only above
 * the third, and a tie at the top with nothing clear under it names neither.
 */
export function lineClaims(c: ClaimSubjects | null | undefined): LineClaims | null {
  if (!c || c.state !== 'checked' || c.claims === 0) return null
  const [a, b, third] = c.subjects
  if (!a || a.k <= 0) return null
  const secondClear = b != null && b.k > 0 && b.k > (third?.k ?? 0)
  if (secondClear) return { claims: c.claims, lead: { name: a.name, k: a.k }, second: { name: b.name, k: b.k } }
  if (a.k > (b?.k ?? 0)) return { claims: c.claims, lead: { name: a.name, k: a.k }, second: null }
  return null
}

/** The hero's reading, or null on a copy stored before Y1 (no questions). */
export function marketLine(data: MarketSurfaceData): MarketLine | null {
  const q = data.questions
  if (!q) return null
  return {
    month: q.month,
    themes: q.themes.slice(0, LINE_THEMES).map((t) => ({ registryId: t.registryId, label: t.label, topic: topicOf(t.label), videos: t.videos })),
    n: q.n,
    makersRead: q.segments === 'measured',
    moves: lineMoves(data.moves),
    claims: lineClaims(data.ways.claimSubjects),
  }
}

// ---- the words ------------------------------------------------------------------
//
// PARTS, NOT STRINGS: a figure, a theme's words and a move's title are their
// own nodes on the page (the copy contract's `figure`, `subject` and `quote`:
// a title is the client's own words, not a claim of ours), so the sentences
// are built once as parts and joined into text only for a test or a plain
// reading.

export type LinePart = string | { figure: number } | { topic: string } | { own: string }

/** "a", "a and b", "a, b and c". A list whose items hold an "and" of their own
 *  ("buying and shipping") takes the serial comma, so "and bag materials"
 *  cannot read as part of the item before it; a pair of them repeats its
 *  preposition instead ("prosthetic function, and about price and
 *  availability"), where "a and b and c" would not say where the pair splits. */
function listOf(items: readonly LinePart[][], preposition = ''): LinePart[] {
  if (items.length === 0) return []
  if (items.length === 1) return items[0]
  const heldAnd = items.some((p) => p.some((x) => typeof x === 'object' && 'topic' in x && /\band\b/.test(x.topic)))
  const last = !heldAnd ? ' and ' : items.length > 2 ? ', and ' : preposition ? `, and ${preposition} ` : ', and '
  const out: LinePart[] = []
  items.forEach((p, i) => {
    if (i > 0) out.push(i === items.length - 1 ? last : ', ')
    out.push(...p)
  })
  return out
}

const COUNT_WORDS: Record<number, string> = { 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine' }

/** The moves clause: "No move is dated yet.", or the latest dated one. */
export function movesSentence(m: LineMoves): LinePart[] {
  if (m.state === 'unrecorded') return []
  if (m.state === 'none') return ['No move is dated yet.']
  const title: LinePart[] = ['“', { own: m.title }, '”']
  const day = `, ${shortDate(m.datedOn)}.`
  if (m.count === 1) return ['One move is dated: ', ...title, day]
  const count = COUNT_WORDS[m.count]
  return [...(count ? [`${count}`] : [{ figure: m.count }]), ' moves are dated, the latest ', ...title, day]
}

/** The hero's sentence: what your market asked most, then your moves. */
export function headlineParts(line: MarketLine): LinePart[] {
  const month = longMonth(line.month)
  const asked: LinePart[] = line.themes.length > 0
    ? [`In ${month} your market asked most about `, ...listOf(line.themes.map((t) => [{ topic: t.topic }]), 'about'), '.']
    : [`In ${month} no question your market asked reached `, { figure: THEME_FLOOR }, ' videos.']
  const moves = movesSentence(line.moves)
  return moves.length > 0 ? [...asked, ' ', ...moves] : asked
}

const THOSE: Record<number, string> = { 1: 'it', 2: 'those two', 3: 'those three' }

/** The line under it: the counts behind the first sentence, then what your
 *  own posts talk about most. Empty where there is neither. */
export function supportParts(line: MarketLine): LinePart[] {
  const out: LinePart[] = []
  if (line.themes.length > 0 && line.n != null) {
    const counts = listOf(line.themes.map((t) => [{ figure: t.videos }]))
    const whose = line.makersRead ? (line.themes.length === 1 ? ', in a theme not led by makers' : ', in themes not led by makers') : ''
    out.push(`Questions on ${THOSE[line.themes.length] ?? 'those'} came up in `, ...counts, ' of the ', { figure: line.n }, ` category videos${whose}.`)
  }
  const c = line.claims
  if (c) {
    if (out.length > 0) out.push(' ')
    out.push(
      'Your own posts, read to date, talk most about ', c.lead.name.toLowerCase(), ' (', { figure: c.lead.k }, ' of your ', { figure: c.claims }, ' claims)',
      ...(c.second ? [' and ', c.second.name.toLowerCase(), ' (', { figure: c.second.k } as LinePart, ')'] : []),
      '.',
    )
  }
  return out
}

/** Parts as plain text: a test's reading, and the email's alt text. */
export function partsText(parts: readonly LinePart[]): string {
  return parts.map((p) => (typeof p === 'string' ? p : 'figure' in p ? fmtInt(p.figure) : 'topic' in p ? p.topic : p.own)).join('')
}
