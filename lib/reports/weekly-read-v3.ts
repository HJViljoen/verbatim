import { fmtInt } from '../format'
import type { Verdict } from '../reading/verdicts'
import { inMonth, monthHeading } from '../written/month'
import type { WeekReadData } from '../written/types'
import type { FigureTable } from './types'
import { BIGGEST_HEADING, levelOneView, resolvedQuote, weekReadDates, type LevelOneLead, type LevelOneRow, type ResolvedQuote } from './weekly-read'

// THE WEEKLY READ, VERSION 3 (18 Oct; the H7 boards, approved by Heinrich with
// the lead's recommendations). The email is grouped BY QUESTION, not by the
// site's pages (H7-Email-Weekly-Alt): THIS WEEK (the week in one line and the
// first sentence of each thing it means, the market's week beside its month,
// the month-closing line where the run closed a month, what stood out), the
// MONTH SO FAR (every ready subject's stored headline, the group in the most
// videos, your products), then WHAT TO DO NEXT (the post ideas or the question
// asked most, Worth a reply, the advice waiting). The full read (share page,
// viewer, A4) is ONE visual system (H7-Weekly-Full / -Print): the week card,
// Also this week, the subject cards in full, the pages with room.
//
// This file is the pure half the renderers read: the frozen parts' shapes
// (what `snapshotWeeklyRead` adds to a version-3 snapshot, every one optional
// so a snapshot missing a part renders without it, never an empty section)
// and the view over a snapshot. No I/O and no React. The builders that turn
// each page's reader into its part are lib/reports/weekly-read-v3-build.ts;
// the reads, lib/reports/weekly-read-lines-load.ts.
//
// DECISION 1 THROUGHOUT: a week's figure is printed beside its month, and no
// direction word stands outside a verdict node (a flag's chip, a move's
// verdict). No quote in the email: the full read's quotes are refs resolved at
// render. RULING U6: only a READY subject's stored words are frozen, so no
// unready subject's words are in the snapshot at all.

// ---- The frozen parts ---------------------------------------------------------------------

/** One ready subject's stored read, as Market's subject card prints it
 *  (`subjectOwnRead`, the one rule), frozen with the issue. */
export interface WeeklySubjectRead {
  id: string
  /** The client's own name for it. */
  name: string
  /** `ready`: written; `thin`: code's one short line on where its talk sat. */
  status: 'ready' | 'thin'
  /** The subject's main point in one line (`week_read` prose, stored). Null
   *  on a thin read and on a read stored before headlines (subject_read_v3). */
  headline: string | null
  /** What it means, in full (`week_read` prose). Null on a thin read. Where a
   *  ready read has no meaning, its first "what people said" paragraph, as
   *  Market's card prints it. */
  means: string | null
  /** A thin read's stored line, or null. */
  line: string | null
  /** Its page on Market, for the month the read is of. */
  href: string
}

/** The month-closing line (decision 8, after the week's numbers): the run's
 *  window holds the first day of the month it ends in, and the month's
 *  long-run read is published. Code's words only: the title is the read's
 *  months, "What holds across September and October". */
export interface WeeklyMonthClose {
  /** The month that closed, `YYYY-MM-01`. */
  month: string
  title: string
  /** Market › This month for that month, at the read's anchor. */
  href: string
}

/** Voices: the group in the most videos this month, the other groups by name,
 *  and, where the brands are counted, the two brands named most unprompted
 *  (`topVoices`, the Dashboard tile's reader). A whole-month reading: its
 *  month carries `readingMonthLabel` where it is not the current one. */
export interface WeeklyVoicesPart {
  month: string
  /** "October so far", "September". */
  monthWords: string
  monthLabel: string | null
  /** The market's videos this month. */
  videos: number | null
  group: { name: string; oneLiner: string | null; videos: number; href: string } | null
  /** The other groups, most videos first (names only, decision 5). */
  others: string[]
  /** Only where the brands are counted (`brandsState` ready). */
  named: { label: string; k: number; n: number; you: boolean; href: string }[]
  href: string
}

/** Your products (behind `PRODUCT_READINGS_ENABLED`; absent where the tile is
 *  not `ready`): how many of the catalogue came up, the videos about them or
 *  their categories, up to five products, most videos first, each with its
 *  category, its videos and the shelf's first-time mark, and the categories'
 *  videos for the full read. A whole-month reading. */
export interface WeeklyProductsPart {
  month: string | null
  monthWords: string
  monthLabel: string | null
  cameUp: number
  products: number
  videos: number | null
  top: { id: string; name: string; category: string; videos: number; first: boolean; href: string }[]
  categories: { id: string; name: string; videos: number; href: string }[]
  href: string
}

/** Content: the week's post ideas (titles through the written read's scrub),
 *  the days they read, the medical team line where the market is medical;
 *  with no idea for this week, the question asked most that your posts have
 *  not touched (the Dashboard tile's stand-in, `topAsked`); and Worth a reply
 *  (a link, never a count). */
export interface WeeklyContentPart {
  ideas: { id: string; title: string; href: string }[]
  /** "21 Sep to 18 Oct": the days the ideas read. */
  read: string | null
  /** In a medical market the ideas carry the medical team line, once. */
  medical: boolean
  asked: {
    label: string
    week: number | null
    month: number | null
    /** "this week", or the days of a window that is not seven. */
    weekWords: string
    /** "in October so far". */
    monthWords: string
    href: string
  } | null
  /** "Comments written 12 to 18 Oct worth an answer from you". */
  replies: { href: string; days: string | null }
  href: string
}

/** Your moves: the advice waiting for a decision (the count Your moves' bar
 *  prints, the first few in its order) and, where a dated move's comparison
 *  may print, its one verdict line (`topMoves`). */
export interface WeeklyMovesPart {
  waiting: number
  /** The first is the email's; the full read lists them all (at most
   *  `MOVES_LISTED`). `untitled`: the page's own words, not stored prose. */
  advice: { title: string; untitled: boolean; href: string; figure: string | null; since: string | null }[]
  move: {
    title: string
    /** `YYYY-MM-DD`. */
    day: string
    /** What it is on: a subject's name or a theme's label. */
    label: string | null
    kind: string
    href: string
    before: { k: number; n: number }
    after: { k: number; n: number }
    /** The two months in words, the later one labelled (decision 3). */
    months: { before: string; after: string }
    verdict: Verdict
  } | null
  href: string
  recordHref: string
}

/** The pages' parts, frozen when the snapshot was built. */
export interface WeeklyPages {
  voices?: WeeklyVoicesPart | null
  products?: WeeklyProductsPart | null
  content?: WeeklyContentPart | null
  moves?: WeeklyMovesPart | null
}

/** The most pieces of advice the full read lists. */
export const MOVES_LISTED = 4
/** The most products the email names. */
export const PRODUCTS_NAMED = 5

// ---- Market's words -----------------------------------------------------------------------

/** Market's eyebrows for "Also this week" (components/pages/v2/market/
 *  analysis.tsx; a test holds them equal). */
export const MOST_TALKED = BIGGEST_HEADING
export const ALSO_TALKED = 'Also talked about'
export const NOTHING_NEW = 'Nothing new this week'
export const NEW_THIS_WEEK = 'New this week'
/** Your products' first-time mark (`TOP_LABELS.first`; a test holds them
 *  equal). */
export const FIRST_TIME = 'Came up for the first time'

/** How many things stood out, the lead included (Market's three cards). */
export const STOOD_OUT = 3

// ---- The view ----------------------------------------------------------------------------

/** One thing that stood out, in Market's eyebrows: a flag's chip (the check's
 *  own word), "New this week", "Most talked about this week" or "Also talked
 *  about"; never a band sentence. */
export interface StoodOutRow {
  key: string
  /** The eyebrow's words, and whether they are a verdict's ("New this week",
   *  "Nothing new this week"). Null where a chip stands in its place. */
  eyebrow: { text: string; verdict: boolean } | null
  /** A flag's chip ("Unusual this week"). */
  chip: string | null
  /** The full read's third card, where nothing was new: "Also talked about"
   *  under its "Nothing new this week" eyebrow. */
  sub: string | null
  label: string
  /** A theme's label is Pass B's words; a finding's headline the writer's; a
   *  kind, a subject or a rival code's or the client's. */
  labelKind: 'theme' | 'finding' | 'plain'
  figure:
    | { kind: 'week'; week: number; month: number | null; where: string }
    | { kind: 'flag'; k: number; n: number; usual: { k: number; n: number; months: string } | null }
  href: string
  lead: boolean
}

export interface WeeklyV3View {
  /** The read's month, `YYYY-MM-01`. */
  month: string
  /** "12 to 18 October". */
  dates: string
  /** The week in one line. */
  line: string
  /** What it means, in full (the full read). */
  means: string[]
  /** The first sentence of each (the email). */
  meansFirst: string[]
  story: { body: string; quote: ResolvedQuote | null }[]
  /** New this week's sentences. */
  fresh: string[]
  watch: string[]
  figures: FigureTable
  /** The market's week beside its month. */
  numbers: { week: { videos: number; comments: number | null }; month: { videos: number; comments: number | null } } | null
  /** "October so far", "October in total": the numbers' month cell. */
  monthCell: string
  /** "in October so far", "in October". */
  where: string
  /** The month group's heading: "October so far", or "October" for a week
   *  that carried past its end. */
  monthGroup: string
  stoodOut: StoodOutRow[]
  subjects: WeeklySubjectRead[]
  pages: WeeklyPages
  monthClose: WeeklyMonthClose | null
}

/** The first sentence of a paragraph (the email's "What it means"), whole:
 *  never cut mid-sentence. */
export function firstSentenceOf(s: string): string {
  const t = s.trim()
  const m = /^[\s\S]*?[.!?](?=\s|$)/.exec(t)
  return (m ? m[0] : t).trim()
}

/** A line that ends a thought ends with a stop: a watch line is stored as a
 *  bare clause. */
function closed(s: string): string {
  const t = s.trim()
  return !t || /[.!?…"”)]$/.test(t) ? t : `${t}.`
}

/** What a row of the level-1 view says, in Market's eyebrows. */
function rowOf(r: LevelOneRow & { chip?: string | null }, i: number, eyebrow: StoodOutRow['eyebrow'], where: string): StoodOutRow {
  const figure: StoodOutRow['figure'] = r.kind === 'flag' && r.flag
    ? { kind: 'flag', k: r.flag.week.k, n: r.flag.week.n, usual: r.usual ?? null }
    : { kind: 'week', week: r.counts?.week ?? 0, month: r.counts?.month ?? null, where }
  return {
    key: `row-${i}`,
    eyebrow: r.kind === 'flag' ? null : eyebrow,
    chip: r.kind === 'flag' ? r.chip ?? null : null,
    sub: null,
    label: r.label,
    labelKind: r.theme ? 'theme' : 'plain',
    figure,
    href: r.href,
    lead: false,
  }
}

/** The lead, in Market's eyebrows. */
function leadOf(lead: LevelOneLead, where: string, chip: string | null): StoodOutRow {
  if (lead.kind === 'flag') {
    const f = lead.flag
    return {
      key: 'lead', eyebrow: null, chip, sub: null, label: f.label.trim(), labelKind: f.objectKind === 'theme' ? 'theme' : 'plain',
      figure: { kind: 'flag', k: f.week.k, n: f.week.n, usual: lead.usual }, href: lead.href, lead: true,
    }
  }
  return {
    key: 'lead',
    eyebrow: lead.kind === 'new' ? { text: NEW_THIS_WEEK, verdict: true } : { text: MOST_TALKED, verdict: false },
    chip: null,
    sub: null,
    label: lead.label ?? '',
    labelKind: lead.labelKind === 'finding' ? 'finding' : 'theme',
    figure: { kind: 'week', week: lead.videos.week, month: lead.videos.month, where },
    href: lead.href,
    lead: true,
  }
}

/**
 * What stood out this week, as Market's three cards say it (`weekLead`, the
 * one rule; the read's frozen conversations; a flag only where it prints,
 * which `printableWeekRead` decided when the snapshot was built): the lead,
 * then the other flags, the other new conversations and what else was talked
 * about most, three in all. A heard row reads "Most talked about this week"
 * where the lead is a flag or a new conversation (the biggest card's eyebrow),
 * else "Also talked about". `full`: the full read's third card says "Nothing
 * new this week" over what else was talked about where nothing was new, as
 * Market's new card does. `chipOf` turns a verdict into its chip's word
 * (`flagWordOf` and `FLAG_WORDS`, components/v2/flag-chip.tsx). Pure.
 */
export function stoodOutOf(read: WeekReadData, chipOf: (v: Verdict | null) => string | null, full = false): StoodOutRow[] {
  const view = levelOneView(read)
  const where = view.where
  const rows: StoodOutRow[] = []
  if (view.lead) rows.push(leadOf(view.lead, where, view.lead.kind === 'flag' ? chipOf(view.lead.flag.verdict) : null))
  let heard = 0
  for (const [i, r] of view.also.entries()) {
    if (rows.length >= STOOD_OUT) break
    const eyebrow: StoodOutRow['eyebrow'] = r.kind === 'new'
      ? { text: NEW_THIS_WEEK, verdict: true }
      : { text: heard === 0 && view.lead?.kind !== 'biggest' ? MOST_TALKED : ALSO_TALKED, verdict: false }
    if (r.kind === 'heard') heard++
    rows.push(rowOf({ ...r, chip: r.kind === 'flag' ? chipOf(r.verdict) : null }, i, eyebrow, where))
  }
  const v2 = read.version === 2 ? read : null
  const anyNew = (v2?.newThisWeek ?? []).some((x) => (x.body ?? '').trim()) || rows.some((r) => r.eyebrow?.text === NEW_THIS_WEEK)
  const last = rows[STOOD_OUT - 1]
  if (full && !anyNew && last && last.eyebrow && last.eyebrow.text === ALSO_TALKED) {
    rows[STOOD_OUT - 1] = { ...last, eyebrow: { text: NOTHING_NEW, verdict: true }, sub: ALSO_TALKED }
  }
  return rows
}

/** The version-3 issue, top to bottom, from a snapshot's frozen parts. Pure. */
export function weeklyV3View(a: {
  read: WeekReadData
  subjects?: readonly WeeklySubjectRead[] | null
  pages?: WeeklyPages | null
  monthClose?: WeeklyMonthClose | null
  chipOf: (v: Verdict | null) => string | null
  full?: boolean
}): WeeklyV3View {
  const read = a.read
  const v2 = read.version === 2 ? read : null
  const figures = read.figures ?? {}
  const complete = v2?.monthComplete
  const means = (v2?.implications ?? []).map((x) => (x.body ?? '').trim()).filter(Boolean)
  const market = v2?.market ?? null
  const both = market != null && market.week.comments != null && market.month.comments != null
  const numbers = market && market.week.videos != null && market.month.videos != null
    ? {
        week: { videos: market.week.videos, comments: both ? market.week.comments : null },
        month: { videos: market.month.videos, comments: both ? market.month.comments : null },
      }
    : null
  const line = read.version === 2 ? (read.headline ?? '').replace(/\s+/g, ' ').trim() : (read.inShort ?? '').trim()
  return {
    month: read.month,
    dates: weekReadDates(read.window),
    line,
    means,
    meansFirst: means.map(firstSentenceOf).filter(Boolean),
    story: (v2?.story ?? []).map((p) => ({ body: (p.body ?? '').trim(), quote: resolvedQuote(p.quote) })).filter((p) => p.body),
    fresh: (v2?.newThisWeek ?? []).map((x) => (x.body ?? '').trim()).filter(Boolean),
    watch: (v2?.watch ?? []).map((x) => closed(x.body ?? '')).filter(Boolean),
    figures,
    numbers,
    monthCell: monthHeading(read.month, complete),
    where: inMonth(read.month, complete),
    monthGroup: complete ? monthHeading(read.month, true).replace(/ in total$/, '') : monthHeading(read.month, false),
    stoodOut: stoodOutOf(read, a.chipOf, a.full ?? false),
    subjects: [...(a.subjects ?? [])],
    pages: a.pages ?? {},
    monthClose: a.monthClose ?? null,
  }
}

/** "19 videos this week · 54 in October so far" (a stood-out row's words,
 *  for the plain text and a test). */
export function weekFigureWords(f: Extract<StoodOutRow['figure'], { kind: 'week' }>): string {
  const week = `${fmtInt(f.week)} ${f.week === 1 ? 'video' : 'videos'} this week`
  return f.month != null ? `${week} · ${fmtInt(f.month)} ${f.where}` : week
}

/** Does a part belong under the month's heading at the month's own words, or
 *  does it say its own month (a whole-month reading of another month)? */
export function sameMonth(a: string | null | undefined, b: string): boolean {
  return Boolean(a) && a!.slice(0, 7) === b.slice(0, 7)
}
