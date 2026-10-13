import type { SupabaseClient } from '@supabase/supabase-js'

import type { Period } from '../../../components/v2/period-switch'
import { loadActiveSubjects } from '../../subjects/membership'
import { subjectCalibration } from '../../subjects/calibration-state'
import { isMissingSubjects, type Subject } from '../../subjects/types'
import { loadObjectReadings, type MarketObjectRef, type ObjectReading } from '../../agent/movement'
import { brandRulesFor } from '../../brands/aliases'
import { loadCommentNamings, trackedBrands, whoSplit, type WhoVideo } from '../../brands/attribution'
import { chunk, mapWithLimit, READ_CONCURRENCY, UUID_IN_CHUNK } from '../../chunk'
import { fmtInt, longMonth, platformLabel, shortDate } from '../../format'
import { gateFor } from '../../quote-context'
import { substituteFigures } from '../../reports/cover'
import type { FigureTable as PrintedFigures } from '../../reports/types'
import { proseFigures } from '../../prose/figures'
import { themeMonthLine, type ThemeMonthLine } from '../../reading/cross'
import { loadAppPairOn, ourChangesWithoutGatherFlags } from '../../reading/gather-flags'
import { isFailOpenFix, type OurChange } from '../../reading/comparability'
import { marketAudiences, pooledDenominators } from '../../reading/market'
import { monthStartOf, nextMonth, prevMonth } from '../../reading/month-key'
import type { PairOn } from '../../reading/pairs'
import { loadChanges, loadMonthSeries, loadWindowReading, type ReadingHandle, type WindowReading } from '../../reading/read'
import { loadCadenceRuns, loadDeliveredRuns, loadReadingSchedule, marketRivalAudiences, readingViewFrom, updateInstant } from '../../reading/reading-view'
import type { MonthSeries } from '../../reading/series'
import { TABLE_THEME_READINGS, type PlatformMix } from '../../reading/types'
import { readEvidenceRefs } from '../../reading/evidence-refs'
import { WEEK_CUT_SURFACES, preGatherCutBefore, type MarketWeekRowRaw } from '../../reading/weeks'
import type { ChartRun } from '../../reading/week-line'
import type { Verdict } from '../../reading/verdicts'
import { INDUSTRY_AUDIENCE, loadCompetitors, loadTrackedRivals } from '../../rivals'
import { selectAll } from '../../supabase-admin'
import { coveredDays, inMonth, monthsPhrase, readingMonthOf } from '../../written/month'
import { SLICE } from '../../reading/coverage'
import { FAILED_EXPLAINED, SUBJECT_NOT_MEASURED } from '../../subjects/calibration-state'
import { loadEarlierNewThisWeek, loadPublishedLongRun, loadPublishedWeekRead, type EarlierNew, type PublishedWeekRead } from '../../written/published'
import type { StoredLongRun } from '../../written/store'
import type { WeekReadData, WhoAbout, WhoPart } from '../../written/types'
import { weekReadDates } from '../../reports/weekly-read'
import { factsFromReadings, marketComparable } from '../../written/standing'
import { fetchRunningRunIds } from '../latest-video-run'
import { loadRegistryLabels } from '../registry-labels'
import { WHAT_THEY_SELL } from '../market-frame'
import { homeWeeks, homeWeeksFrame, loadWeekRows, WEEKS_FAILED, type WeeksFailed, type WeeksRead } from '../home'
import { loadThemeQuotes, loadThemeSegmentRows, makerRuleEnabled, voiceOf, type CiteCandidate } from '../overview'
import { pickQuotes, POOL_FLOOR } from '../overview-market'
import { talkKindLabel } from '../overview-market/kinds'
import { loadMemberInsightIdsBySubject } from '../subjects'
import { fetchThemedRunId } from '../themed-run'
import { askAboutTheme, loadLinkedTheme, loadThemeKinds } from '../voice-surface'
import { subjectOfTheme } from '../voice-conversation'
import { flagFigures, loadCheckStrict, loadFlagsStrict, weekFlagRows, type FlagRow, type UnusualFlag } from '../week'
import { weekLead } from '../../reading/week-lead'
import { setApartOf } from '../../written/conversations'
import { frozenFlag } from '../../written/unusual'

// MARKET (Design v2, depth plan T3; boards E2-Market and E2-Market-Open):
// what the market is talking about, at `/dashboard/market`.
//
// THE PAGE, TOP TO BOTTOM, AND WHERE EACH PART COMES FROM:
//   1. THE BAR: the period's dates and the market's videos and comments
//      (the published week read's frozen figures; the month's pooled
//      denominators), and the period switch (`?period=week|month|time`).
//   2. THE TOP ROW (this week): the anomaly check's first flag where it flagged
//      something (`raisedFlags`, This week's own rule, lib/pages/week.ts),
//      else the week's biggest conversation first heard this week (the read's
//      `newThisWeek`, `firstHeardThisWeek`), else the week's biggest; then the
//      biggest conversation's three weekly counts with no word (decision 1);
//      then the rest of "new this week". This month: the month's three biggest
//      conversations with their month bars. Over time: the market's months.
//   3. THE SUBJECT BOARD: every confirmed subject's month so far against last
//      month, banded through a `Verdict` (`loadObjectReadings`, the standing
//      reading, lib/written/standing.ts `factsFromReadings`), its month line,
//      and the conversations inside it (`subjectOfTheme`) with the period's
//      counts.
//   4. THE RAIL: what people do in the comments (the six kinds, the month so
//      far against last month), the market's videos week by week (the
//      Dashboard's own chart, `homeWeeks`), where it is said (`platform_mix`
//      of the window or the month) and, this week, the read's "worth
//      watching".
//   5. EVERY CONVERSATION: a table of the period's conversations, filterable
//      by subject (`?in=`), ten shown until `?all=1`.
//   6. THE OPEN PANEL (`?conv=<registry id or slug>`, `?subject=<id>`): the
//      conversation in full, in place, under the row it was opened from
//      (`?at=top|subjects|table`).
//   7. THIS MONTH ONLY, AT THE BOTTOM: the month's long-run read ("What holds
//      across August and September"), the published `week_reads` row of kind
//      'month' for the month the view reads (`loadPublishedLongRun` with
//      `month`; Heinrich, 13 Oct: below the month's data, never at the top,
//      never on This week or Over time). A month still filling has none of
//      its own until it closes, so there the newest ready read of any
//      EARLIER month (usually last month's; `before: month`) stands in,
//      headed with its own month ("September’s long-run read"),
//      one read only (`marketLongRunFor`). A closed month with no read, no
//      section. Stored `week_read` prose, read after the figures, so level 2
//      by position.
//
// DECISION 1 (13 Oct): no weekly direction words and no week figure on its
// own. A week count is printed beside its month ("19 this week · 31 in
// October so far"); three weeks are three bare counts; the subjects and the
// kinds compare the month so far with last month through a `Verdict`; the
// only chip a week earns is the anomaly check's ("Unusual this week").
//
// THEMES ARE THE CATEGORY'S (lib/reading/market.ts, GLOSSARY `market`): a
// conversation's k and n are the category's videos, never the pooled market's.
// The bar states the market once; every conversation figure says "category".
//
// NO QUOTES AT LEVEL 1 and NO MODEL SENTENCE AT THE TOP (Heinrich, 13 Oct):
// the gated quotes (`loadThemeQuotes`) and "our read" live in the open panel.
//
// PURE BUILDERS FIRST, THEN THE READS. Every read is the service role's
// (`reading.client`), scoped to the session's client; a read that fails costs
// its block, never the page.

// ---- Constants -------------------------------------------------------------------------

/** Conversations listed inside a subject on the board. */
export const MARKET_INSIDE = 3
/** Rows the conversation table shows before "Show all". */
export const MARKET_TABLE_ROWS = 10
/** A conversation is listed at this many of the period's category videos
 *  (the week pool's and the Dashboard's floor, `POOL_FLOOR`). */
export const MARKET_TABLE_FLOOR = POOL_FLOOR
/** Weekly counts on a conversation's card (decision 1: three bare counts). */
export const MARKET_WEEKS = 3
/** Quotes the open panel prints (level 2). */
export const MARKET_QUOTES = 3
/** Months a card's bars and the over-time table read, the month included. */
export const MARKET_CARD_MONTHS = 4
/** Months the open panel's line draws at most (the board's four). */
export const MARKET_PANEL_MONTHS = 4
/** Months Over time's market card draws at most. */
export const MARKET_TIME_MONTHS = 6
/** Months the subject board's small line reads. */
export const MARKET_SUBJECT_MONTHS = 6
/** The six kinds the rail prints, Your market's own (`PICTURE_KINDS`). */
export const MARKET_KINDS = ['question', 'praise', 'pain_point', 'feature_request', 'purchase_intent', 'objection'] as const
/** "Worth watching" items, at most. */
export const MARKET_WATCH = 2

// ---- The shapes --------------------------------------------------------------------------

/** Where an open panel sits: under the top row, under the subject board, or as
 *  the table's own row. */
export type PanelAt = 'top' | 'subjects' | 'table'

export interface MarketParams {
  period: Period
  /** `?month=YYYY-MM`: the month the month and over-time periods read. */
  month: string | null
  /** `?conv=`: a theme registry id, or a theme slug (an old `?themes=` link). */
  conv: string | null
  /** `?subject=`: a subject id. */
  subject: string | null
  at: PanelAt | null
  /** `?in=`: the table's subject filter. */
  in: string | null
  /** `?all=1`: the table shows every row. */
  all: boolean
}

/** A count with what it is out of. */
export interface Level {
  k: number
  n: number
}

/** One conversation as the cards, the board and the table print it. */
export interface MarketConv {
  /** `theme_registry.id`: the identity, never the label. */
  id: string
  label: string
  /** The themed run's kind for it (`question`, `pain_point`…). */
  kind: string | null
  subjectId: string | null
  subjectName: string | null
  /** The category's videos in the week read's window. Null outside the week. */
  week: number | null
  /** The three weekly windows, oldest first; a window our own change cut is
   *  null (never 0). Empty outside the week. */
  weeks: (number | null)[]
  /** The category's videos in the month the period is stated against. */
  month: number | null
  /** The months a card or the over-time table draws, oldest first. */
  months: MonthCount[]
  /** Who the period's videos are about. Empty where not read. */
  who: WhoPart[]
  /** The period's videos by platform (the week window's, else the month's). */
  mix: PlatformMix | null
  /** First heard this week (the week read's `newThisWeek`). */
  isNew: boolean
  /** The month against the month before, where the line answered. */
  monthVerdict: Verdict | null
  /** Half or more of its videos are makers' own posts, or off-topic: it stays
   *  in every count and the table, and leads nothing (decision F). */
  setApart: 'makers' | 'noise' | null
}

export interface MonthCount {
  month: string
  /** "Jul", or "Oct" for the month still filling. */
  label: string
  k: number | null
  n: number | null
  filling: boolean
}

/** The week the period reads: the published read's own frozen window. */
export interface MarketWeek {
  window: { from: string; to: string }
  /** "5 to 11 Oct". */
  dates: string
  /** The month the week is restated against (`readingMonthOf`). */
  month: string
  /** The week carried past that month's end: its figures are the month in
   *  full, never "so far". */
  monthComplete: boolean
  /** "in October so far", or "in September" once complete. */
  inMonth: string
  /** The market's videos and comments in the window, frozen at the run. */
  market: { videos: number | null; comments: number | null }
  /** The category's videos in the window, read live (every conversation's n). */
  category: number | null
  /** The three windows' categories, oldest first; null where cut. */
  categoryWeeks: (number | null)[]
  /** The windows' labels ("21 Sep"), oldest first. */
  weekLabels: string[]
}

export interface MarketMonth {
  month: string
  soFar: boolean
  /** "October so far", or "September". */
  text: string
  /** The pooled market's videos and comments in the month. */
  market: { videos: number | null; comments: number | null }
  /** The category's videos in the month. */
  category: number | null
  /** The month before: its name and the category's videos. */
  prev: { month: string; text: string; category: number | null }
}

/** The anomaly check's first flag, as the top card prints it. Its k of n is
 *  over the check's own denominator (`flag.denominator`, every audience
 *  together, your own posts included), which the card names; its month is the
 *  category's, named as such. */
export interface FlagCard {
  verdict: Verdict
  flag: Omit<UnusualFlag, 'quotes'>
  /** "July to September". */
  baselineText: string
  /** The conversation it names, where it names one this period holds. */
  conv: MarketConv | null
  /** Its month so far, for a theme or a subject: k of the base. */
  month: Level | null
  href: string | null
}

export type HeroCard =
  | { kind: 'flag'; card: FlagCard; groups: GroupLink[]; doing: Doing | null }
  | { kind: 'new' | 'biggest'; conv: MarketConv; href: string; groups: GroupLink[]; doing: Doing | null }

/** The top kind of a conversation's month: "Complained · 14 of 31". */
export interface Doing {
  kind: string
  label: string
  k: number
  n: number
}

export interface GroupLink {
  key: string
  name: string
  href: string
}

export interface SideCard {
  kind: 'biggest' | 'new_list' | 'month'
  /** Empty where the period has none for the card (the parity pass, 13 Oct:
   *  the card keeps its place and says so in its own frame). */
  convs: MarketConv[]
  hrefs: string[]
  /** The groups whose conversations include the card's first (names only). */
  groups: GroupLink[]
  /** `new_list` with nothing (else) first heard this week: whether ANY of the
   *  period's conversations was (the flag's, one set apart), so the card says
   *  "Nothing else new this week" and never contradicts a New chip. */
  anyNew?: boolean
  /** `new_list` with nothing first heard this week at all: the newest
   *  conversation an earlier week's published read first heard
   *  (`newThisWeek`), with that week's label ("28 Sep"), never one already on
   *  the row. Null where none of the last few weeks had one. */
  earlier?: { conv: MarketConv; href: string; week: string } | null
  /** `new_list` with no earlier one to name: the week's next biggest
   *  conversation not already on the row (`alsoTalkedOf`), so the card keeps
   *  the board's weight. Null where there is none. `groups` is absent where
   *  the groups were not read. */
  also?: { conv: MarketConv; href: string; groups?: GroupLink[] } | null
}

/** Every conversation a top card holds, its stand-ins included. */
export const sideIds = (s: SideCard): string[] => [...s.convs.map((c) => c.id), ...(s.earlier ? [s.earlier.conv.id] : []), ...(s.also ? [s.also.conv.id] : [])]

export interface TopRow {
  hero: HeroCard | null
  sides: SideCard[]
  /** Over time: the market's months. */
  months: MonthCount[] | null
}

export interface SubjectRow {
  id: string
  name: string
  /** Null where the subject prints no level (`pending` says why). */
  level: (Level & { pct: number }) | null
  /** A subject that keeps its row without a level (the parity pass, 13 Oct:
   *  its name, its bar's track and the conversations inside it, the level's
   *  place saying why): its check is open (`provisional`), or the month was
   *  not read for it (`unread`). Null where the level prints. */
  pending: { state: 'provisional' | 'unread'; note: string } | null
  /** Last month's share for the tick, where the pair answered. */
  prevPct: number | null
  verdict: Verdict | null
  /** The month line, oldest first: shares, null where the month has none. */
  trail: { month: string; pct: number | null }[]
  inside: InsideRow[]
  href: string
}

export interface InsideRow {
  id: string
  label: string
  /** The period's count (the week's this week, else the month's). */
  count: number | null
  /** The month it is restated against (this week only). */
  month: number | null
  isNew: boolean
  flag: Verdict | null
  /** Set apart (decision F): listed and tagged, never leading. */
  setApart: 'makers' | 'noise' | null
  href: string
}

/** A subject that prints no level, and why (the calibration words). */
export interface UnmeasuredSubject {
  id: string
  name: string
  /** `provisional` (its check is open), `failed` (being re-described) or
   *  `unread` (nothing read for it in the month). */
  state: 'provisional' | 'failed' | 'unread'
  /** Why (`SUBJECT_NOT_MEASURED`, `FAILED_EXPLAINED`, or no reading this month). */
  note: string
  href: string
}

export interface SubjectBoard {
  monthText: string
  prevText: string
  /** The market's videos in the month: every level's n. */
  n: number | null
  /** Every subject that keeps its row: the measured ones largest first, then
   *  the ones with no level yet (`pending`), by state and name. */
  rows: SubjectRow[]
  /** Subjects hidden as being re-described (a failed check), with why: named
   *  in one line under the rows, never a row (decision C). */
  unmeasured: UnmeasuredSubject[]
  /** Whether any row draws last month's tick (the legend is printed only then). */
  ticks: boolean
}

export interface KindRow {
  kind: string
  label: string
  k: number
  n: number
  pct: number
  prevPct: number | null
  verdict: Verdict | null
}

export interface KindsBlock {
  monthText: string
  prevText: string
  n: number
  rows: KindRow[]
  /** Whether any row draws last month's tick (the key is printed only then). */
  ticks: boolean
}

export interface PlatformRow {
  platform: string
  label: string
  videos: number
  pct: number
}

export interface PlatformsBlock {
  /** "this week's", or "October's". */
  basis: 'week' | 'month'
  n: number
  rows: PlatformRow[]
  /** This week: each platform's videos in the month the week is stated
   *  against (decision 1), and that month's n. */
  month?: { counts: Record<string, number>; n: number; text: string } | null
}

/** A sentence stored with `[[key]]` figures, and the figures it names. */
export interface StoredLine {
  body: string
  figures: PrintedFigures
}

export interface MarketRail {
  kinds: KindsBlock | null
  /** The weekly volume: the chart, null where too few clean weeks were read
   *  (`homeWeeks`), `WEEKS_FAILED` where the read threw. */
  weeks: WeeksRead
  /** The chart's axis, the week labels oldest first (`homeAxis`): where no
   *  week can be drawn, the card still draws these slots, empty. */
  weeksAxis?: string[]
  platforms: PlatformsBlock | null
  /** The week read's "worth watching" (stored `week_read` prose). */
  watch: StoredLine[]
}

export interface TableFilter {
  id: string | null
  name: string
  /** The conversations in it; null for a subject whose check is open (the
   *  count rests on a membership not yet verified, ruling U6). */
  count: number | null
  href: string
}

export interface MarketTable {
  total: number
  rows: { conv: MarketConv; href: string; open: boolean }[]
  filters: TableFilter[]
  filter: string | null
  all: boolean
  showAllHref: string | null
  /** Over time: the months the columns read, with their category n. */
  months: { month: string; label: string; n: number | null; filling: boolean }[]
  /** Whether any conversation has a subject: no subject is measured, no
   *  Subject column. */
  subjects: boolean
}

export interface PanelQuote {
  text: string
  lang: string | null
  english: string | null
  /** "TikTok · 7 Oct". */
  source: string
  /** Who the video it was said under is filed under; null for the market. */
  about: WhoAbout | null
}

export interface ConvPanel {
  id: string
  label: string
  kind: string | null
  subjectName: string | null
  at: PanelAt
  notchAt: number
  flag: Verdict | null
  isNew: boolean
  stats: { value: number; of?: number; label: string }[]
  /** "Our read": the read's finding, else the flag's explanation, else the
   *  conversation's description. Level 2, stored prose. */
  ourRead: { slot: 'week_read' | 'interpretation_anomaly' | 'pass_b_theme'; lines: StoredLine[] } | null
  line: { bars: MonthCount[]; verdict: Verdict | null; basis: string } | null
  who: { parts: WhoPart[]; n: number } | null
  doing: { rows: Doing[]; n: number; text: string } | null
  groups: GroupLink[]
  platforms: { rows: PlatformRow[]; n: number } | null
  quotes: PanelQuote[]
  askHref: string
  closeHref: string
}

export interface SubjectPanel {
  id: string
  name: string
  /** Not `ready`: no level, no conversations; `note` says why. */
  state: 'ready' | 'provisional' | 'failed' | 'unread'
  note: string | null
  at: PanelAt
  notchAt: number
  level: (Level & { pct: number }) | null
  verdict: Verdict | null
  monthText: string
  bars: MonthCount[]
  inside: InsideRow[]
  /** The week read's stored sentence on it, where the read is of this month. */
  sentence: StoredLine | null
  askHref: string
  closeHref: string
}

export interface MarketData {
  brand: string
  noun: string | null
  period: Period
  /** The week was asked for and there is no published read: the month shows. */
  weekUnavailable: boolean
  params: MarketParams
  week: MarketWeek | null
  month: MarketMonth
  top: TopRow
  subjects: SubjectBoard | null
  rail: MarketRail
  table: MarketTable | null
  panel: ConvPanel | null
  subjectPanel: SubjectPanel | null
  /** Who the talk is about: `counted` (brand rules and their rows),
   *  `not_counted` (rules, no rows written yet: Össur before its back-read) or
   *  `not_read` (no brand rules). Only `counted` prints a split. */
  brands: BrandsState
  /** This month only: the month's long-run read, printed below the month's
   *  data; null on the week and over time, and where none is published for
   *  the month the view reads. */
  longRun: MarketLongRun | null
  /** This month only: the long-run read could not be read (a failed
   *  `week_reads` read), so the page says so in one calm line rather than
   *  look like a month with no read. */
  longRunUnread: boolean
}

/** Whether the "about" split may print. */
export type BrandsState = 'counted' | 'not_counted' | 'not_read'

/** The month's long-run read as This month prints it, below the month's data
 *  (Heinrich, 13 Oct). The writer's words as stored (`week_read` prose,
 *  scrubbed when written); the counts are code's. Never a change: nothing in
 *  it compares one month with another. */
export interface MarketLongRun {
  /** The read's month, `YYYY-MM-01`: the month the view reads, or, where the
   *  view reads a month still filling that has none of its own (`earlier`),
   *  the newest earlier month with a ready read. */
  month: string
  /** The month the view reads, `YYYY-MM-01`. */
  viewMonth: string
  /** The newest earlier month's read, standing in on a filling month
   *  with no read of its own: the heading then names its month. */
  earlier: boolean
  /** The heading: "What holds across August and September" for the view's
   *  own read; "September’s long-run read" for an earlier one, so it never
   *  reads as this month's. */
  title: string
  /** "What holds across August and September" (the read's window months). */
  across: string
  /** The lead, where one survived the scrub. */
  inShort: string | null
  ideas: {
    headline: string
    body: string[]
    /** Distinct videos behind it over the read's window. */
    videos: number
    /** The months it was heard in, oldest first. */
    heard: string[]
    /** Who those videos are about (one brand per video), as stored. */
    who: WhoPart[]
  }[]
  /** Written before its month closed, on the comments to this day
   *  (`partialThrough`, the backfill): it does not stand as the month's read
   *  (`standsAsMonthRead`), and the page says which day it reads to. */
  partialThrough: string | null
}

// ---- Params and addresses (pure) --------------------------------------------------------

const MARKET = '/dashboard/market'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A registry id, or a slug. */
export const isRegistryId = (s: string): boolean => UUID_RE.test(s)

const one = (v: string | string[] | undefined | null): string | null => {
  const s = Array.isArray(v) ? v[0] : v
  return s && s.trim() ? s.trim() : null
}

/**
 * The page's params. The period opens on the week (Heinrich, 11 Oct); a bare
 * `?month=` (an old `overview?month=` link redirects with the period set) reads
 * the month. `?month=` takes `YYYY-MM` or a full date.
 */
export function marketParams(sp: Readonly<Record<string, string | string[] | undefined>>): MarketParams {
  const p = one(sp.period)
  const monthRaw = one(sp.month)
  const month = monthRaw && /^\d{4}-\d{2}/.test(monthRaw) ? `${monthRaw.slice(0, 7)}-01` : null
  const period: Period = p === 'week' || p === 'month' || p === 'time' ? p : month ? 'month' : 'week'
  const at = one(sp.at)
  return {
    period,
    month,
    conv: one(sp.conv),
    subject: one(sp.subject),
    at: at === 'top' || at === 'subjects' || at === 'table' ? at : null,
    in: one(sp.in),
    all: one(sp.all) === '1',
  }
}

/**
 * The page's address with these params. The period is left out on the week
 * (the default); the month only off the week. The hash is the panel's or the
 * block's anchor.
 */
export function marketHref(p: Partial<MarketParams>, hash?: string): string {
  const q = new URLSearchParams()
  if (p.period && p.period !== 'week') q.set('period', p.period)
  if (p.month && p.period && p.period !== 'week') q.set('month', p.month.slice(0, 7))
  if (p.conv) q.set('conv', p.conv)
  if (p.subject) q.set('subject', p.subject)
  if (p.at && (p.conv || p.subject)) q.set('at', p.at)
  if (p.in) q.set('in', p.in)
  if (p.all) q.set('all', '1')
  const qs = q.toString()
  return `${MARKET}${qs ? `?${qs}` : ''}${hash ? `#${hash}` : ''}`
}

/** The page's own address, period and month kept, nothing open. */
const baseOf = (p: MarketParams): Partial<MarketParams> => ({ period: p.period, month: p.month })

/** Open a conversation from where it was clicked. */
export function convHref(p: MarketParams, id: string, at: PanelAt): string {
  return marketHref({ ...baseOf(p), in: p.in, all: p.all, conv: id, at }, 'conv-panel')
}

/** Open a subject from the board. */
export function subjectHref(p: MarketParams, id: string): string {
  return marketHref({ ...baseOf(p), in: p.in, all: p.all, subject: id, at: 'subjects' }, 'subject-panel')
}

/** The page with nothing open, scrolled back to where the panel was. */
export function closeHref(p: MarketParams, at: PanelAt): string {
  const anchor = at === 'top' ? 'top-row' : at === 'subjects' ? 'subjects' : 'conversations'
  return marketHref({ ...baseOf(p), in: p.in, all: p.all }, anchor)
}

/** A period's address (the switch), the month kept off the week. */
export function periodHref(p: MarketParams, period: Period): string {
  return marketHref({ period, month: period === 'week' ? null : p.month })
}

// ---- Weeks (pure) -------------------------------------------------------------------------

/**
 * The three weekly windows a conversation's card counts: the read's own frozen
 * window and the windows of the same length immediately before it, oldest
 * first (AGENTS.md: the week comes off the run row, never the clock). Null
 * where the window does not parse.
 */
export function weekWindows(window: { from: string; to: string }, count = MARKET_WEEKS): { from: string; to: string }[] | null {
  const from = Date.parse(window.from)
  const to = Date.parse(window.to)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null
  const len = to - from
  const out: { from: string; to: string }[] = []
  for (let i = count - 1; i >= 0; i--) {
    out.push({ from: new Date(from - i * len).toISOString(), to: new Date(to - i * len).toISOString() })
  }
  return out
}

/**
 * WHERE OUR OWN CHANGES CUT THE WEEKS (the week chart's rule, lib/reading/
 * weeks.ts, applied to the run windows): a window that BEGINS before a change
 * on `WEEK_CUT_SURFACES` took effect was not read the way the newest one was,
 * so its count is not drawn (null). A fix of failed judgements cuts nothing
 * (`failOpenFix`), and a change the pipeline made inside a run before its
 * gather takes effect at that run (`preGatherCutBefore`).
 *
 * THE NEWEST WINDOW IS NEVER CUT. It is the reference the others are read
 * against, and the run that read it gathered after any change made inside it
 * (a person's change on 8 Oct inside a 5 to 12 Oct window cut all three and
 * emptied the page). Pure.
 */
export function cutWindows<T extends { from: string }>(
  windows: readonly T[],
  changes: readonly OurChange[],
  runs: Parameters<typeof preGatherCutBefore>[1] = [],
): boolean[] {
  const surfaces = new Set<string>(WEEK_CUT_SURFACES)
  let cut = -Infinity
  for (const c of changes) {
    if (!surfaces.has(c.surface) || c.failOpenFix) continue
    const at = Date.parse(preGatherCutBefore(c, runs) ?? c.changedAt)
    if (Number.isFinite(at) && at > cut) cut = at
  }
  return windows.map((w, i) => i < windows.length - 1 && Date.parse(w.from) < cut)
}

/** A window's label: the first day it covers, as the read's own dates count
 *  them (`coveredDays`: a comment is dated by its day, so a window opening on
 *  Sunday morning covers from Monday). */
export function windowLabel(w: { from: string; to: string }): string {
  const c = coveredDays(w)
  return shortDate(c ? `${c.first}T12:00:00.000Z` : w.from)
}

// ---- Conversations (pure) -----------------------------------------------------------------

/** The category's videos per theme in one window read. */
export function categoryThemeVideos(read: WindowReading | null): Map<string, { videos: number; mix: PlatformMix | null }> | null {
  if (!read?.themes) return null
  const out = new Map<string, { videos: number; mix: PlatformMix | null }>()
  for (const t of read.themes) {
    if (t.audience !== INDUSTRY_AUDIENCE) continue
    out.set(String(t.theme_id), { videos: Number(t.videos) || 0, mix: t.platform_mix ?? null })
  }
  return out
}

/** The category's videos in a window read. */
export function categoryVideos(read: WindowReading | null): number | null {
  const d = read?.denominators?.find((x) => x.audience === INDUSTRY_AUDIENCE)
  return d ? Number(d.videos) : read?.denominators ? 0 : null
}

/** "Jul", or the month's long name in a panel. */
const monthShort = (m: string): string => longMonth(m).slice(0, 3)

/** A month series' points as counts for the bars, the last `count` months to
 *  `month`, oldest first. A month with no denominator row is left out. */
export function monthCounts(series: MonthSeries | null | undefined, month: string, count: number, nowMonth: string): MonthCount[] {
  if (!series) return []
  const to = monthStartOf(month)
  return series.points
    .filter((p) => monthStartOf(p.month) <= to)
    .slice(-count)
    .filter((p) => p.videos != null)
    .map((p) => ({
      month: monthStartOf(p.month),
      label: monthShort(p.month),
      k: p.k ?? 0,
      n: p.videos,
      filling: monthStartOf(p.month) >= nowMonth,
    }))
}

/** The bars of an open conversation's line, from `themeMonthLine`: the last
 *  `MARKET_PANEL_MONTHS` months it has a denominator for. */
export function lineBars(line: ThemeMonthLine | null, nowMonth: string): MonthCount[] {
  if (!line) return []
  return line.points
    .filter((p) => p.n != null)
    .slice(-MARKET_PANEL_MONTHS)
    .map((p) => ({ month: p.month, label: longMonth(p.month), k: p.k ?? 0, n: p.n, filling: p.month >= nowMonth }))
}

/** The theme facts the page needs of the themed run. */
export interface RunTheme {
  label: string
  kind: string | null
  memberIds: string[]
}

/** Inputs the conversation list is built from. */
export interface ConvInput {
  period: Period
  themes: ReadonlyMap<string, RunTheme>
  /** registry id → label, for a theme the themed run does not name. */
  registryLabels?: ReadonlyMap<string, string>
  /** The subjects a conversation is placed in (`placeSubject`): the READY ones
   *  (`order`, `subjectsOf`), and, on Market only, the ones whose check is
   *  open (`pending`), used only where no ready subject takes the
   *  conversation. `names` holds both. */
  subjects: {
    names: ReadonlyMap<string, string>
    order: readonly string[]
    subjectsOf: ReadonlyMap<string, readonly string[]>
    pending?: { order: readonly string[]; subjectsOf: ReadonlyMap<string, readonly string[]> } | null
  } | null
  /** The three windows' category counts (oldest first), each a map by theme. */
  weekCounts: (ReadonlyMap<string, { videos: number; mix?: PlatformMix | null }> | null)[]
  /** Which windows our changes cut. */
  weekCut: readonly boolean[]
  /** The month's category counts by theme. */
  monthCounts: ReadonlyMap<string, number>
  /** The month's platform mix by theme. */
  monthMixes?: ReadonlyMap<string, PlatformMix | null>
  /** The over-time / month series per theme. */
  series: ReadonlyMap<string, MonthSeries>
  month: string
  nowMonth: string
  /** First heard this week (the week read). */
  newIds: ReadonlySet<string>
  /** Maker-led or off-topic themes, set apart from the picks. */
  setApart: ReadonlyMap<string, 'makers' | 'noise'>
  pair: PairOn | null
}

/**
 * Every conversation the period holds at the floor (`MARKET_TABLE_FLOOR`),
 * biggest first by the period's count (the week's, else the month's), then by
 * id. A theme the run does not label is left out (a label is what a reader
 * reads; an unnamed row is not a conversation to them). Pure.
 */
export function buildConvs(input: ConvInput): MarketConv[] {
  const weekOf = input.period === 'week' ? input.weekCounts[input.weekCounts.length - 1] : null
  const ids = new Set<string>(input.period === 'week' && weekOf ? [...weekOf.keys()] : [...input.monthCounts.keys()])
  const out: MarketConv[] = []
  for (const id of ids) {
    const conv = convOf(id, input)
    if (!conv) continue
    const count = input.period === 'week' ? conv.week : conv.month
    if (count == null || count < MARKET_TABLE_FLOOR) continue
    out.push(conv)
  }
  return out.sort((a, b) => periodCount(b, input.period) - periodCount(a, input.period) || a.id.localeCompare(b.id))
}

/** One conversation's facts, whether or not it reaches the floor (the open
 *  panel and the flag card read any theme). Null where it has no label. */
export function convOf(id: string, input: ConvInput): MarketConv | null {
  const t = input.themes.get(id)
  const label = (t?.label || input.registryLabels?.get(id) || '').trim()
  if (!label) return null
  const subjectId = t && input.subjects ? placeSubject(t.memberIds, input.subjects) : null
  const weeks = input.period === 'week'
    ? input.weekCounts.map((m, i) => (input.weekCut[i] || !m ? null : m.get(id)?.videos ?? 0))
    : []
  const series = input.series.get(id) ?? null
  const line = series ? themeMonthLine(series, input.month, input.pair) : null
  return {
    id,
    label,
    kind: t?.kind ?? null,
    subjectId,
    subjectName: subjectId ? input.subjects?.names.get(subjectId) ?? null : null,
    week: input.period === 'week' ? weeks[weeks.length - 1] ?? null : null,
    weeks,
    month: input.monthCounts.get(id) ?? (input.monthCounts.size > 0 ? 0 : null),
    months: monthCounts(series, input.month, MARKET_CARD_MONTHS, input.nowMonth),
    who: [],
    mix: input.period === 'week'
      ? input.weekCounts[input.weekCounts.length - 1]?.get(id)?.mix ?? null
      : input.monthMixes?.get(id) ?? null,
    isNew: input.newIds.has(id),
    monthVerdict: line?.verdict ?? null,
    setApart: input.setApart.get(id) ?? null,
  }
}

/**
 * THE ONE "SO FAR" RULE (the page, the tile and the email's months): a month
 * reads "so far" while it is under way, and never once a week carried past
 * its end (M2: the week is stated against that month in full) or the month
 * has ended. Pure.
 */
export function monthSoFar(month: string, nowMonth: string, weekCarriedPast = false): boolean {
  return monthStartOf(month) >= monthStartOf(nowMonth) && !weekCarriedPast
}

/** The count a period ranks by. */
export const periodCount = (c: Pick<MarketConv, 'week' | 'month'>, period: Period): number =>
  (period === 'week' ? c.week : c.month) ?? 0

/**
 * The top row's hero, this week, by the week's ONE lead rule (`weekLead`,
 * lib/reading/week-lead.ts, the weekly email's too): the check's first flag
 * where it flagged something; else the new conversation with the most videos
 * this week; else the conversation with the most videos this week. A theme
 * set apart (maker-led, off-topic) never leads. Pure.
 */
export function pickHero(input: {
  convs: readonly MarketConv[]
  flag: FlagCard | null
  setApart: { has(id: string): boolean }
}): { kind: 'flag' } | { kind: 'new' | 'biggest'; conv: MarketConv } | null {
  const lead = weekLead({
    flags: input.flag ? [input.flag] : [],
    newThisWeek: input.convs.filter((c) => c.isNew).map((c) => ({ registryId: c.id })),
    conversations: input.convs.map((c) => ({
      registryId: c.id, label: c.label, week: c.week ?? 0, setApart: c.setApart != null || input.setApart.has(c.id), conv: c,
    })),
  })
  if (!lead) return null
  if (lead.kind === 'flag') return { kind: 'flag' }
  return { kind: lead.kind, conv: lead.conversation.conv }
}

/**
 * The cards beside the hero, this week: the week's biggest conversation with
 * its three weekly counts (unless the hero is it), then the rest of what was
 * first heard this week (up to three). Pure.
 */
export function pickWeekSides(input: { convs: readonly MarketConv[]; heroId: string | null; setApart: { has(id: string): boolean } }): { biggest: MarketConv | null; fresh: MarketConv[] } {
  const eligible = input.convs.filter((c) => !input.setApart.has(c.id) && c.id !== input.heroId)
  const biggest = eligible[0] ?? null
  const fresh = eligible.filter((c) => c.isNew && c.id !== biggest?.id).slice(0, 3)
  return { biggest, fresh }
}

/** One flag row in This week's shape, without its quotes (§1's `buildFlag`
 *  minus the quote read): the explanation and the baseline's caveats come
 *  with it, for "our read" at level 2. Pure. */
export function flagOfRow(f: FlagRow): Omit<UnusualFlag, 'quotes'> {
  return {
    objectKind: f.object_kind,
    objectId: f.object_id,
    label: f.label,
    denominator: f.denominator,
    week: { k: f.week_k, n: f.week_n },
    baseline: { k: f.baseline_k, n: f.baseline_n },
    baselineMonths: f.baseline_months ?? [],
    baselineFilling: f.baseline_filling_months ?? [],
    baselineRegime: f.baseline_regime ?? null,
    changePts: Number(f.change_pts),
    bandPts: Number(f.band_pts),
    sentences: f.explanation?.sentences ?? [],
    explanationModel: f.explanation_model,
    rank: f.rank,
  }
}

// ---- The subject board (pure) ----------------------------------------------------------

const share = (k: number, n: number): number => (n > 0 ? (100 * k) / n : 0)

/**
 * The conversations inside a subject: every conversation of the period whose
 * subject it is, the period's count first, at most `limit`. Pure.
 */
export function insideOf(subjectId: string, convs: readonly MarketConv[], period: Period, opts: {
  limit?: number
  flagId?: string | null
  flag?: Verdict | null
  href: (id: string) => string
}): InsideRow[] {
  // A set-apart conversation is listed, tagged: only leading is barred.
  return convs
    .filter((c) => c.subjectId === subjectId)
    .slice(0, opts.limit ?? MARKET_INSIDE)
    .map((c) => ({
      id: c.id,
      label: c.label,
      count: period === 'week' ? c.week : c.month,
      month: period === 'week' ? c.month : null,
      isNew: c.isNew,
      flag: opts.flagId === c.id ? opts.flag ?? null : null,
      setApart: c.setApart,
      href: opts.href(c.id),
    }))
}

/** One subject's standing, as the readings and the standing facts give it. */
export interface SubjectFact {
  id: string
  name: string
  /** The standing fact's state (`ready`, `provisional`, `failed`, `unread`). */
  calibration: string
  level: Level | null
  verdict: Verdict | null
  trail: { month: string; k: number | null; n: number | null }[]
}

/** The months a subject's line spans, oldest first, ending at `month`. */
export function subjectAxis(month: string, count = MARKET_SUBJECT_MONTHS): string[] {
  const out: string[] = []
  let m = monthStartOf(month)
  for (let i = 0; i < count; i++) {
    out.unshift(m)
    m = prevMonth(m)
  }
  return out
}

/**
 * The subject board (the parity pass, 13 Oct: the board's form in every data
 * state): every subject with a level, largest first (the standing facts'
 * order), each against last month through its `Verdict` (the tick at last
 * month's share only where the pair may be printed), its month line on the
 * board's axis and the period's conversations inside it; then every subject
 * with no level yet in the same row, its name, the conversations inside it and
 * why in the level's place (`pending`). A subject being re-described (a failed
 * check) is named in one quiet line under the rows: decision C hides it
 * everywhere, and the conversations its members point at are not its. Pure.
 */
export function buildSubjectBoard(input: {
  facts: readonly SubjectFact[]
  month: string
  convs: readonly MarketConv[]
  period: Period
  flag: { id: string; verdict: Verdict } | null
  convHref: (id: string) => string
  subjectHref: (id: string) => string
  soFar: boolean
}): SubjectBoard | null {
  if (input.facts.length === 0) return null
  const m = monthStartOf(input.month)
  const before = prevMonth(m)
  const rows: SubjectRow[] = []
  const unmeasured: UnmeasuredSubject[] = []
  const pending: SubjectRow[] = []
  const monthText = input.soFar ? `${longMonth(m)} so far` : longMonth(m)
  const axis = subjectAxis(m)
  const inside = (id: string) => insideOf(id, input.convs, input.period, { href: input.convHref, flagId: input.flag?.id ?? null, flag: input.flag?.verdict ?? null })
  // The line on the board's axis: a month with no reading keeps its slot.
  const trailOf = (f: SubjectFact) => axis.map((month) => {
    const p = f.trail.find((x) => monthStartOf(x.month) === month)
    return { month, pct: p && p.k != null && p.n ? share(p.k, p.n) : null }
  })
  for (const f of input.facts) {
    if (!f.level || f.level.n <= 0) {
      const u = unmeasuredOf(f, monthText, input.subjectHref(f.id))
      if (u.state === 'failed') {
        unmeasured.push(u)
        continue
      }
      // Its check open: no figure resting on its membership prints (ruling
      // U6, `printsMarket`), so no line either. Not read this month: its
      // earlier months are a ready subject's and keep their line.
      pending.push({
        id: f.id, name: f.name, level: null, pending: { state: u.state, note: u.note }, prevPct: null, verdict: null,
        trail: u.state === 'unread' ? trailOf(f) : [], inside: inside(f.id), href: u.href,
      })
      continue
    }
    const prev = f.trail.find((p) => monthStartOf(p.month) === before)
    const printable = f.verdict != null && f.verdict.state !== 'refused' && f.verdict.pair?.mode !== 'refuse'
    rows.push({
      id: f.id,
      name: f.name,
      level: { ...f.level, pct: share(f.level.k, f.level.n) },
      pending: null,
      prevPct: printable && prev?.k != null && prev.n ? share(prev.k, prev.n) : null,
      verdict: f.verdict,
      trail: trailOf(f),
      inside: inside(f.id),
      href: input.subjectHref(f.id),
    })
  }
  return {
    monthText,
    prevText: longMonth(before),
    n: rows[0]?.level?.n ?? null,
    // No rank rests on a membership that is not checked (ruling U6): the rows
    // with no level stand by name, their check open first.
    rows: [...rows, ...pending.sort((a, b) => (a.pending?.state === b.pending?.state ? 0 : a.pending?.state === 'provisional' ? -1 : 1) || a.name.localeCompare(b.name))],
    unmeasured: unmeasured.sort((a, b) => a.name.localeCompare(b.name)),
    ticks: rows.some((r) => r.prevPct != null),
  }
}

/**
 * Why a subject prints no level: not measured yet while its check is open
 * (`SUBJECT_NOT_MEASURED`, lib/subjects/calibration-state.ts, the one
 * constant every surface prints; the row carries no calibration or "provisional" word,
 * as no client surface does, ruling U6, `calibrationWord`); being re-described
 * where the check failed (the calibration's own words, `FAILED_EXPLAINED`);
 * no reading yet where the month was not read for it. Pure.
 */
export function unmeasuredOf(f: Pick<SubjectFact, 'id' | 'name' | 'calibration'>, monthText: string, href: string): UnmeasuredSubject {
  const state = f.calibration === 'failed' ? 'failed' : f.calibration === 'unread' ? 'unread' : 'provisional'
  const note = state === 'failed' ? FAILED_EXPLAINED : state === 'unread' ? `No reading in ${monthText} yet` : SUBJECT_NOT_MEASURED
  return { id: f.id, name: f.name, state, note, href }
}

// ---- The rail (pure) ----------------------------------------------------------------------

/**
 * What people do in the comments: the six kinds' month so far on the market's
 * base, each against last month (`loadObjectReadings`, the Agent's and
 * Subjects' reading), largest first. The tick is last month's share where the
 * pair may be printed. Null where no kind was read. Pure.
 */
export function buildKinds(readings: readonly ObjectReading[], month: string, noun: string | null, soFar: boolean): KindsBlock | null {
  const m = monthStartOf(month)
  const rows: KindRow[] = []
  let n = 0
  for (const r of readings) {
    if (r.object.kind !== 'kind' || r.state !== 'read' || !r.curr || r.curr.k == null || !r.curr.n) continue
    n = r.curr.n
    const printable = r.verdict != null && r.verdict.state !== 'refused' && r.verdict.pair?.mode !== 'refuse'
    const prev = r.prev
    rows.push({
      kind: r.object.id,
      label: talkKindLabel(r.object.id, noun),
      k: r.curr.k,
      n: r.curr.n,
      pct: share(r.curr.k, r.curr.n),
      prevPct: printable && prev?.k != null && prev.n ? share(prev.k, prev.n) : null,
      verdict: r.verdict,
    })
  }
  if (rows.length === 0 || n <= 0) return null
  return {
    monthText: soFar ? `${longMonth(m)} so far` : longMonth(m),
    prevText: longMonth(prevMonth(m)),
    n,
    rows: rows.sort((a, b) => b.k - a.k || a.kind.localeCompare(b.kind)),
    ticks: rows.some((r) => r.prevPct != null),
  }
}

/** A platform mix as rows, largest first. Null where nothing was counted. */
export function platformRows(mix: Readonly<Record<string, number>> | null | undefined, basis: 'week' | 'month'): PlatformsBlock | null {
  if (!mix) return null
  const rows = Object.entries(mix)
    .map(([platform, v]) => ({ platform, videos: Number(v) || 0 }))
    .filter((r) => r.videos > 0)
  const n = rows.reduce((s, r) => s + r.videos, 0)
  if (n <= 0) return null
  return {
    basis,
    n,
    rows: rows
      .sort((a, b) => b.videos - a.videos || a.platform.localeCompare(b.platform))
      .map((r) => ({ ...r, label: platformLabel(r.platform), pct: share(r.videos, n) })),
  }
}

/** Platform mixes summed (each counts distinct videos of one audience, and a
 *  video is in one audience, so they add). */
export function mergeMixes(mixes: readonly (PlatformMix | null | undefined)[]): Record<string, number> | null {
  const out: Record<string, number> = {}
  let any = false
  for (const mix of mixes) {
    if (!mix) continue
    for (const [p, v] of Object.entries(mix)) {
      const c = Number(v) || 0
      if (c > 0) {
        out[p] = (out[p] ?? 0) + c
        any = true
      }
    }
  }
  return any ? out : null
}

// ---- The table (pure) ---------------------------------------------------------------------

/** The table's subject filter: `?in=` where some conversation is in that
 *  subject, else none (an unknown id shows every row, and drops nothing). */
export function tableFilterOf(convs: readonly MarketConv[], wanted: string | null): string | null {
  return wanted && convs.some((c) => c.subjectId === wanted) ? wanted : null
}

/**
 * The conversation table: the period's conversations, filtered to one subject
 * where `?in=` names one, ten shown until `?all=1`, every open row marked; and
 * the subject filters: the ready subjects biggest first with their counts,
 * then the subjects whose check is open (`pending`) by name with no count
 * (ruling U6: the count rests on a membership not yet verified). Pure.
 */
export function buildTable(input: {
  convs: readonly MarketConv[]
  params: MarketParams
  openId: string | null
  months: MarketTable['months']
  /** Subjects whose check is open: their chips print no count. */
  pending: ReadonlySet<string>
}): MarketTable | null {
  if (input.convs.length === 0) return null
  const p = input.params
  const bySubject = new Map<string, { name: string; count: number }>()
  for (const c of input.convs) {
    if (!c.subjectId || !c.subjectName) continue
    const held = bySubject.get(c.subjectId) ?? { name: c.subjectName, count: 0 }
    held.count += 1
    bySubject.set(c.subjectId, held)
  }
  const filter = tableFilterOf(input.convs, p.in)
  const listed = filter ? input.convs.filter((c) => c.subjectId === filter) : input.convs
  const shown = p.all ? listed : listed.slice(0, MARKET_TABLE_ROWS)
  // An open conversation further down the list is shown, so its panel has a
  // row to open under.
  const openRow = input.openId && !shown.some((c) => c.id === input.openId) ? listed.find((c) => c.id === input.openId) : null
  const rows = [...shown, ...(openRow ? [openRow] : [])]
  const base = { period: p.period, month: p.month }
  const chip = ([id, s]: [string, { name: string; count: number }], counted: boolean): TableFilter =>
    ({ id, name: s.name, count: counted ? s.count : null, href: marketHref({ ...base, in: id, all: p.all }, 'conversations') })
  const subjectChips = [...bySubject.entries()]
  const filters: TableFilter[] = [
    { id: null, name: 'All', count: input.convs.length, href: marketHref({ ...base, all: p.all }, 'conversations') },
    ...subjectChips
      .filter(([id]) => !input.pending.has(id))
      .sort((a, b) => b[1].count - a[1].count || a[1].name.localeCompare(b[1].name))
      .map((e) => chip(e, true)),
    ...subjectChips
      .filter(([id]) => input.pending.has(id))
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map((e) => chip(e, false)),
  ]
  return {
    total: listed.length,
    rows: rows.map((c) => ({ conv: c, href: convHref(p, c.id, 'table'), open: c.id === input.openId })),
    filters: bySubject.size > 0 ? filters : [],
    filter,
    all: p.all,
    showAllHref: !p.all && listed.length > MARKET_TABLE_ROWS ? marketHref({ ...base, in: filter, all: true }, 'conversations') : null,
    months: input.months,
    subjects: bySubject.size > 0,
  }
}

// ---- The open panel (pure) ----------------------------------------------------------------

/**
 * Where the notch points: the centre of the clicked item, across the row. The
 * top row is laid out by how many cards stand beside the hero (`topSpans`):
 * 6 · 3 · 3 (the board's), 7 · 5 with one, the hero alone with none.
 */
export function notchOf(at: PanelAt, index = 0, sides = 2): number {
  if (at === 'top') {
    const spans = topSpans(sides)
    const before = spans.slice(0, index).reduce((a, b) => a + b, 0)
    return (before + (spans[index] ?? spans[0]) / 2) / 12
  }
  if (at === 'subjects') return 0.3
  return 0.12
}

/** The top row's column spans (of twelve), hero first. Pure. */
export function topSpans(sides: number): number[] {
  if (sides <= 0) return [12]
  if (sides === 1) return [7, 5]
  return [6, ...Array.from({ length: sides }, () => 3)]
}

/**
 * "Our read" for one conversation, level 2: the published read's finding on
 * it (its saw and means, stored `week_read` prose); else the anomaly check's
 * explanation where the flag is this conversation (`interpretation_anomaly`);
 * else the conversation's own description (`pass_b_theme`). Null where none
 * has words. Pure.
 */
export function ourReadOf(input: {
  id: string
  read: WeekReadData | null
  flag: Omit<UnusualFlag, 'quotes'> | null
  description: string | null
}): ConvPanel['ourRead'] {
  const finding = input.read?.findings.find((f) => (f.basedOn ?? []).includes(input.id))
  if (finding && input.read) {
    const saw = finding.saw as unknown
    const paras = [...(Array.isArray(saw) ? (saw as string[]) : [String(saw ?? '')]), finding.means ?? '']
      .map((b) => b.trim()).filter(Boolean)
    if (paras.length > 0) return { slot: 'week_read', lines: paras.map((body) => ({ body, figures: input.read!.figures as unknown as PrintedFigures })) }
  }
  if (input.flag && input.flag.objectKind === 'theme' && input.flag.objectId === input.id && input.flag.sentences.length > 0) {
    const figures = proseFigures(flagFigures({ ...input.flag, quotes: [] }, input.flag.rank) as never) as unknown as PrintedFigures
    const lines = input.flag.sentences.map((body) => ({ body, figures })).filter((l) => substituteFigures(l.body, l.figures).length > 0)
    if (lines.length > 0) return { slot: 'interpretation_anomaly', lines }
  }
  const d = (input.description ?? '').trim()
  return d ? { slot: 'pass_b_theme', lines: [{ body: d, figures: {} }] } : null
}

/** A quote's source line and who its video is filed under. */
export function panelQuoteOf(c: CiteCandidate): PanelQuote {
  const v = voiceOf(c)
  const video = c.video as (CiteCandidate['video'] & { is_client?: boolean | null; is_competitor?: boolean | null; competitor_name?: string | null }) | null
  const about: WhoAbout | null = video?.is_client ? 'client' : video?.is_competitor && video.competitor_name ? `rival:${video.competitor_name}` : null
  return {
    text: v.quote.text,
    lang: (v.quote as { lang?: string | null }).lang ?? null,
    english: (v.quote as { english?: string | null }).english ?? null,
    source: [c.platform ? platformLabel(c.platform) : null, c.commentDate ? shortDate(c.commentDate) : null].filter(Boolean).join(' · '),
    about,
  }
}

/** The groups whose conversations include this one (Pass E's `registryIds`),
 *  by name, each opening in Voices. Names only (decision 2). Pure. */
export function groupsOf(id: string, personas: readonly { key: string; name: string; registryIds: readonly string[] }[]): GroupLink[] {
  return personas
    .filter((p) => p.registryIds.includes(id))
    .map((p) => ({ key: p.key, name: p.name, href: `/dashboard/voices?group=${encodeURIComponent(p.key)}#group-panel` }))
}

/** The personas of a stored profile, defensively: key, name and the theme
 *  registry ids. */
export function personasOf(raw: unknown): { key: string; name: string; registryIds: string[] }[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((p) => {
    const o = (p ?? {}) as { key?: unknown; name?: unknown; registryIds?: unknown }
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    if (!name) return []
    const key = typeof o.key === 'string' && o.key ? o.key : name
    const registryIds = Array.isArray(o.registryIds) ? o.registryIds.filter((x): x is string => typeof x === 'string') : []
    return [{ key, name, registryIds }]
  })
}

/** The flag's base, named (anomaly-check.ts: every surface names the
 *  denominator): the check's pooled slice is every audience together, your own
 *  posts included. Pure. */
export function flagBaseWords(denominator: string): string {
  return denominator === SLICE ? 'every audience together, your own posts included' : denominator
}

/** "July to September", from the baseline's months. */
export function monthsText(months: readonly string[]): string {
  const sorted = [...months].map(monthStartOf).sort()
  if (sorted.length === 0) return 'the months before'
  if (sorted.length === 1) return longMonth(sorted[0])
  return `${longMonth(sorted[0])} to ${longMonth(sorted[sorted.length - 1])}`
}

/** The anomaly check's verdict for one flag: the weekly read's own adapter
 *  (`frozenFlag`, lib/written/unusual.ts, over the check's `anomalyVerdict`),
 *  so the page's chip and the email's are read off one Verdict. Null for an
 *  object kind the check does not know. Pure. */
export function flagVerdict(flag: Omit<UnusualFlag, 'quotes'>, window: { from: string; to: string }): Verdict | null {
  const row: FlagRow = {
    run_id: '', object_kind: flag.objectKind, object_id: flag.objectId, label: flag.label, denominator: flag.denominator,
    week_k: flag.week.k, week_n: flag.week.n, baseline_k: flag.baseline.k, baseline_n: flag.baseline.n,
    baseline_months: flag.baselineMonths, baseline_filling_months: flag.baselineFilling, baseline_regime: flag.baselineRegime,
    change_pts: flag.changePts, band_pts: flag.bandPts, rank: flag.rank, flagged_count: 0,
    explanation: null, explanation_model: null, quote_refs: [],
  }
  return frozenFlag(row, window)?.verdict ?? null
}

/** The stats row of an open conversation (each a level where it has an n). */
export function panelStats(input: {
  conv: MarketConv
  period: Period
  week: MarketWeek | null
  month: MarketMonth
  prevK: number | null
  flag: Omit<UnusualFlag, 'quotes'> | null
  baselineText: string | null
}): ConvPanel['stats'] {
  const out: ConvPanel['stats'] = []
  const { conv, week, month } = input
  if (input.period === 'week' && week && conv.week != null && week.category != null) {
    out.push({ value: conv.week, of: week.category, label: 'category videos this week' })
  }
  if (conv.month != null && month.category != null) {
    out.push({ value: conv.month, of: month.category, label: `category videos ${month.soFar ? `in ${longMonth(month.month)} so far` : `in ${longMonth(month.month)}`}` })
  }
  if (input.prevK != null && month.prev.category != null) {
    out.push({ value: input.prevK, of: month.prev.category, label: `category videos in ${month.prev.text}` })
  }
  if (input.flag && input.baselineText) {
    out.push({ value: input.flag.baseline.k, of: input.flag.baseline.n, label: `videos in ${input.baselineText}, ${flagBaseWords(input.flag.denominator)}` })
  }
  return out
}

/** "Complained · 14 of 31": a conversation's kinds over its month's videos,
 *  biggest first. Pure. */
export function doingOf(kinds: readonly { kind: string; videos: number }[] | null, n: number | null, noun: string | null): Doing[] {
  if (!kinds || !n || n <= 0) return []
  return kinds
    .filter((k) => k.videos > 0)
    .slice(0, 4)
    .map((k) => ({ kind: k.kind, label: talkKindLabel(k.kind, noun), k: Math.min(k.videos, n), n }))
}

/**
 * The rail's weekly bars (`homeWeeks`), or `WEEKS_FAILED` where ANY read the
 * chart's cut rests on failed: the weeks' rows, the change log or the
 * cadence runs (each null, or the rows the marker, on a failure). Without the
 * changes or the cadence the bars would be drawn uncut, across a change that
 * cuts them, so a failure there is the block's failure too, as the
 * Dashboard's (`loadHomeWeeks` throws on any of the three). Pure.
 */
export function marketWeeksOf(input: {
  rows: readonly MarketWeekRowRaw[] | WeeksFailed
  changes: readonly OurChange[] | null
  cadence: readonly ChartRun[] | null
  rivalAudiences: readonly string[]
  updates: readonly string[]
  now: string
}): WeeksRead {
  if (!Array.isArray(input.rows) || input.changes === null || input.cadence === null) return WEEKS_FAILED
  return homeWeeks({ rows: input.rows, rivalAudiences: input.rivalAudiences, changes: input.changes, updates: input.updates, runs: input.cadence, now: input.now })
}

/** What the lead card says they're doing: the conversation's biggest kind
 *  that is NOT its own (Phase 4 fix round). A praise conversation's videos
 *  are praise by what the conversation is, so "Praised it · 35 of 35" says
 *  nothing; the next kind does. Null where no other kind was read. Pure. */
export function leadDoing(rows: readonly Doing[], ownKind: string | null): Doing | null {
  return rows.find((d) => !ownKind || d.kind !== ownKind) ?? null
}

/** The over-time months a table reads, oldest first, from the category's
 *  denominators. */
export function tableMonths(month: string, category: ReadonlyMap<string, number>, nowMonth: string, count = MARKET_CARD_MONTHS): MarketTable['months'] {
  const out: MarketTable['months'] = []
  let m = monthStartOf(month)
  for (let i = 0; i < count; i++) {
    out.unshift({ month: m, label: monthShort(m), n: category.get(m) ?? null, filling: m >= nowMonth })
    m = prevMonth(m)
  }
  return out.filter((x, i) => x.n != null || i === out.length - 1)
}

/** Who a conversation's videos are about, from its evidence refs and the
 *  brands their comments name (`themeWho`'s rule, Your market's). Pure. */
export function whoOf(
  refs: readonly { theme_id: string; video_ids: readonly string[]; comment_ids: readonly string[] }[],
  mentions: readonly { comment_id: string; video_id: string; name: string }[],
  company: string,
): Map<string, WhoPart[]> {
  const videosOf = new Map<string, WhoVideo[]>()
  const byVideo = new Map<string, { comment_id: string; name: string }[]>()
  for (const m of mentions) byVideo.set(m.video_id, [...(byVideo.get(m.video_id) ?? []), m])
  for (const r of refs) {
    const comments = new Set(r.comment_ids)
    const videos: WhoVideo[] = r.video_ids.map((id) => ({
      id,
      audience: INDUSTRY_AUDIENCE,
      named: (byVideo.get(id) ?? []).filter((m) => comments.has(m.comment_id)).map((m) => m.name),
    }))
    videosOf.set(r.theme_id, [...(videosOf.get(r.theme_id) ?? []), ...videos])
  }
  return new Map([...videosOf.entries()].map(([id, videos]) => [id, whoSplit(videos, company)]))
}

// ---- The reads ----------------------------------------------------------------------------

/** A read beside the page that must not take it down: logged, and its block
 *  omitted. */
async function soft<T>(label: string, p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p
  } catch (error) {
    console.error(`[pages] market.${label}: ${(error as { message?: string })?.message ?? String(error)}`)
    return fallback
  }
}

/** Every theme of the themed run, with its label, kind and members. */
async function loadRunThemes(db: SupabaseClient, clientId: string, runId: string | null): Promise<Map<string, RunTheme>> {
  const out = new Map<string, RunTheme>()
  if (!runId) return out
  const rows = await selectAll<{ theme_id: string; label: string | null; category: string | null; member_insight_ids: string[] | null }>(() =>
    db.from('theme_observations').select('theme_id, label, category, member_insight_ids')
      .eq('client_id', clientId).eq('run_id', runId).order('theme_id', { ascending: true }))
  for (const r of rows) out.set(String(r.theme_id), { label: (r.label ?? '').trim(), kind: r.category ?? null, memberIds: (r.member_insight_ids ?? []).map(String) })
  return out
}

/** The month's category rows: videos and platform mix per theme. */
async function loadMonthThemeRows(db: SupabaseClient, clientId: string, month: string): Promise<Map<string, { videos: number; mix: PlatformMix | null }>> {
  const rows = await selectAll<{ theme_id: string; videos: number; platform_mix: PlatformMix | null }>(() =>
    db.from(TABLE_THEME_READINGS).select('theme_id, videos, platform_mix')
      .eq('client_id', clientId).eq('month', monthStartOf(month)).eq('audience', INDUSTRY_AUDIENCE)
      .order('theme_id', { ascending: true }))
  return new Map(rows.map((r) => [String(r.theme_id), { videos: Number(r.videos) || 0, mix: r.platform_mix ?? null }]))
}

/** A slug's theme: the biggest of the period's conversations whose members
 *  name it (`loadLinkedTheme`, Conversation's rule for a stored `?themes=`
 *  link), else any registry row that does. */
async function resolveSlug(db: SupabaseClient, clientId: string, slug: string, ordered: readonly string[]): Promise<string | null> {
  const linked = ordered.length > 0 ? await loadLinkedTheme(db, clientId, new Set([slug]), ordered) : null
  if (linked) return linked
  const res = await db.from('theme_registry').select('id').eq('client_id', clientId).contains('member_slugs', [slug]).order('id', { ascending: true }).limit(1)
  if (res.error) throw new Error(`theme_registry slug: ${res.error.message}`)
  return ((res.data ?? []) as { id: string }[])[0]?.id ?? null
}

/**
 * The subjects a conversation may be placed in, in two tiers (the parity
 * pass, 13 Oct; ruling U6): the READY ones, and the ones whose check is still
 * open. A subject being re-described is in neither: its check found it
 * catching comments about other things. Pure.
 */
export function placementTiers<S extends { id: string }>(all: readonly { subject: S; calibration: string }[]): { ready: S[]; pending: S[] } {
  return {
    ready: all.filter((x) => x.calibration === 'ready').map((x) => x.subject),
    pending: all.filter((x) => x.calibration !== 'ready' && x.calibration !== 'failed').map((x) => x.subject),
  }
}

/**
 * THE SUBJECT A CONVERSATION IS PLACED IN, ON MARKET (the parity pass, 13 Oct;
 * ruling U6): a READY subject always wins. `subjectOfTheme` over the ready
 * subjects alone first; only where no ready subject takes the conversation (3
 * of its member insights and 15% of them) is it read against the subjects
 * whose check is open, so a subject whose matching is not verified never
 * takes a conversation from one whose matching is. Membership is written for
 * every active subject whatever its check (the check reads it), and placing a
 * conversation prints only the conversation's own counts: a subject whose
 * check is open keeps its "Inside it" and the table its Subject column, while
 * its own level, line, change and chip count wait for the check. Pure.
 */
export function placeSubject(memberIds: readonly string[], s: NonNullable<ConvInput['subjects']>): string | null {
  return subjectOfTheme(memberIds, s.subjectsOf, s.order)
    ?? (s.pending ? subjectOfTheme(memberIds, s.pending.subjectsOf, s.pending.order) : null)
}

async function loadSubjects(db: SupabaseClient, clientId: string): Promise<{
  all: { subject: Subject; calibration: ReturnType<typeof subjectCalibration> }[]
  placed: ConvInput['subjects']
}> {
  let subjects: Subject[]
  try {
    subjects = await loadActiveSubjects(db as never, clientId)
  } catch (error) {
    if (isMissingSubjects(error)) return { all: [], placed: null }
    throw error
  }
  const all = subjects.map((s) => ({ subject: s, calibration: subjectCalibration(s) }))
  const tiers = placementTiers(all)
  const placeable = [...tiers.ready, ...tiers.pending]
  if (placeable.length === 0) return { all, placed: null }
  // One membership read for both tiers, split by subject.
  const bySubject = await loadMemberInsightIdsBySubject(db, clientId, placeable.map((s) => s.id))
  if (!bySubject) return { all, placed: null }
  const tierOf = (list: readonly Subject[]) => {
    const subjectsOf = new Map<string, string[]>()
    for (const sub of list) for (const id of bySubject.get(sub.id) ?? []) subjectsOf.set(id, [...(subjectsOf.get(id) ?? []), sub.id])
    return { order: list.map((x) => x.id), subjectsOf }
  }
  const ready = tierOf(tiers.ready)
  return {
    all,
    placed: {
      names: new Map(placeable.map((x) => [x.id, x.name])),
      order: ready.order,
      subjectsOf: ready.subjectsOf,
      pending: tiers.pending.length > 0 ? tierOf(tiers.pending) : null,
    },
  }
}

/** The evidence refs of these themes for the period: the stored month's
 *  (`month_evidence_refs`, the category), or the week window's
 *  (`monthly_evidence_refs` over the read's window, its months together). */
async function loadRefs(
  db: SupabaseClient,
  clientId: string,
  a: { period: Period; month: string; window: { from: string; to: string } | null; runId: string | null; ids: readonly string[] },
): Promise<{ theme_id: string; video_ids: string[]; comment_ids: string[] }[]> {
  if (a.ids.length === 0) return []
  if (a.period === 'week' && a.window && a.runId) {
    // The freeze's own reader: paged past the 1,000-row cap on a unique order.
    const rows = await readEvidenceRefs(db, clientId, a.runId, a.window)
    const want = new Set(a.ids)
    const byTheme = new Map<string, { videos: Set<string>; comments: Set<string> }>()
    for (const r of rows) {
      const id = String(r.theme_id)
      if (r.audience !== INDUSTRY_AUDIENCE || !want.has(id)) continue
      const held = byTheme.get(id) ?? { videos: new Set<string>(), comments: new Set<string>() }
      for (const v of r.video_ids ?? []) held.videos.add(String(v))
      for (const c of r.comment_ids ?? []) held.comments.add(String(c))
      byTheme.set(id, held)
    }
    return [...byTheme.entries()].map(([theme_id, h]) => ({ theme_id, video_ids: [...h.videos], comment_ids: [...h.comments] }))
  }
  const parts = await mapWithLimit(chunk([...a.ids], UUID_IN_CHUNK), READ_CONCURRENCY, async (part) => {
    const res = await db.from('month_evidence_refs').select('object_id, video_ids, comment_ids')
      .eq('client_id', clientId).eq('month', monthStartOf(a.month)).eq('object_kind', 'theme').eq('audience', INDUSTRY_AUDIENCE)
      .in('object_id', part)
    if (res.error) throw new Error(`month_evidence_refs: ${res.error.message}`)
    return ((res.data ?? []) as { object_id: string; video_ids: string[] | null; comment_ids: string[] | null }[])
      .map((r) => ({ theme_id: String(r.object_id), video_ids: (r.video_ids ?? []).map(String), comment_ids: (r.comment_ids ?? []).map(String) }))
  })
  return parts.flat()
}

/**
 * Who these themes' videos are about, and whether that may print at all.
 *
 * A TENANT WITH NO BRAND RULES has nothing read (`not_read`); one with rules
 * and no `brand_mentions` row written yet (Össur before its back-read) has
 * nothing counted (`not_counted`). In both, "no brand named" would be a false
 * absence, so no split prints and the page says which (Voices' words). Only
 * where some row exists does an empty naming mean nobody named a brand.
 */
async function loadWho(
  db: SupabaseClient,
  clientId: string,
  a: { refs: readonly { theme_id: string; video_ids: string[]; comment_ids: string[] }[]; company: string; rivals: readonly { id: string; name: string }[] },
): Promise<{ who: Map<string, WhoPart[]>; brands: BrandsState }> {
  if (brandRulesFor(clientId).length === 0) return { who: new Map(), brands: 'not_read' }
  const tracked = trackedBrands(clientId, a.company, a.rivals)
  const namings = a.refs.length > 0
    ? await loadCommentNamings(db, { clientId, commentIds: a.refs.flatMap((r) => r.comment_ids), brands: tracked })
    : []
  if (namings.length === 0) {
    // One row is enough to tell "nobody named one" from "nothing counted yet".
    const probe = await db.from('brand_mentions').select('id').eq('client_id', clientId).limit(1)
    if (probe.error) throw new Error(`brand_mentions probe: ${probe.error.message}`)
    if ((probe.data ?? []).length === 0) return { who: new Map(), brands: 'not_counted' }
  }
  const mentions = namings.map((n) => ({ comment_id: n.commentId, video_id: n.videoId, name: n.name }))
  return { who: whoOf(a.refs, mentions, a.company), brands: 'counted' }
}

/** The latest consumer profile's personas (key, name, registry ids). */
async function loadPersonas(db: SupabaseClient, clientId: string): Promise<{ key: string; name: string; registryIds: string[] }[]> {
  const res = await db.from('consumer_profiles').select('personas').eq('client_id', clientId)
    .order('run_date', { ascending: false }).limit(1).maybeSingle()
  if (res.error) throw new Error(`consumer_profiles: ${res.error.message}`)
  return personasOf((res.data as { personas?: unknown } | null)?.personas)
}

/** The conversation's description on the themed run (Pass B). */
async function loadDescription(db: SupabaseClient, clientId: string, runId: string | null, id: string): Promise<string | null> {
  if (!runId) return null
  const res = await db.from('themes').select('description').eq('client_id', clientId).eq('run_id', runId).eq('registry_id', id).limit(1).maybeSingle()
  if (res.error) throw new Error(`themes description: ${res.error.message}`)
  return (res.data as { description?: string | null } | null)?.description ?? null
}

/** The theme series the cards, the table and the panel read: the category's
 *  months up to the reading month, for these themes. */
async function loadThemeSeries(db: SupabaseClient, clientId: string, ids: readonly string[], month: string, months: number): Promise<Map<string, MonthSeries>> {
  const out = new Map<string, MonthSeries>()
  if (ids.length === 0) return out
  let from = monthStartOf(month)
  for (let i = 1; i < months; i++) from = prevMonth(from)
  const set = await loadMonthSeries(db, clientId, { audiences: [INDUSTRY_AUDIENCE], objectKind: 'theme', objectIds: [...ids], from, to: month, updatesByMonth: {}, firstRunMonth: null })
  if (set.substrate !== 'seeded' || set.numeratorSubstrate !== 'seeded') return out
  for (const s of set.series) if (s.objectId) out.set(s.objectId, s)
  return out
}

/** The anomaly check's first flag for the read's run, or null. */
async function loadWeekFlag(db: SupabaseClient, clientId: string, runId: string): Promise<Omit<UnusualFlag, 'quotes'> | null> {
  // This week's readers and rule (lib/pages/week.ts): a missing table is no
  // check; a failed read throws and `soft` drops the card. `weekFlagRows`
  // answers null for a check that flagged and whose flags could not be read:
  // no flag card then, and the slot leads with the next rule's answer.
  const [check, flags] = await Promise.all([loadCheckStrict(db, clientId, runId), loadFlagsStrict(db, clientId, runId)])
  const first = weekFlagRows(check, flags)?.[0]
  return first ? flagOfRow(first) : null
}

// ---- The loader ---------------------------------------------------------------------------

/**
 * Market, for the session's client. Null is the first-run state: no delivered
 * update yet, so nothing has been read.
 */
export async function loadMarket(input: {
  supabase: SupabaseClient
  clientId: string
  reading: ReadingHandle
  params: MarketParams
  now?: Date
}): Promise<MarketData | null> {
  const { supabase, clientId } = input
  const db = input.reading.client
  const now = input.now ?? new Date()
  const nowIso = now.toISOString()
  const nowMonth = monthStartOf(nowIso)

  // ── wave 1: who, what has been delivered, the read, the denominators ──
  let from = nowMonth
  for (let i = 0; i < 13; i++) from = prevMonth(from)
  const themedRunAhead = fetchRunningRunIds(supabase, clientId, 'market').then((ids) => fetchThemedRunId(supabase, clientId, ids, 'market'))
  themedRunAhead.catch(() => {})
  const subjectsAhead = soft('subjects', loadSubjects(db, clientId), { all: [], placed: null })
  const pairAhead = loadAppPairOn(input.reading, nowIso)
  // A failed change-log or cadence read is null (both read an array or
  // throw): the weekly bars are then WEEKS_FAILED, never drawn uncut.
  const changesAhead = soft<Awaited<ReturnType<typeof loadChanges>> | null>('changes', loadChanges(db, clientId), null)
  const cadenceAhead = soft<Awaited<ReturnType<typeof loadCadenceRuns>> | null>('cadence', loadCadenceRuns(supabase, clientId), null)
  const personasAhead = soft('personas', loadPersonas(db, clientId), [])
  // A failed read is WEEKS_FAILED, never null: null is "too few clean weeks".
  const weekRowsAhead = soft<Awaited<ReturnType<typeof loadWeekRows>> | typeof WEEKS_FAILED>('weeks', loadWeekRows(db, clientId, nowIso), WEEKS_FAILED)
  const [clientRes, runs, rivals, competitors, published, history, schedule] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    loadDeliveredRuns(supabase, clientId),
    loadTrackedRivals(supabase, clientId),
    soft('competitors', loadCompetitors(db, clientId), []),
    soft('read', loadPublishedWeekRead(db, clientId), null as PublishedWeekRead | null),
    loadMonthSeries(db, clientId, { from, to: nowIso, updatesByMonth: {}, firstRunMonth: null }),
    soft('schedule', loadReadingSchedule(db, clientId), null),
  ])
  if (runs.length === 0) return null
  const brand = ((clientRes.data as { company_name: string | null } | null)?.company_name ?? '').trim() || 'Your brand'
  const noun = WHAT_THEY_SELL[clientId] ?? null
  const rivalAudiences = marketRivalAudiences(rivals)
  const market = marketAudiences(rivalAudiences)
  const read = published?.data ?? null
  const windows = read ? weekWindows(read.window) : null
  // THE WEEK NEEDS A PUBLISHED READ (its window is the week): without one the
  // month shows, and the bar says why (`weekUnavailable`).
  const weekUnavailable = input.params.period === 'week' && !windows
  const period: Period = weekUnavailable ? 'month' : input.params.period
  const p: MarketParams = { ...input.params, period }

  // THE MONTH: the week's restatement month (`readingMonthOf`: a week that
  // starts in one month is restated against it, in full), else the reading
  // month every reading page reads (decision A), or `?month=`.
  const view = readingViewFrom({ now: nowIso, runs, denominators: history.denominators, rivalAudiences, schedule, explicit: p.month ? p.month.slice(0, 7) : null })
  const weekMonth = read ? readingMonthOf(read.window) : null
  const month = period === 'week' && weekMonth ? monthStartOf(weekMonth.month) : monthStartOf(view.reading.month)
  // "So far" only while the month is under way (`monthSoFar`, the tile's too).
  const soFar = monthSoFar(month, nowMonth, period === 'week' && (weekMonth?.complete ?? false))
  const pooled = pooledDenominators(history.denominators.map((d) => ({ month: d.month, audience: d.audience, videos: d.videos, comments: d.comments ?? 0 })), rivalAudiences)
  const categoryOf = new Map<string, number>()
  for (const d of history.denominators) if (d.audience === INDUSTRY_AUDIENCE) categoryOf.set(monthStartOf(d.month), d.videos)
  const before = prevMonth(month)
  const monthBlock: MarketMonth = {
    month,
    soFar,
    text: soFar ? `${longMonth(month)} so far` : longMonth(month),
    market: { videos: pooled.get(month)?.videos ?? null, comments: pooled.get(month)?.comments ?? null },
    category: categoryOf.get(month) ?? null,
    prev: { month: before, text: longMonth(before), category: categoryOf.get(before) ?? null },
  }
  const monthMix = mergeMixes(history.denominators
    .filter((d) => monthStartOf(d.month) === month && market.includes(d.audience))
    .map((d) => (d as { platform_mix?: PlatformMix | null }).platform_mix ?? null))

  // THIS MONTH's long-run read, for the month the view reads, read beside
  // everything else and printed below it (Heinrich, 13 Oct); where that month
  // is still filling and has none of its own, the newest earlier month's
  // (`marketLongRunFor`). A read that fails costs that section only.
  const noLongRun = { own: null, closed: null } as { own: StoredLongRun | null; closed: StoredLongRun | null }
  const longRunAhead: Promise<typeof noLongRun | 'failed'> = period === 'month'
    ? soft<typeof noLongRun | 'failed'>('longRun', (async () => {
        const own = await loadPublishedLongRun(db, clientId, { month })
        if (!soFar || marketLongRunOf(own, month)) return { own, closed: null }
        return { own, closed: await loadPublishedLongRun(db, clientId, { before: month }) }
      })(), 'failed')
    : Promise.resolve(noLongRun)

  // ── wave 2: the period's readings ──
  const [themedRunId, changes, cadence] = await Promise.all([themedRunAhead.catch(() => null), changesAhead, cadenceAhead])
  const ourChanges = ourChangesWithoutGatherFlags((changes ?? []).filter((r) => !isFailOpenFix(r)))
  const cut = period === 'week' && windows ? cutWindows(windows, ourChanges, cadence ?? []) : []
  const windowReadsAhead = period === 'week' && windows && themedRunId
    ? Promise.all(windows.map((w, i) => (cut[i]
      ? Promise.resolve(null)
      : soft(`window${i}`, loadWindowReading(db, clientId, { from: w.from, to: w.to, runId: themedRunId, audiences: market }), null))))
    : Promise.resolve([] as (WindowReading | null)[])
  const [windowReads, runThemes, monthRows, subjects, pair, segmentRows, flag] = await Promise.all([
    windowReadsAhead,
    soft('themes', loadRunThemes(db, clientId, themedRunId), new Map<string, RunTheme>()),
    soft('monthThemes', loadMonthThemeRows(db, clientId, month), new Map<string, { videos: number; mix: PlatformMix | null }>()),
    subjectsAhead,
    pairAhead,
    makerRuleEnabled(clientId) && themedRunId ? soft('segments', loadThemeSegmentRows(db, clientId, month, themedRunId), null) : Promise.resolve(null),
    period === 'week' && published ? soft('flag', loadWeekFlag(db, clientId, published.runId), null) : Promise.resolve(null),
  ])

  // Maker-led and off-topic themes stay in every count and lead nothing.
  const setApart = setApartOf(segmentRows)

  const newIds = new Set(read && read.version === 2 ? read.newThisWeek.map((n) => n.themeId) : [])
  const base: Omit<ConvInput, 'series'> = {
    period,
    themes: runThemes,
    subjects: subjects.placed,
    weekCounts: windowReads.map((r) => categoryThemeVideos(r)),
    weekCut: cut,
    monthCounts: new Map([...monthRows.entries()].map(([id, r]) => [id, r.videos])),
    monthMixes: new Map([...monthRows.entries()].map(([id, r]) => [id, r.mix])),
    month,
    nowMonth,
    newIds,
    setApart,
    pair,
  }
  // The months the cards and the over-time table read (one series read, off
  // the week: the week's cards draw weeks).
  const ranked = buildConvs({ ...base, series: new Map() })
  const series = period !== 'week' && ranked.length > 0
    ? await soft('series', loadThemeSeries(db, clientId, ranked.map((c) => c.id), month, MARKET_CARD_MONTHS), new Map<string, MonthSeries>())
    : new Map<string, MonthSeries>()
  const convInput: ConvInput = { ...base, series }
  let convs = period === 'week' ? ranked : buildConvs(convInput)

  // The open conversation, by registry id or by slug (an old `?themes=` link).
  const openId = !p.conv ? null : isRegistryId(p.conv)
    ? p.conv
    : await soft('slug', resolveSlug(db, clientId, p.conv, convs.map((c) => c.id)), null)

  // ── the week: its bar, and the flag ──
  const weekBlock: MarketWeek | null = read && period === 'week' && windows
    ? {
        window: read.window,
        dates: weekReadDates(read.window),
        month,
        monthComplete: weekMonth?.complete ?? false,
        inMonth: inMonth(month, !soFar),
        market: read.version === 2 && read.market ? read.market.week : { videos: null, comments: null },
        category: categoryVideos(windowReads[windowReads.length - 1] ?? null),
        categoryWeeks: windowReads.map((r, i) => (cut[i] ? null : categoryVideos(r))),
        weekLabels: windows.map(windowLabel),
      }
    : null
  const flagCard: FlagCard | null = flag && read && weekBlock ? flagCardOf({ flag, window: read.window, convs, convInput, monthCategory: monthBlock.category, p, noun }) : null

  // ── the top row's picks ──
  const heroPick = period === 'week' ? pickHero({ convs, flag: flagCard, setApart }) : null
  const monthPicks = period === 'month' ? convs.filter((c) => !setApart.has(c.id)).slice(0, 3) : []
  const heroId = heroPick ? (heroPick.kind === 'flag' ? flagCard?.conv?.id ?? null : heroPick.conv.id) : monthPicks[0]?.id ?? null
  const sides = period === 'week' && heroPick ? pickWeekSides({ convs, heroId, setApart }) : null

  // ── wave 3: subjects' and kinds' readings, who, the hero's kinds ──
  const subjectObjects: MarketObjectRef[] = subjects.all
    .filter((x) => x.calibration !== 'failed')
    .map(({ subject, calibration }) => ({ kind: 'subject' as const, id: subject.id, label: subject.name, calibration }))
  const kindObjects: MarketObjectRef[] = MARKET_KINDS.map((k) => ({ kind: 'kind' as const, id: k, label: k }))
  const readingsAhead = soft('readings', loadObjectReadings(db, {
    clientId, objects: [...subjectObjects, ...kindObjects], month, pair, asOf: nowIso, rivalAudiences,
  }), [] as ObjectReading[])

  // Who, for what prints a split: the hero, the table's shown rows (by the
  // table's own filter rule), the open one.
  const tableFilter = tableFilterOf(convs, p.in)
  const tableShown = (tableFilter ? convs.filter((c) => c.subjectId === tableFilter) : convs).slice(0, p.all ? undefined : MARKET_TABLE_ROWS)
  const whoIds = [...new Set([...tableShown.map((c) => c.id), ...(heroId ? [heroId] : []), ...(openId ? [openId] : [])])]
  const whoAhead = soft('refs', loadRefs(db, clientId, { period, month, window: read?.window ?? null, runId: themedRunId, ids: whoIds }), [])
    .then((refs) => soft('who', loadWho(db, clientId, { refs, company: brand, rivals: competitors.map((c) => ({ id: c.id, name: c.name })) }), { who: new Map<string, WhoPart[]>(), brands: 'not_counted' as BrandsState }))
  // What people did in a conversation: its month's videos (the stored refs).
  // Read once per conversation: the hero and its open panel share it.
  const kindsRead = new Map<string, Promise<{ kind: string; label: string; videos: number }[] | null>>()
  const kindsFor = (id: string): Promise<{ kind: string; label: string; videos: number }[] | null> => {
    const held = kindsRead.get(id)
    if (held) return held
    const read = (async () => {
      const refs = await soft('monthRefs', loadRefs(db, clientId, { period: 'month', month, window: null, runId: themedRunId, ids: [id] }), [])
      const videos = refs.find((r) => r.theme_id === id)?.video_ids ?? []
      return soft('themeKinds', loadThemeKinds(db, clientId, themedRunId, id, videos), null)
    })()
    kindsRead.set(id, read)
    return read
  }
  // Nothing first heard this week, anywhere in the week (a New chip anywhere
  // means something was): the newest conversation an earlier week's read
  // first heard, for the third card (read only then).
  const anyNew = convs.some((c) => c.isNew)
  const nothingNew = period === 'week' && heroPick != null && !anyNew && (sides?.fresh.length ?? 0) === 0
  const earlierNewAhead = nothingNew && read
    ? soft('earlierNew', loadEarlierNewThisWeek(db, clientId, { before: read.window.from }), [] as EarlierNew[])
    : Promise.resolve([] as EarlierNew[])
  const [readings, whoRead, personas, heroKinds, weekRowsRaw, earlierNew] = await Promise.all([
    readingsAhead, whoAhead, personasAhead, heroId ? kindsFor(heroId) : Promise.resolve(null), weekRowsAhead, earlierNewAhead,
  ])
  const { who, brands } = whoRead
  const withWho = (c: MarketConv): MarketConv => (who.has(c.id) ? { ...c, who: who.get(c.id) ?? [] } : c)
  convs = convs.map(withWho)
  const findConv = (id: string): MarketConv | null => {
    const c = convs.find((x) => x.id === id) ?? convOf(id, convInput)
    return c ? withWho(c) : null
  }

  // ── the subject board and the rail ──
  const readingOf = new Map(readings.filter((r) => r.object.kind === 'subject').map((r) => [r.object.id, r]))
  const facts = factsFromReadings(
    subjects.all.map(({ subject, calibration }) => ({ subject, calibration, reading: readingOf.get(subject.id) ?? null })),
    marketComparable(pair, month),
  )
  // A subject whose reading did not come back is never "being re-described"
  // (`factsFromReadings` files a missing reading under failed): only its own
  // check can fail it. Its check open, it waits for that; else it is unread.
  const checkOf = new Map(subjects.all.map((x) => [x.subject.id, x.calibration]))
  const subjectFacts: SubjectFact[] = facts.map((f) => ({
    id: f.subjectId, name: f.name,
    calibration: f.calibration !== 'failed' || checkOf.get(f.subjectId) === 'failed' ? f.calibration : checkOf.get(f.subjectId) === 'provisional' ? 'provisional' : 'unread',
    level: f.calibration === 'ready' ? f.level : null, verdict: f.verdict, trail: f.trail,
  }))
  const subjectBoard = buildSubjectBoard({
    facts: subjectFacts,
    month,
    convs,
    period,
    flag: flagCard?.conv ? { id: flagCard.conv.id, verdict: flagCard.verdict } : null,
    convHref: (id) => convHref(p, id, 'subjects'),
    subjectHref: (id) => subjectHref(p, id),
    soFar,
  })
  const weekRead = windowReads[windowReads.length - 1] ?? null
  const rail: MarketRail = {
    kinds: buildKinds(readings, month, noun, soFar),
    weeks: marketWeeksOf({ rows: weekRowsRaw, changes: changes === null ? null : ourChanges, cadence, rivalAudiences, updates: runs.map(updateInstant), now: nowIso }),
    weeksAxis: homeWeeksFrame(nowIso).columns.map((c) => c.label),
    platforms: period === 'week' && weekRead?.denominators
      ? withMonthPlatforms(platformRows(mergeMixes(weekRead.denominators.filter((d) => market.includes(d.audience)).map((d) => d.platform_mix)), 'week'), monthMix, inMonth(month, !soFar))
      : platformRows(monthMix, 'month'),
    watch: period === 'week' && read && read.version === 2
      ? read.watch.slice(0, MARKET_WATCH).map((w) => ({ body: w.body.trim(), figures: read.figures as unknown as PrintedFigures })).filter((l) => l.body)
      : [],
  }

  // ── the top row ──
  const doing = (conv: MarketConv | null): Doing | null => (conv ? leadDoing(doingOf(heroKinds, conv.month, noun), conv.kind) : null)
  const top: TopRow = { hero: null, sides: [], months: null }
  if (period === 'week' && heroPick) {
    if (heroPick.kind === 'flag' && flagCard) {
      const conv = flagCard.conv ? findConv(flagCard.conv.id) : null
      top.hero = { kind: 'flag', card: { ...flagCard, conv }, groups: conv ? groupsOf(conv.id, personas) : [], doing: doing(conv) }
    } else if (heroPick.kind !== 'flag') {
      const conv = findConv(heroPick.conv.id) ?? heroPick.conv
      top.hero = { kind: heroPick.kind, conv, href: convHref(p, conv.id, 'top'), groups: groupsOf(conv.id, personas), doing: doing(conv) }
    }
    // THE BOARD'S THREE CARDS, ALWAYS (the parity pass, 13 Oct): a card with
    // nothing for it this week keeps its place and says so in its own frame.
    top.sides.push(sides?.biggest
      ? { kind: 'biggest', convs: [withWho(sides.biggest)], hrefs: [convHref(p, sides.biggest.id, 'top')], groups: groupsOf(sides.biggest.id, personas) }
      : { kind: 'biggest', convs: [], hrefs: [], groups: [] })
    if (sides && sides.fresh.length > 0) {
      top.sides.push({ kind: 'new_list', convs: sides.fresh, hrefs: sides.fresh.map((c) => convHref(p, c.id, 'top')), groups: groupsOf(sides.fresh[0].id, personas) })
    } else {
      // Never a conversation the row already holds (one card each).
      const onRow = new Set([heroId, sides?.biggest?.id].filter((x): x is string => x != null))
      const earlier = anyNew ? null : earlierNewOf(earlierNew, convInput, (id) => convHref(p, id, 'top'), onRow)
      const next = earlier ? null : alsoTalkedOf(convs, onRow, setApart)
      top.sides.push({
        kind: 'new_list', convs: [], hrefs: [], groups: [], anyNew, earlier,
        also: next ? { conv: withWho(next), href: convHref(p, next.id, 'top'), groups: groupsOf(next.id, personas) } : null,
      })
    }
  } else if (period === 'month' && monthPicks[0]) {
    const conv = findConv(monthPicks[0].id) ?? monthPicks[0]
    top.hero = { kind: 'biggest', conv, href: convHref(p, conv.id, 'top'), groups: groupsOf(conv.id, personas), doing: doing(conv) }
    for (const c of monthPicks.slice(1)) top.sides.push({ kind: 'month', convs: [withWho(c)], hrefs: [convHref(p, c.id, 'top')], groups: groupsOf(c.id, personas) })
  } else if (period === 'time') {
    top.months = marketMonths(pooled, month, nowMonth)
  }

  // ── the table ──
  const at: PanelAt = p.at ?? (openId && topIndexOf(top, openId) >= 0 ? 'top' : 'table')
  const table = buildTable({
    convs,
    params: p,
    openId: openId && at === 'table' ? openId : null,
    months: period === 'time' ? tableMonths(month, categoryOf, nowMonth) : [],
    pending: new Set(subjects.placed?.pending?.order ?? []),
  })

  // ── the open panels ──
  const panel = openId
    ? await soft('panel', loadConvPanel({
        db, clientId, id: openId, at, p, period, month: monthBlock, week: weekBlock,
        conv: findConv(openId), read, flag, themedRunId, nowMonth, pair, personas, noun, kindsFor,
        topIndex: topIndexOf(top, openId), sides: top.sides.length, runThemes,
      }), null)
    : null
  const subjectPanel = !openId && p.subject
    ? buildSubjectPanel({ id: p.subject, facts: subjectFacts, convs, period, p, read, month: monthBlock, flag: flagCard?.conv ? { id: flagCard.conv.id, verdict: flagCard.verdict } : null })
    : null
  const longRunRead = await longRunAhead
  const longRun = longRunRead === 'failed' ? null : marketLongRunFor({ ...longRunRead, month, filling: soFar })

  return {
    brand,
    noun,
    period,
    weekUnavailable,
    params: p,
    week: weekBlock,
    month: monthBlock,
    top,
    subjects: subjectBoard,
    rail,
    table,
    panel,
    subjectPanel,
    brands,
    longRun,
    longRunUnread: longRunRead === 'failed',
  }
}

/**
 * The month's long-run read as This month prints it, or null: no read, a read
 * of another month than the one the view reads (the selector is asked for the
 * view's month; this holds it there), or a read with no idea to print. Ideas
 * with no headline are left out. Pure.
 */
export function marketLongRunOf(read: StoredLongRun | null | undefined, month: string): MarketLongRun | null {
  if (!read || monthStartOf(read.month) !== monthStartOf(month)) return null
  const ideas = read.data.ideas
    .filter((idea) => (idea.headline ?? '').trim())
    .map((idea) => ({
      headline: idea.headline.trim(),
      body: (idea.body ?? []).map((p) => p.trim()).filter(Boolean),
      videos: idea.videos,
      heard: (idea.months ?? []).filter((m) => m.videos > 0).map((m) => monthStartOf(m.month)),
      who: idea.who ?? [],
    }))
  if (ideas.length === 0) return null
  const across = `What holds across ${monthsPhrase(read.data.months)}`
  return {
    month: monthStartOf(read.month),
    viewMonth: monthStartOf(month),
    earlier: false,
    title: across,
    across,
    inShort: (read.data.inShort ?? '').trim() || null,
    ideas,
    partialThrough: read.data.partialThrough ?? null,
  }
}

/**
 * The ONE long-run read This month prints (Heinrich, 13 Oct): the view's own
 * month's where it has one that prints; else, only where the view reads a
 * month still FILLING (`filling`, the month under way: its read is written
 * when it closes), the newest ready read of any earlier month (`closed`:
 * `loadPublishedLongRun` with `before`, usually last month's, an older one
 * where last month has none), headed with its own month so it never reads as
 * this month's; else none. A closed month with no read of its own shows
 * none: `?month=` of a closed month only ever shows that month's. Pure.
 */
export function marketLongRunFor(a: { own: StoredLongRun | null; closed: StoredLongRun | null; month: string; filling: boolean }): MarketLongRun | null {
  const own = marketLongRunOf(a.own, a.month)
  if (own || !a.filling || !a.closed || monthStartOf(a.closed.month) >= monthStartOf(a.month)) return own
  const earlier = marketLongRunOf(a.closed, a.closed.month)
  if (!earlier) return null
  return { ...earlier, viewMonth: monthStartOf(a.month), earlier: true, title: `${longMonth(earlier.month)}’s long-run read` }
}

/** This week's platforms with each one's month beside it (decision 1). Pure. */
export function withMonthPlatforms(block: PlatformsBlock | null, month: Record<string, number> | null, text: string): PlatformsBlock | null {
  if (!block) return null
  if (!month) return { ...block, month: null }
  return { ...block, month: { counts: month, n: Object.values(month).reduce((a, b) => a + (Number(b) || 0), 0), text } }
}

/** The market's videos month by month, the last `MARKET_TIME_MONTHS` with a
 *  reading, oldest first (Over time's top card). Pure. */
export function marketMonths(pooled: ReadonlyMap<string, { videos: number | null }>, month: string, nowMonth: string): MonthCount[] | null {
  const out: MonthCount[] = []
  let m = monthStartOf(month)
  for (let i = 0; i < MARKET_TIME_MONTHS; i++) {
    const v = pooled.get(m)?.videos
    if (v != null) out.unshift({ month: m, label: longMonth(m), k: v, n: null, filling: m >= nowMonth })
    m = prevMonth(m)
  }
  return out.length > 0 ? out : null
}

/**
 * The third card's stand-in where nothing was first heard this week: the
 * newest conversation an earlier week's published read first heard (that
 * read's own rule, `firstHeardThisWeek`), newest week first and that read's
 * order within it, with this period's counts; one the themed run cannot name
 * is passed over. Null where none of them can be named. Pure.
 */
export function earlierNewOf(earlier: readonly EarlierNew[], input: ConvInput, href: (id: string) => string, onRow: ReadonlySet<string> = new Set()): SideCard['earlier'] {
  for (const e of earlier) {
    for (const id of e.themeIds) {
      if (onRow.has(id)) continue
      const conv = convOf(id, input)
      if (conv) return { conv, href: href(id), week: windowLabel(e.window) }
    }
  }
  return null
}

/**
 * The new card's stand-in where nothing is new and no earlier week named one
 * (the lead's ruling, 13 Oct): the week's next biggest conversation not
 * already on the row, never one set apart (it leads nothing, decision F). The
 * card prints it under "Also talked about", its week beside its month, with
 * no word of movement. Null where there is none. Pure.
 */
export function alsoTalkedOf(convs: readonly MarketConv[], onRow: ReadonlySet<string>, setApart: { has(id: string): boolean }): MarketConv | null {
  return convs.find((c) => !onRow.has(c.id) && c.setApart == null && !setApart.has(c.id)) ?? null
}

/** The flag card: the check's verdict, the conversation a theme flag names
 *  (whether or not it reaches the table's floor), its month, and where it
 *  opens. A kind flag is named in the rail's words. Pure. */
export function flagCardOf(a: {
  flag: Omit<UnusualFlag, 'quotes'>
  window: { from: string; to: string }
  convs: readonly MarketConv[]
  convInput: ConvInput
  monthCategory: number | null
  p: MarketParams
  noun: string | null
}): FlagCard | null {
  const { flag } = a
  const conv = flag.objectKind === 'theme' ? a.convs.find((c) => c.id === flag.objectId) ?? convOf(flag.objectId, a.convInput) : null
  const label = conv?.label ?? (flag.objectKind === 'kind' ? talkKindLabel(flag.objectId, a.noun) : flag.label)
  const verdict = flagVerdict({ ...flag, label }, a.window)
  if (!verdict) return null
  return {
    verdict,
    flag: { ...flag, label },
    baselineText: monthsText(flag.baselineMonths),
    conv,
    month: conv && conv.month != null && a.monthCategory != null ? { k: conv.month, n: a.monthCategory } : null,
    href: flag.objectKind === 'theme' ? convHref(a.p, flag.objectId, 'top') : flag.objectKind === 'subject' ? subjectHref(a.p, flag.objectId) : null,
  }
}

/** The top card a conversation is (0 the hero), or -1. */
function topIndexOf(top: TopRow, id: string): number {
  const ids: (string | null)[] = [
    top.hero ? (top.hero.kind === 'flag' ? top.hero.card.conv?.id ?? null : top.hero.conv.id) : null,
    ...top.sides.map((s) => (sideIds(s).includes(id) ? id : sideIds(s)[0] ?? null)),
  ]
  return ids.indexOf(id)
}

/** The open conversation in full: its month line, who and where, what people
 *  did, the groups it is in, three gated quotes and our read (level 2). */
async function loadConvPanel(a: {
  db: SupabaseClient
  clientId: string
  id: string
  at: PanelAt
  p: MarketParams
  period: Period
  month: MarketMonth
  week: MarketWeek | null
  conv: MarketConv | null
  read: WeekReadData | null
  flag: Omit<UnusualFlag, 'quotes'> | null
  themedRunId: string | null
  nowMonth: string
  pair: PairOn
  personas: readonly { key: string; name: string; registryIds: readonly string[] }[]
  noun: string | null
  kindsFor: (id: string) => Promise<{ kind: string; label: string; videos: number }[] | null>
  topIndex: number
  /** The cards beside the hero, which decide where the notch points. */
  sides: number
  runThemes: ReadonlyMap<string, RunTheme>
}): Promise<ConvPanel | null> {
  const { db, clientId, id } = a
  const registryLabels = a.conv ? new Map<string, string>() : await soft('registry', loadRegistryLabels(db, clientId, [id]), new Map<string, string>())
  const label = a.conv?.label ?? registryLabels.get(id) ?? null
  if (!label) return null
  const kind = a.conv?.kind ?? a.runThemes.get(id)?.kind ?? null
  const [line, monthRow, kinds, quotes, description] = await Promise.all([
    soft('line', loadThemeSeries(db, clientId, [id], a.month.month, 12).then((set) => {
      const s = set.get(id)
      return s ? themeMonthLine(s, a.month.month, a.pair) : null
    }), null as ThemeMonthLine | null),
    a.conv ? Promise.resolve(null) : soft('monthRow', loadMonthThemeRows(db, clientId, a.month.month).then((m) => m.get(id) ?? null), null),
    a.kindsFor(id),
    soft('quotes', loadThemeQuotes(db, clientId, a.themedRunId, new Map([[id, kind]]), a.month.month), new Map<string, { candidates: CiteCandidate[]; texts: string[] }>()),
    soft('description', loadDescription(db, clientId, a.themedRunId, id), null),
  ])
  const picked = pickQuotes(quotes.get(id)?.candidates ?? [], {
    month: a.month.month, kind, count: MARKET_QUOTES, skipOffers: true,
    gate: gateFor(clientId, { claim: label, requireRelevance: true }),
  }) as CiteCandidate[]
  const flagHere = a.flag && a.flag.objectKind === 'theme' && a.flag.objectId === id ? a.flag : null
  const prevPoint = line?.points.find((pt) => pt.month === prevMonth(a.month.month)) ?? null
  // A conversation the period does not list (an old link): its month only.
  const conv: MarketConv = a.conv ?? {
    id, label, kind, subjectId: null, subjectName: null, week: null, weeks: [],
    month: monthRow?.videos ?? null, months: [], who: [], mix: monthRow?.mix ?? null, isNew: false, monthVerdict: line?.verdict ?? null, setApart: null,
  }
  const doing = doingOf(kinds, conv.month, a.noun)
  const platforms = platformRows(conv.mix, a.period === 'week' ? 'week' : 'month')
  return {
    id,
    label,
    kind,
    subjectName: conv.subjectName,
    at: a.at,
    notchAt: notchOf(a.at, Math.max(0, a.topIndex), a.sides),
    flag: flagHere && a.week ? flagVerdict(flagHere, a.week.window) : null,
    isNew: conv.isNew,
    stats: panelStats({ conv, period: a.period, week: a.week, month: a.month, prevK: prevPoint?.k ?? null, flag: flagHere, baselineText: flagHere ? monthsText(flagHere.baselineMonths) : null }),
    ourRead: ourReadOf({ id, read: a.read, flag: flagHere, description }),
    line: line ? { bars: lineBars(line, a.nowMonth), verdict: line.verdict, basis: 'the category’s videos' } : null,
    who: conv.who.length > 0 ? { parts: conv.who, n: conv.who.reduce((s, x) => s + x.videos, 0) } : null,
    doing: doing.length > 0 && conv.month ? { rows: doing, n: conv.month, text: a.month.soFar ? `in ${longMonth(a.month.month)} so far` : `in ${longMonth(a.month.month)}` } : null,
    groups: groupsOf(id, a.personas),
    platforms: platforms ? { rows: platforms.rows, n: platforms.n } : null,
    quotes: picked.map(panelQuoteOf),
    askHref: askAboutTheme({ label, kind }),
    closeHref: closeHref(a.p, a.at),
  }
}

/** The open subject: its month line, every conversation inside it (a
 *  set-apart one tagged), and the week read's sentence on it where the read is
 *  of this month. A subject that prints no level says why; one whose check is
 *  open, or that was not read this month, still lists the conversations inside
 *  it (the parity pass, 13 Oct: those are the conversations' own counts, and
 *  exist without calibration); one being re-described lists nothing. Pure. */
export function buildSubjectPanel(a: {
  id: string
  facts: readonly SubjectFact[]
  convs: readonly MarketConv[]
  period: Period
  p: MarketParams
  read: WeekReadData | null
  month: MarketMonth
  /** The week's flag, where it names a conversation inside the subject. */
  flag?: { id: string; verdict: Verdict } | null
}): SubjectPanel | null {
  const f = a.facts.find((x) => x.id === a.id)
  if (!f) return null
  const m = a.month.month
  const measured = f.level != null && f.level.n > 0
  const unmeasured = measured ? null : unmeasuredOf(f, a.month.text, '')
  const standing = a.read && monthStartOf(a.read.month) === m ? a.read.standing.find((s) => s.subjectId === a.id) : null
  const bars: MonthCount[] = f.trail
    .filter((pt) => monthStartOf(pt.month) <= m && pt.n != null)
    .slice(-MARKET_PANEL_MONTHS)
    .map((pt) => ({ month: monthStartOf(pt.month), label: longMonth(pt.month), k: pt.k ?? 0, n: pt.n, filling: monthStartOf(pt.month) === m && a.month.soFar }))
  return {
    id: f.id,
    name: f.name,
    state: unmeasured ? unmeasured.state : 'ready',
    note: unmeasured ? unmeasured.note : null,
    at: 'subjects',
    notchAt: notchOf('subjects'),
    level: measured && f.level ? { ...f.level, pct: share(f.level.k, f.level.n) } : null,
    verdict: measured ? f.verdict : null,
    monthText: a.month.text,
    bars: measured ? bars : [],
    inside: unmeasured?.state !== 'failed' ? insideOf(f.id, a.convs, a.period, { limit: 50, href: (id) => convHref(a.p, id, 'subjects'), flagId: a.flag?.id ?? null, flag: a.flag?.verdict ?? null }) : [],
    sentence: standing?.sentence?.trim() ? { body: standing.sentence.trim(), figures: (a.read?.figures ?? {}) as unknown as PrintedFigures } : null,
    askHref: `/dashboard/agent?ask=${encodeURIComponent(`What does my market say about ${f.name}?`)}`,
    closeHref: closeHref(a.p, 'subjects'),
  }
}

// ---- The Dashboard's Market tile (T8) -----------------------------------------------------

/**
 * WHAT THE DASHBOARD'S MARKET TILE PRINTS (E1-Dashboard, depth plan T8): the
 * week's flag where the anomaly check raised one, else the week's biggest
 * conversation first heard this week, else its biggest; with its three weekly
 * counts and its month; then the week's biggest conversation's three counts
 * (unless it leads) and one more first heard this week. Each links to its open
 * panel on Market. Null where no week has been read.
 *
 * The same builders as the page (`buildConvs`, `pickHero`, `pickWeekSides`,
 * `flagCardOf`, `setApartOf`), so the tile and Market's top row never
 * disagree.
 */
export interface MarketTop {
  /** The flag card, or the lead conversation. */
  hero: { kind: 'flag'; card: FlagCard } | { kind: 'new' | 'biggest'; conv: MarketConv; href: string } | null
  /** Up to two rows under it: the week's biggest (its three counts) and one
   *  more first heard this week. */
  rows: { kind: 'biggest' | 'new'; conv: MarketConv; href: string }[]
  /** OPTIONAL (parity pass, 13 Oct): where nothing more was first heard this
   *  week, the week's next biggest conversation not already on the tile and
   *  not set apart, so the tile keeps the board's two rows (Market's third
   *  card's "Also talked about", `alsoTalkedOf` on parity/market; unify at
   *  merge). Null where there is none. */
  also?: { conv: MarketConv; href: string } | null
  /** The category's videos this week and in the month: every conversation
   *  count's n. */
  category: { week: number | null; month: number | null }
  week: { dates: string; inMonth: string; labels: string[] }
  /** Open Market. */
  href: string
}

/**
 * The tile's data. LIGHT: the read (pass the one the Dashboard already holds),
 * then one wave (the flag, the themed run, the change log, the runs, the
 * month's rows and its category), then the three window reads beside the
 * run's labels. Null where no week has been read; THROWS where the themed run,
 * the newest week or its labels could not be read, so the caller prints a
 * failure, not "nothing yet".
 */
export async function topMarket(input: {
  supabase: SupabaseClient
  clientId: string
  reading: ReadingHandle
  read?: PublishedWeekRead | null
  /** The caller's own read of the published read's window (the newest week),
   *  under the themed run, over the market's audiences, where it holds one:
   *  the tile then reads only the two windows before it. */
  windowRead?: WindowReading | null
  now?: Date
}): Promise<MarketTop | null> {
  const { supabase, clientId } = input
  const db = input.reading.client
  const nowIso = (input.now ?? new Date()).toISOString()
  const nowMonth = monthStartOf(nowIso)
  const published = input.read !== undefined ? input.read : await soft('top.read', loadPublishedWeekRead(db, clientId), null)
  if (!published) return null
  const read = published.data
  const windows = weekWindows(read.window)
  if (!windows) return null
  const weekMonth = readingMonthOf(read.window)
  const month = monthStartOf(weekMonth.month)
  const soFar = monthSoFar(month, nowMonth, weekMonth.complete)
  // A RUN LOOKUP THAT FAILS IS A FAILURE, NOT "NO WEEK YET" (T8's check): it
  // rejects out of the tile's read, so the Dashboard prints its failure line
  // rather than the first-run words. No themed run at all is still null.
  const themedRunAhead = fetchRunningRunIds(supabase, clientId, 'market.top').then((ids) => fetchThemedRunId(supabase, clientId, ids, 'market.top'))
  themedRunAhead.catch(() => {})
  const segmentsAhead = themedRunAhead.then((runId) => (makerRuleEnabled(clientId) && runId ? soft('top.segments', loadThemeSegmentRows(db, clientId, month, runId), null) : null), () => null)
  const [themedRunId, rivals, changes, cadence, flag, monthRows, monthCategory] = await Promise.all([
    themedRunAhead,
    soft('top.rivals', loadTrackedRivals(supabase, clientId), []),
    soft('top.changes', loadChanges(db, clientId), []),
    soft('top.cadence', loadCadenceRuns(supabase, clientId), null),
    soft('top.flag', loadWeekFlag(db, clientId, published.runId), null),
    soft('top.monthThemes', loadMonthThemeRows(db, clientId, month), new Map<string, { videos: number; mix: PlatformMix | null }>()),
    soft('top.category', loadCategoryMonth(db, clientId, month), null),
  ])
  const market = marketAudiences(marketRivalAudiences(rivals))
  const cut = cutWindows(windows, ourChangesWithoutGatherFlags(changes.filter((r) => !isFailOpenFix(r))), cadence ?? [])
  const last = windows.length - 1
  const [reads, segmentRows] = await Promise.all([
    themedRunId
      ? Promise.all(windows.map((w, i) => (cut[i]
        ? Promise.resolve(null)
        : i === last && input.windowRead
          ? Promise.resolve(input.windowRead)
          : soft(`top.window${i}`, loadWindowReading(db, clientId, { from: w.from, to: w.to, runId: themedRunId, audiences: market }), null))))
      : Promise.resolve([] as (WindowReading | null)[]),
    segmentsAhead,
  ])
  if (reads.length === 0) return null
  // The newest window not read (where no change of ours cut it) is a failure
  // the tile says, never a week with nothing in it.
  if (!cut[last] && reads[last] == null) throw new Error('market.top: the newest week could not be read')
  const weekCounts = reads.map((r) => categoryThemeVideos(r))
  // LABELS FOR THE WEEK'S THEMES ONLY (the theme, its label and its kind): the
  // tile places no conversation in a subject, so no member list is read. A
  // failed read throws (no label, no conversation to lead with).
  const ids = [...new Set([...(weekCounts[last]?.keys() ?? []), ...(flag?.objectKind === 'theme' ? [flag.objectId] : [])])]
  const runThemes = await loadThemeLabels(db, clientId, themedRunId, ids)
  const setApart = setApartOf(segmentRows)
  const params = marketParams({})
  const convInput: ConvInput = {
    period: 'week',
    themes: runThemes,
    subjects: null,
    weekCounts,
    weekCut: cut,
    monthCounts: new Map([...monthRows.entries()].map(([id, r]) => [id, r.videos])),
    monthMixes: new Map([...monthRows.entries()].map(([id, r]) => [id, r.mix])),
    series: new Map(),
    month,
    nowMonth,
    newIds: new Set(read.version === 2 ? read.newThisWeek.map((n) => n.themeId) : []),
    setApart,
    pair: null,
  }
  const convs = buildConvs(convInput)
  const card = flag ? flagCardOf({ flag, window: read.window, convs, convInput, monthCategory, p: params, noun: WHAT_THEY_SELL[clientId] ?? null }) : null
  const pick = pickHero({ convs, flag: card, setApart })
  const hero: MarketTop['hero'] = card
    ? { kind: 'flag', card }
    : pick && pick.kind !== 'flag' ? { kind: pick.kind, conv: pick.conv, href: convHref(params, pick.conv.id, 'top') } : null
  const heroId = card ? card.conv?.id ?? null : pick && pick.kind !== 'flag' ? pick.conv.id : null
  const sides = pickWeekSides({ convs, heroId, setApart })
  const rows: MarketTop['rows'] = []
  if (sides.biggest) rows.push({ kind: 'biggest', conv: sides.biggest, href: convHref(params, sides.biggest.id, 'top') })
  if (sides.fresh[0]) rows.push({ kind: 'new', conv: sides.fresh[0], href: convHref(params, sides.fresh[0].id, 'top') })
  // = alsoTalkedOf (parity/market), unify at merge.
  const onRow = new Set([heroId, ...rows.map((r) => r.conv.id)].filter((x): x is string => x != null))
  const next = sides.fresh[0] ? null : convs.find((c) => !onRow.has(c.id) && c.setApart == null && !setApart.has(c.id)) ?? null
  return {
    hero,
    rows,
    also: next ? { conv: next, href: convHref(params, next.id, 'top') } : null,
    category: { week: categoryVideos(reads[last] ?? null), month: monthCategory },
    week: { dates: weekReadDates(read.window), inMonth: inMonth(month, !soFar), labels: windows.map(windowLabel) },
    href: MARKET,
  }
}

/** These themes' labels and kinds on the themed run, and nothing else (no
 *  member ids: the tile places nothing in a subject). */
async function loadThemeLabels(db: SupabaseClient, clientId: string, runId: string | null, ids: readonly string[]): Promise<Map<string, RunTheme>> {
  const out = new Map<string, RunTheme>()
  if (!runId || ids.length === 0) return out
  const parts = await mapWithLimit(chunk([...ids], UUID_IN_CHUNK), READ_CONCURRENCY, async (part) => {
    const res = await db.from('theme_observations').select('theme_id, label, category')
      .eq('client_id', clientId).eq('run_id', runId).in('theme_id', part).order('theme_id', { ascending: true })
    if (res.error) throw new Error(`theme_observations labels: ${res.error.message}`)
    return (res.data ?? []) as { theme_id: string; label: string | null; category: string | null }[]
  })
  for (const r of parts.flat()) out.set(String(r.theme_id), { label: (r.label ?? '').trim(), kind: r.category ?? null, memberIds: [] })
  return out
}

/** The category's videos in one month (`month_denominators`). */
async function loadCategoryMonth(db: SupabaseClient, clientId: string, month: string): Promise<number | null> {
  const res = await db.from('month_denominators').select('videos').eq('client_id', clientId).eq('month', monthStartOf(month)).eq('audience', INDUSTRY_AUDIENCE).maybeSingle()
  if (res.error) throw new Error(`month_denominators: ${res.error.message}`)
  const v = (res.data as { videos?: number | null } | null)?.videos
  return v == null ? null : Number(v)
}

/** For a test: the month a week read is restated against. */
export const weekReadMonth = (read: Pick<WeekReadData, 'window'>): string => monthStartOf(readingMonthOf(read.window).month)

/** "19" as the page prints a count. */
export const count = (n: number | null | undefined): string => (n == null ? '' : fmtInt(n))

// Keep the next-month helper importable for the fixtures' months.
export { nextMonth }
