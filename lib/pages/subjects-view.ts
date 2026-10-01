import { fmtInt, longMonth, platformLabel, shortDate } from '../format'
import { carriesShare } from '../reading/level'
import { monthStartOf } from '../reading/month-key'
import type { ResolvedQuote } from '../reports/weekly-read'
import { printsMarket, readCalibration } from '../subjects/calibration-state'
import { talkKindLabel } from './overview-market/kinds'
import { WHAT_THEY_SELL } from './market-frame'
import { byRailRank, type SubjectRail, type SubjectsData } from './subjects'

// The Subjects page as the pages rebuild draws it (1 Oct, Page-Subjects.dc.html):
// one list of every subject you follow, and the selected subject's pane. Pure:
// the loader's `SubjectsData` (read lean) and the week read's line for the
// selected subject go in, and what the page prints comes out.
//
// WHAT THE PANE PRINTS, AND ON WHICH BASE:
//  · the standing line: the subject's market level in the reading month, on the
//    rail's own base (the category and the tracked brands pooled), its rank
//    among the subjects that print one, and the bar against 100%;
//  · the week read's sentence, the conversations inside it and its one quote,
//    only where the read is of the same month (a sentence about September does
//    not sit under an October figure);
//  · what people say about it: the kinds of its member insights, on its own
//    videos that month (the base stated once, in the subtitle);
//  · the questions asked on it, named by the clustering.
// A subject that is not ready prints none of the figures that rest on its
// matching (T0a, ruling U6): no level, no kinds, no questions. It keeps its name
// and what the read says about it.

/** The longest the pane prints of the client's own definition; the full text
 *  sits behind Edit (the design's "cut at 160 characters with an ellipsis"). */
export const COVERS_MAX = 160

/** The rank words, "never a digit in prose". Past the twelfth, nothing is said
 *  about rank (the standing line's rule, lib/written/standing.ts). */
const RANK_WORDS = [
  'the biggest', 'the second biggest', 'the third biggest', 'the fourth biggest', 'the fifth biggest', 'the sixth biggest',
  'the seventh biggest', 'the eighth biggest', 'the ninth biggest', 'the tenth biggest', 'the eleventh biggest', 'the twelfth biggest',
] as const

/** What people did in the comments, in the market's words (the approved Your
 *  market board). Praise names what the market buys where the product knows
 *  it (`WHAT_THEY_SELL`), so another tenant never reads "Praised a bag". */
export function subjectKindLabel(kind: string, clientId: string): string {
  return talkKindLabel(kind, WHAT_THEY_SELL[clientId])
}


/** The client's definition, cut at a word near `COVERS_MAX` with an ellipsis. */
export function coversLine(description: string | null | undefined, max = COVERS_MAX): string | null {
  const d = (description ?? '').replace(/\s+/g, ' ').trim()
  if (!d) return null
  if (d.length <= max) return d
  const cut = d.slice(0, max)
  // At a word: whole where the cut falls between two, else back to the last space.
  const atWord = /[\s,;:.]/.test(d.charAt(max))
  const space = cut.lastIndexOf(' ')
  return `${(atWord || space <= max * 0.6 ? cut : cut.slice(0, space)).replace(/[\s,;:.]+$/, '')}…`
}

/** "YouTube · 21 Sep": where and when the quote was said. */
export function quoteCite(q: Pick<ResolvedQuote, 'platform' | 'date'>): string {
  return [q.platform ? platformLabel(q.platform) : null, q.date ? shortDate(`${q.date}T12:00:00.000Z`) : null].filter(Boolean).join(' · ')
}

/** The week read's line on one subject, words resolved. */
export interface SubjectReadLine {
  /** The read's reading month, `YYYY-MM-01`. */
  month: string
  sentence: string
  contents: string[]
  quote: ResolvedQuote | null
}

export interface SubjectsRow {
  id: string
  name: string
  description: string | null
  /** Where the row opens its pane; null on a subject with no pane (failed,
   *  or named and not confirmed). */
  href: string | null
  selected: boolean
  status: 'active' | 'proposed'
}

export interface SubjectStandingView {
  /** The figure as printed: "23%", or the count under 100 videos. */
  value: string
  /** The bar's width, against 100%. */
  width: number
  /** The market's videos that month (the base). */
  n: number
  /** "the biggest", or null past the twelfth. */
  rank: string | null
}

export interface SubjectKindsView {
  of: number
  /** True where the base carries a share (100 videos or more); under it the
   *  rows print counts. */
  share: boolean
  rows: { kind: string; label: string; value: string; width: number }[]
}

export interface SubjectQuestionsView {
  videos: number
  rows: { id: string; label: string; videos: number }[]
}

export interface SubjectPaneView {
  id: string
  name: string
  description: string | null
  covers: string | null
  standing: SubjectStandingView | null
  sentence: string | null
  contents: string[]
  quote: ResolvedQuote | null
  kinds: SubjectKindsView | null
  questions: SubjectQuestionsView | null
}

export interface SubjectsView {
  /** "September", or "October so far" while the month is under way (U1: a
   *  calendar fact). */
  monthWords: string
  rows: SubjectsRow[]
  canEdit: boolean
  /** Confirmed subjects, for the ceiling on Add. */
  activeCount: number
  pane: SubjectPaneView | null
}

const pct = (k: number, n: number): number => (n > 0 ? Math.max(0, Math.min(100, (k / n) * 100)) : 0)

/** The ready rows that print a level, largest first: the order the rank
 *  words count in. */
function rankedReady(rows: readonly SubjectRail[]): SubjectRail[] {
  return rows
    .filter((r) => r.status === 'active' && r.market != null && printsMarket(r.calibration))
    .sort(byRailRank)
}

export function subjectsView(data: SubjectsData, read: SubjectReadLine | null, clientId: string): SubjectsView {
  const month = monthStartOf(data.month)
  const monthWords = data.reading?.state === 'so_far' ? `${longMonth(month)} so far` : longMonth(month)
  const rail = [...data.list.rows].filter((r) => r.status !== 'retired').sort(byRailRank)
  const rows: SubjectsRow[] = rail.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    href: r.href ? r.href : null,
    selected: r.selected,
    status: r.status === 'proposed' ? 'proposed' : 'active',
  }))

  const s = data.selected
  let pane: SubjectPaneView | null = null
  if (s) {
    const ready = readCalibration(s.calibration) === 'ready'
    const row = rail.find((r) => r.id === s.id) ?? null
    const market = ready ? (s.market ?? row?.market ?? null) : null
    let standing: SubjectStandingView | null = null
    if (market && market.n > 0) {
      const at = rankedReady(rail).findIndex((r) => r.id === s.id)
      standing = {
        value: carriesShare(market.n) ? `${Math.round(pct(market.k, market.n))}%` : fmtInt(market.k),
        width: pct(market.k, market.n),
        n: market.n,
        rank: at >= 0 && at < RANK_WORDS.length ? RANK_WORDS[at] : null,
      }
    }
    const kinds: SubjectKindsView | null = ready && s.kindsIn && s.kindsIn.of > 0
      ? {
          of: s.kindsIn.of,
          share: carriesShare(s.kindsIn.of),
          rows: s.kindsIn.rows.map((r) => ({
            kind: r.kind,
            label: subjectKindLabel(r.kind, clientId),
            value: carriesShare(s.kindsIn!.of) ? `${Math.round(pct(r.k, s.kindsIn!.of))}%` : fmtInt(r.k),
            width: pct(r.k, s.kindsIn!.of),
          })),
        }
      : null
    const asked = s.unanswered
    const questions: SubjectQuestionsView | null = ready && asked && asked.rows.length > 0 && asked.questionVideos > 0
      ? { videos: asked.questionVideos, rows: asked.rows.map((r) => ({ id: r.id, label: r.label, videos: r.videos })) }
      : null
    // The read speaks for its own month only.
    const line = read && monthStartOf(read.month) === month ? read : null
    pane = {
      id: s.id,
      name: s.name,
      description: s.description,
      covers: coversLine(s.description),
      standing,
      sentence: line?.sentence.trim() ? line.sentence.trim() : null,
      contents: line?.contents ?? [],
      quote: line?.quote ?? null,
      kinds,
      questions,
    }
  }

  return {
    monthWords,
    rows,
    canEdit: data.list.canEdit,
    activeCount: rail.filter((r) => r.status === 'active').length,
    pane,
  }
}
