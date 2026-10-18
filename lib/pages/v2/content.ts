import { marketConversationPath } from '../../nav'
import { contentIdeaPath, CONTENT_POSTS_PATH, contentRepliesHref } from './content-address'
import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, UUID_IN_CHUNK } from '../../chunk'
import { median } from '../../content-tiles'
import { fmtInt, longMonth, platformLabel, shortDate } from '../../format'
import { printsMedicalLine } from '../../post-ideas/medical'
import { postIdeasEnabled } from '../../config'
import { POST_IDEA_OWNED_MONTHS } from '../../post-ideas/select'
import {
  isMissingPostIdeas, loadPostIdeas, subquestionCounts, TABLE_POST_IDEAS,
  type PostIdeaLength, type PostIdeaRank, type PostIdeaRow,
} from '../../post-ideas/types'
import { readableQuote } from '../../quotes'
import { ENGAGEMENT_EXCLUDED } from '../../reading/formats'
import { marketAudiences } from '../../reading/market'
import { monthStartOf, nextMonth, prevMonth } from '../../reading/month-key'
import { isOwnedPost, ownedPosts, summariseOwnedPosts, type OwnedPost, type OwnedPosts } from '../../reading/owned'
import { loadWindowReading, type WindowDenominator, type WindowThemeReading } from '../../reading/read'
import { marketRivalAudiences } from '../../reading/reading-view'
import { bandVerdict, type Counted, type Verdict } from '../../reading/verdicts'
import { quoteRef } from '../../renderables/quotes-freeze'
import type { Scope } from '../../renderables/types'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, loadTrackedRivals } from '../../rivals'
import { selectAll } from '../../supabase-admin'
import { loadPublishedWeekRead, type PublishedWeekRead } from '../../written/published'
import { coveredDays, readingMonthOf } from '../../written/month'
import { loadSubjectPlacement, placeConversations } from '../subject-place'
import { questionTouch, type QuestionPost } from '../own-post-touch'
import { buildPlaybook, loadPlaybookVideos, type PlaybookBlock } from '../playbook'
import { buildReplies, loadCheckStrict, loadFlagsStrict, weekFlagRows, workedLabel, type RepliesBlock, type ReplyRow } from '../week'


// CONTENT (depth v2, T6; boards E5-Content and E5-Content-Open): what should
// we post next, and what works?
//
// FIVE BLOCKS, EACH ON ITS OWN CLOCK, AND EACH SAYS WHICH.
//
//   What to post next   the week's post ideas (`post_ideas`, T13), which read
//                       the question comments of the four weeks to their
//                       run's end (Heinrich, 13 Oct: `read_start` /
//                       `read_end`, printed "From questions asked 14 Sep to
//                       11 Oct"): one card a question conversation, its
//                       videos over those four weeks beside its month
//                       (decision 1), the four weeks as four bare counts,
//                       who asks (group names, no counts: decision 5),
//                       whether your posts touched on it, and the format and
//                       opening code chose with their multiples. Each opens
//                       its own page (`/dashboard/content/ideas/<id>`,
//                       lib/pages/v2/content-idea.ts).
//   What works          the month's market videos by format and by opening
//                       (`buildPlaybook`, published clock), with your own
//                       posts beside each row (`clientSide: 'owned'`) and a
//                       sentence about your mix that code writes.
//   Worth a reply       the comments worth answering (This week's queue,
//                       `buildReplies`), split by whose post they sit under.
//                       A list, never "N waiting": nothing here can see
//                       whether you replied (decision 5). Its page is
//                       `/dashboard/content/replies` (content-pages.ts).
//   Your posts          your own accounts' posts this month (`ownedPosts`):
//                       how many, where, their typical response against the
//                       market's, the best one. Its page is
//                       `/dashboard/content/posts` (content-pages.ts).
//   Also asked          the week's (or month's) other question
//                       conversations your posts have not touched on.
//
// THE WEEK IS A RUN'S FROZEN WINDOW, never the clock (AGENTS.md): the ideas'
// own window where there are ideas, else the published week read's. Every
// count over it is stated again beside its month (`readingMonthOf`), and the
// three weekly counts carry no word. THE IDEAS' COUNTS ARE OVER THE DAYS THEY
// READ (`IdeasRead`, the stored `read_start` / `read_end`), dated by the
// comment, under the page's run's clustering, each beside the page's month.
//
// NO QUOTE AT LEVEL 1. The comments' words, the words to borrow and the reply
// list's comments are all one click down, on a page of their own (depth as
// pages, 17 Oct; the G5 boards): nothing on Content opens in place.
//
// THE READS, in three waves: (1) the ideas, the published read, the brand, the
// groups, the rivals; (2) everything the week and the month decide: the
// window readings, the run's question conversations, the anomaly flags, your
// posts, the month's videos, the reply queue; (3) the subjects of the
// conversations shown.

// ---- the shapes --------------------------------------------------------------------

export type ContentPeriod = 'week' | 'month'

/** The page's two periods, in the switch's order. */
export const CONTENT_PERIODS: readonly { value: ContentPeriod; label: string }[] = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
]

/** The page's address. */
export const CONTENT_PATH = '/dashboard/content'

/** The also-asked table's anchor. */
export const ASKED_ID = 'also-asked'
/** A card on the ideas row that holds a question (`QuestionCardView`), by its
 *  place on the row: the ideas' cards come first, then the questions in line
 *  (`askedWithLead`). */
export const questionSlotId = (rank: number): string => `idea-slot-${rank}`
/** Worth a reply's card. The anchor This week's stored snapshots and emails
 *  link replies to (`WEEK_ANCHORS.reply`, `/dashboard/content#worth-a-reply`,
 *  written before Design v2 and never re-written), so an old link lands on
 *  the card. A hash never reaches the server, so the anchor alone cannot open
 *  the list: it scrolls to the card, whose "Open the replies" is one click.
 *  An old link's `?reply=<intent>` lands on the list's page, at its section
 *  (lib/nav.ts `contentRedirect`). */
export const REPLIES_ANCHOR = 'worth-a-reply'

/** The also-asked table's rows before "all" is asked for. */
export const ASKED_SHOWN = 5

/** A post idea's market videos (its page's "Market videos where this came
 *  up"). */
export const PANEL_VIDEOS = 3
/** Words to borrow: at most this many, each short enough to be a phrase. */
export const WORDS_SHOWN = 4
export const WORD_MAX_CHARS = 60

/** The response scale the "What works" bars are drawn against: 1× (typical)
 *  sits a quarter of the way along, as on the board. */
export const WORKS_SCALE_MAX = 4
/** Rows a "What works" chart draws. */
export const WORKS_ROWS = 6

/** The group names "Who's asking" prints before it stops. */
export const GROUPS_SHOWN = 2

/** The prose slot the stored idea words were written under (lib/prose/scrub.ts). */
export const POST_IDEA_SLOT = 'post_idea' as const

export interface ContentWeek {
  runId: string
  /** The run's frozen window, half-open. */
  from: string
  to: string
  /** The comment dates it holds, `YYYY-MM-DD`. */
  first: string
  last: string
  days: number
  /** "5 to 11 Oct". */
  label: string
  /** Exactly seven days: only then are three windows "three weeks". */
  isWeek: boolean
}

export interface ContentMonth {
  /** `YYYY-MM-01`. */
  month: string
  /** The week started in the month before the one it ended in: the month is
   *  stated in full, not "so far" (lib/written/month.ts). */
  complete: boolean
  from: string
  to: string
}

/** A format or an opening, with its response multiple. */
export interface Recipe {
  key: string
  /** The chip's words: "Tutorial", "Open with a question". */
  label: string
  /** The value's own name: "Tutorial", "A question". */
  name: string
  multiple: number | null
}

/** Whether your posts touched on a conversation (`questionTouch`, the one
 *  word check every page runs). */
export interface OwnTouch {
  state: 'touched' | 'none' | 'no_posts' | 'unread'
  touched: number
  posts: number
  /** The first month the posts were read from (`ideaOwnedFrom`): the step's
   *  own window, so the page and the step agree on "already touched". */
  since: string
}

export interface GroupName {
  key: string
  name: string
}

export interface IdeaCard {
  /** `post_ideas.id`: its page's address. Absent on a page dumped before the
   *  idea pages (17 Oct), which then opens the root. */
  id?: string
  rank: PostIdeaRank
  registryId: string
  /** The model's title (`stored`, slot `post_idea`). */
  title: string
  /** The conversation's own label this run, where the run named it. */
  label: string | null
  /** Videos in the market where it came up over the days the ideas read
   *  (`IdeasRead`), of the market's videos over those days. */
  read: Counted | null
  /** The same over the month, so far or in full: the read's figure is never
   *  printed without it (decision 1). */
  month: Counted | null
  /** The weeks the ideas read, oldest first, as bare counts (decision 1).
   *  Null where the read window is not whole weeks or the reading could not
   *  be made. */
  weeks: { label: string; count: number }[] | null
  /** The anomaly check's flag, or the week read's "new"; null for neither. */
  flag: Verdict | null
  groups: GroupName[]
  own: OwnTouch
  format: Recipe | null
  opening: Recipe | null
  subject: { id: string; name: string } | null
  /** Print the medical team line under it. */
  medical: boolean
}

export interface IdeaSubquestion {
  label: string
  videos: number
  comments: number
}

export interface MarketVideoCard {
  id: string
  title: string | null
  account: string | null
  platform: string
  format: string | null
  opening: string | null
  /** Its response against a typical video in the market this month. Null on
   *  Reddit, and where either rate is missing. */
  multiple: number | null
  url: string | null
}

export type IdeasState = 'ready' | 'not_on' | 'none' | 'stale' | 'unread'

/** The week the ideas were written for: their run's window. `current` where
 *  that run is the one whose week the page shows; otherwise the step stored
 *  nothing newer (a thin week tells nobody) and the page says so. */
export interface IdeasWeek {
  runId: string
  /** "5 to 11 Oct". */
  label: string
  /** "the week of 28 Sep", or the days where the window is not a week. */
  phrase: string
  current: boolean
  /** The days the ideas read their questions from: what the page prints. */
  read: IdeasRead
  /** The month each idea's four-week figure is printed beside (decision 1):
   *  the page's month where the ideas are the page's week's (`current`; their
   *  run's window, `readingMonthOf`); for an older set, the month of THEIR
   *  read window (`readingMonthOf` over `read`: the lead's ruling, 13 Oct),
   *  so the four weeks and the month always share days. */
  month: ContentMonth
}

/** The days a set of ideas read (`post_ideas.read_start` / `read_end`; the
 *  four weeks to its run's end, lib/post-ideas/select.ts `ideasReadWindow`). */
export interface IdeasRead {
  /** Half-open, as stored. */
  from: string
  to: string
  /** "14 Sep to 11 Oct". */
  label: string
  /** Its whole weeks, oldest first, each named by its first day ("14 Sep"):
   *  the four bare weekly counts. Null where it is not two or more whole
   *  weeks (a row read under another rule). */
  weeks: { from: string; to: string; label: string }[] | null
}

export interface IdeasBlock {
  state: IdeasState
  cards: IdeaCard[]
  /** The ideas' own week; null where none print. */
  week: IdeasWeek | null
  /**
   * THE ROW KEEPS THE BOARD'S THREE CARDS (parity pass, 13 Oct: "the page
   * shouldn't look too different if everything isn't as populated as the
   * design"). Where fewer than `IDEA_SLOTS` ideas print (none written, fewer
   * cleared the step's floor, the step not switched on), each card the ideas
   * leave holds the next question in line instead: the top of the also-asked
   * list (conversations filed as questions over the page's period that none of
   * your posts touched on), which then leaves them out. A question card draws
   * what the data feeds (the question, its videos beside its month, its three
   * weeks, who asks, your posts) and says in the format's place that the
   * format comes with a post idea. Never padded: a slot with no question left
   * is an empty card that says so.
   */
  questions: QuestionSlot[]
}

/** A question in a card the ideas left: its also-asked row, and the flag an
 *  idea on it would wear (the anomaly check's, or the week read's new). */
export interface QuestionSlot extends AskedRow {
  flag: Verdict | null
  /** Where it came up: its videos by platform over the page's period, the
   *  most first (each video counted on its own platform; they sum to its
   *  figure). Null where not read. */
  platforms: { platform: string; videos: number }[] | null
  /** The comments it holds over the page's week and its month (decision 1:
   *  the week's never alone). Null where not read. */
  comments: { week: number | null; month: number | null } | null
}

/** The cards the ideas row always draws (E5-Content's three). */
export const IDEA_SLOTS = 3

/** Ideas this many days older than the page's week stop printing. */
export const IDEAS_STALE_DAYS = 28


export interface WorksRow {
  key: string
  label: string
  /** Share of the market's classified videos with this value, 0 to 100. */
  share: number | null
  multiple: number
  /** Your posts this month with this value. */
  yours: number
}

/** A sentence code wrote, its numbers marked: a string is words, an object a
 *  figure. */
export type SentencePart = string | { figure: string }

export interface WorksBlock {
  month: string
  complete: boolean
  formats: WorksRow[]
  openings: WorksRow[]
  /** Your posts published this month (the squares' n). */
  posts: number
  sentence: SentencePart[] | null
  /** What the reading was read off, in the reader's words. */
  basis: SentencePart[] | null
  unread: string | null
}

/** The days a list was picked from: the window, and how a sentence names it
 *  ("between 5 and 11 Oct", "in October so far"). */
export interface DaysWindow {
  from: string
  to: string
  phrase: string
}

export interface RepliesView {
  /** The days the queue was picked from. */
  window: DaysWindow | null
  rows: ReplyRow[]
  flagged: ReplyRow[]
  total: number
  counts: { buying: number; question: number; objection: number; flagged: number }
  under: { own: number; about: number; elsewhere: number }
  unread: string | null
}

export interface PostRow {
  id: string
  date: string
  platform: string
  title: string | null
  format: string | null
  opening: string | null
  multiple: number | null
  url: string | null
}

export interface PostsBlock {
  month: string
  complete: boolean
  total: number
  byPlatform: { platform: string; posts: number }[]
  /** Your typical post's response against a typical market video. */
  response: { multiple: number; rated: number } | null
  /** Your posts with a response figure (Reddit and a photo have none), the
   *  typical post's floor read against `OWN_RESPONSE_MIN`. Absent on a page
   *  dumped before the parity pass. */
  rated?: number
  /** Whether the market's typical video was read: without it no post has a
   *  multiple, whatever its own figures. Absent on a page dumped before the
   *  parity pass (read as true). */
  marketTypical?: boolean
  best: PostRow | null
  rows: PostRow[]
  unread: string | null
}

export interface AskedRow {
  registryId: string
  label: string
  groups: GroupName[]
  subject: string | null
  /** Its videos over the page's week, and over its month beside it (decision
   *  1: a week's figure is never printed alone). Null where not read. */
  week: number | null
  month: number | null
  weeks: number[] | null
}

export interface AskedBlock {
  period: ContentPeriod
  rows: AskedRow[]
  /** The conversations not yet in your posts, beyond the ideas and the
   *  questions the ideas row holds. */
  total: number
  /** Conversations your posts touched on, left out of the table. */
  touched: number
  /** The first month of your posts the touch test read (`ideaOwnedFrom`). */
  since: string
  /** Your posts the touch test read (since `since`); null where they could
   *  not be read, and then nothing was left out as touched. Absent on a page
   *  dumped before the parity pass. */
  posts?: number | null
  expanded: boolean
  unread: string | null
}

export interface ContentPageData {
  brand: string
  period: ContentPeriod
  week: ContentWeek | null
  month: ContentMonth
  /** The market's videos (pooled), this week and this month. */
  market: { week: number | null; month: number | null }
  ideas: IdeasBlock
  works: WorksBlock
  replies: RepliesView
  posts: PostsBlock
  asked: AskedBlock
}

// ---- the URL -----------------------------------------------------------------------

export interface ContentState {
  period: ContentPeriod
  asked: boolean
}

/** The root's params, read once: the period and the expanded table. Anything
 *  else is the default (the old panels' params never reach the page: the
 *  route sends them to their pages first, lib/nav.ts `contentRedirect`). */
export function parseContentParams(params: Record<string, string | undefined>): ContentState {
  const period: ContentPeriod = params.period === 'month' ? 'month' : 'week'
  return { period, asked: params.asked === 'all' }
}

/** The root's address with this state: the period kept unless it is the
 *  default, the table's anchor where it is expanded. */
export function contentHref(state: ContentState): string {
  const q = new URLSearchParams()
  if (state.period !== 'week') q.set('period', state.period)
  if (state.asked) q.set('asked', 'all')
  const qs = q.toString()
  return `${CONTENT_PATH}${qs ? `?${qs}` : ''}${state.asked ? `#${ASKED_ID}` : ''}`
}

/** Where an idea card opens: its page, by its row id; the root for a card
 *  dumped before it carried one. */
export const ideaHref = (card: Pick<IdeaCard, 'id'>): string => (card.id ? contentIdeaPath(card.id) : CONTENT_PATH)
/** Where Worth a reply opens: its page, the period kept. */
export const repliesHref = (period: ContentPeriod): string => contentRepliesHref({ period })
/** Where Your posts opens: its page. */
export const postsHref = (): string => CONTENT_POSTS_PATH

// ---- the clocks --------------------------------------------------------------------

const DAY_MS = 86_400_000

/** "5 to 11 Oct", "28 Sep to 4 Oct". */
export function daysLabel(first: string, last: string): string {
  const a = shortDate(`${first}T00:00:00.000Z`)
  const b = shortDate(`${last}T00:00:00.000Z`)
  if (first === last) return b
  const sameMonth = first.slice(0, 7) === last.slice(0, 7)
  return sameMonth ? `${a.split(' ')[0]} to ${b}` : `${a} to ${b}`
}

/** "between 5 and 11 Oct", "between 28 Sep and 4 Oct": the days a list was
 *  read over, inside a sentence. */
export function daysPhrase(first: string, last: string): string {
  const a = shortDate(`${first}T00:00:00.000Z`)
  const b = shortDate(`${last}T00:00:00.000Z`)
  if (first === last) return `on ${b}`
  return `between ${first.slice(0, 7) === last.slice(0, 7) ? a.split(' ')[0] : a} and ${b}`
}

/** "this week" for a seven-day window, else its days ("between 28 Sep and 4
 *  Oct"): a window is not called a week unless it is one. The page's words
 *  (`weekWordOf`) and the Dashboard tile's (`TopAsked.weekWords`). Pure. */
export function weekWordsOf(week: Pick<ContentWeek, 'isWeek' | 'first' | 'last'> | null): string {
  if (!week || week.isWeek) return 'this week'
  return daysPhrase(week.first, week.last)
}

/** A run's window as the page's week, or null for one that is not a window. */
export function contentWeek(runId: string, window: { from: string; to: string }): ContentWeek | null {
  const covered = coveredDays(window)
  if (!covered) return null
  return {
    runId,
    from: window.from,
    to: window.to,
    first: covered.first,
    last: covered.last,
    days: covered.days,
    label: daysLabel(covered.first, covered.last),
    isWeek: covered.days === 7,
  }
}

/** The month the week is restated against, as a window. Without a week, the
 *  calendar month of `now`, so far. */
export function contentMonth(week: ContentWeek | null, now: Date): ContentMonth {
  if (week) {
    const r = readingMonthOf({ from: week.from, to: week.to })
    return { month: r.month, complete: r.complete, from: `${r.month}T00:00:00.000Z`, to: r.to }
  }
  const month = monthStartOf(now.toISOString())
  return { month, complete: false, from: `${month}T00:00:00.000Z`, to: now.toISOString() }
}

/** "in October so far", "in September". */
export const monthWords = (m: Pick<ContentMonth, 'month' | 'complete'>): string =>
  m.complete ? `in ${longMonth(m.month)}` : `in ${longMonth(m.month)} so far`

/** The two weeks before the week, oldest first, each the week's own length,
 *  and the week itself: three windows. Only for a seven-day week. */
export function threeWeeks(week: ContentWeek): { from: string; to: string; label: string }[] | null {
  if (!week.isWeek) return null
  const to = Date.parse(week.to)
  const from = Date.parse(week.from)
  if (!Number.isFinite(to) || !Number.isFinite(from)) return null
  const out: { from: string; to: string; label: string }[] = []
  for (const back of [2, 1, 0]) {
    const f = new Date(from - back * 7 * DAY_MS).toISOString()
    const t = new Date(to - back * 7 * DAY_MS).toISOString()
    const first = new Date(Date.parse(week.first) - back * 7 * DAY_MS).toISOString()
    out.push({ from: f, to: t, label: shortDate(first) })
  }
  return out
}

// ---- pure pieces -------------------------------------------------------------------

const round1 = (n: number): number => Math.round(n * 10) / 10

/** "2.1×". One decimal always, so 1× typical reads 1.0× beside 2.1×. */
export const fmtMultiple = (m: number): string => `${round1(m).toFixed(1)}×`

/** Each theme's videos pooled over the market's audiences (each video is in
 *  exactly one audience, so the audiences add: lib/reading/market.ts). */
export function pooledThemeVideos(rows: readonly WindowThemeReading[] | null, audiences: readonly string[]): Map<string, number> | null {
  if (!rows) return null
  const keep = new Set(audiences)
  const out = new Map<string, number>()
  for (const r of rows) {
    if (!keep.has(r.audience)) continue
    const n = Number(r.videos)
    if (!Number.isFinite(n) || n <= 0) continue
    out.set(String(r.theme_id), (out.get(String(r.theme_id)) ?? 0) + n)
  }
  return out
}

/** The market's videos over a window, pooled; null where it was not read. */
export function pooledVideos(rows: readonly WindowDenominator[] | null, audiences: readonly string[]): number | null {
  if (!rows) return null
  const keep = new Set(audiences)
  let n = 0
  for (const r of rows) if (keep.has(r.audience)) n += Number(r.videos) || 0
  return n
}

/** Each theme's comments pooled over the market's audiences. */
export function pooledThemeComments(rows: readonly WindowThemeReading[] | null, audiences: readonly string[]): Map<string, number> | null {
  if (!rows) return null
  const keep = new Set(audiences)
  const out = new Map<string, number>()
  for (const r of rows) {
    if (!keep.has(r.audience)) continue
    const n = Number(r.comments)
    if (!Number.isFinite(n) || n <= 0) continue
    out.set(String(r.theme_id), (out.get(String(r.theme_id)) ?? 0) + n)
  }
  return out
}

/** Each theme's videos by platform, pooled over the market's audiences (each
 *  video sits on one platform in one audience, so the mixes add). */
export function pooledThemeMix(rows: readonly WindowThemeReading[] | null, audiences: readonly string[]): Map<string, Map<string, number>> | null {
  if (!rows) return null
  const keep = new Set(audiences)
  const out = new Map<string, Map<string, number>>()
  for (const r of rows) {
    if (!keep.has(r.audience) || !r.platform_mix) continue
    const mix = out.get(String(r.theme_id)) ?? new Map<string, number>()
    for (const [platform, v] of Object.entries(r.platform_mix)) {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) mix.set(platform, (mix.get(platform) ?? 0) + n)
    }
    out.set(String(r.theme_id), mix)
  }
  return out
}

/** A platform mix as a card's rows, the most videos first. Null where the
 *  read did not come back; an empty list where it came back with none. */
export function platformsOf(mixes: Map<string, Map<string, number>> | null | undefined, id: string): { platform: string; videos: number }[] | null {
  if (!mixes) return null
  return [...(mixes.get(id) ?? new Map<string, number>()).entries()]
    .map(([platform, videos]) => ({ platform, videos }))
    .sort((a, b) => b.videos - a.videos || a.platform.localeCompare(b.platform))
}

/** A persona as the stored profile holds it, defensively (the row is jsonb a
 *  pass writes). */
export interface StoredPersona {
  key: string
  name: string
  registryIds: string[]
}

export function storedPersonas(raw: unknown): StoredPersona[] {
  if (!Array.isArray(raw)) return []
  const out: StoredPersona[] = []
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue
    const o = p as Record<string, unknown>
    if (typeof o.name !== 'string' || !o.name) continue
    const key = typeof o.key === 'string' && o.key ? o.key : o.name
    const ids = Array.isArray(o.registryIds) ? o.registryIds.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
    out.push({ key, name: o.name, registryIds: [...new Set(ids)] })
  }
  return out
}

/** The groups whose profile cites each conversation, in the profile's order.
 *  Names only (decision 5): no video is assigned to a group, so "15 of 23"
 *  cannot be counted. */
export function groupsByConversation(personas: readonly StoredPersona[]): Map<string, GroupName[]> {
  const out = new Map<string, GroupName[]>()
  for (const p of personas) {
    for (const id of p.registryIds) out.set(id, [...(out.get(id) ?? []), { key: p.key, name: p.name }])
  }
  return out
}

/** How a video opens, as the "How it opens" chart names it. */
const OPENING_WORDS: Readonly<Record<string, string>> = {
  question: 'A question',
  statistic: 'A statistic',
  'bold-claim': 'A bold claim',
  'personal-story': 'A personal story',
  'before-after': 'A before and after',
  controversy: 'An argument',
  demonstration: 'Showing it',
  listicle: 'A list',
  'trend-riding': 'Riding what is current',
  'shock-value': 'A shock',
}

export function openingLabel(hook: string): string {
  return OPENING_WORDS[hook] ?? workedLabel(hook)
}

/** "Open with a question", "Open by showing it". */
export function openingChip(hook: string): string {
  if (hook === 'demonstration') return 'Open by showing it'
  const words = openingLabel(hook)
  return `Open with ${words.charAt(0).toLowerCase()}${words.slice(1)}`
}

/** A format's name ("Tutorial", "Behind the scenes"). */
export function formatLabel(format: string): string {
  return workedLabel(format)
}

export function recipe(key: string | null, multiple: number | null, kind: 'format' | 'opening'): Recipe | null {
  if (!key) return null
  return {
    key,
    label: kind === 'format' ? formatLabel(key) : openingChip(key),
    name: kind === 'format' ? formatLabel(key) : openingLabel(key),
    multiple: multiple != null && Number.isFinite(multiple) && multiple > 0 ? round1(multiple) : null,
  }
}

/** Whether your posts this month touched on a conversation. */
/**
 * The first month of your own posts the "already touched" test reads: the
 * reading month and the two before it (`POST_IDEA_OWNED_MONTHS`). The step's
 * `ownedFrom` (lib/post-ideas/step.ts) is this rule; it is restated here over
 * T13's constant rather than imported because step.ts brings the step's
 * writer, its alert mail and its model client into a page module.
 */
export function ideaOwnedFrom(month: string): string {
  let m = monthStartOf(month)
  for (let i = 1; i < POST_IDEA_OWNED_MONTHS; i++) m = prevMonth(m)
  return m
}

/**
 * Whether your posts touched on a conversation: the step's own test
 * (lib/post-ideas/step.ts on depth/t13-ideas: `questionTouch({ labels:
 * [label], posts })` over `ownedPosts` from `ownedFrom(month)` to the week's
 * end), so the page and the step agree. `owned` is that window's posts.
 */
export function ownTouch(labels: readonly string[], owned: OwnedPosts | null, since: string): OwnTouch {
  if (!owned) return { state: 'unread', touched: 0, posts: 0, since }
  if (owned.total === 0) return { state: 'no_posts', touched: 0, posts: 0, since }
  const posts: QuestionPost[] = owned.posts.map((p) => ({ id: p.id, topics: p.topics, upload_date: p.upload_date, video_url: p.video_url }))
  const t = questionTouch({ labels: labels.map((l) => l.trim()).filter(Boolean), posts })
  return { state: t.state === 'touched' ? 'touched' : 'none', touched: t.matched.length, posts: owned.total, since }
}

/** Where the one read of your posts ends: the later of the month's end and
 *  the week's (a week that starts in one month and ends in the next is
 *  restated against the first, and the touch test reads to the week's end,
 *  as the step does). */
export function ownedTo(month: Pick<ContentMonth, 'month'>, week: Pick<ContentWeek, 'to'> | null): string {
  const end = `${nextMonth(month.month)}T00:00:00.000Z`
  return week && Date.parse(week.to) > Date.parse(end) ? week.to : end
}

/** The posts the touch test reads, out of a wider read: from `ideaOwnedFrom`
 *  to the week's end, exclusive (the step's `{ from: ownedFrom(month), to:
 *  window.to }`). */
export function touchPosts(owned: OwnedPosts | null, month: string, to: string): OwnedPosts | null {
  return owned ? summariseOwnedPosts(owned.posts, { from: ideaOwnedFrom(month), to }) : null
}

/** The sub-questions counted off their ids, the most
 *  asked first. */
export function subquestionRows(idea: Pick<PostIdeaRow, 'subquestions'>): IdeaSubquestion[] {
  return idea.subquestions
    .map((s) => ({ label: s.label, ...subquestionCounts(s) }))
    .filter((s) => s.label.trim() && (s.videos > 0 || s.comments > 0))
    .sort((a, b) => b.videos - a.videos || b.comments - a.comments || a.label.localeCompare(b.label))
}

/** "30 to 45 seconds", "45 seconds", "1:30 to 2:45 minutes" past ninety
 *  seconds. */
export function lengthWords(len: Pick<PostIdeaLength, 'fromSeconds' | 'toSeconds'>): string {
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  if (len.toSeconds > 90) {
    return len.fromSeconds === len.toSeconds ? `${mmss(len.toSeconds)} minutes` : `${mmss(len.fromSeconds)} to ${mmss(len.toSeconds)} minutes`
  }
  return len.fromSeconds === len.toSeconds ? `${len.toSeconds} seconds` : `${len.fromSeconds} to ${len.toSeconds} seconds`
}

// ---- which week the ideas are ---------------------------------------------------------

/** "the week of 28 Sep" for a week, else its days ("13 Sep to 3 Oct"). */
export function weekPhrase(week: Pick<ContentWeek, 'isWeek' | 'first' | 'last'>): string {
  return week.isWeek ? `the week of ${shortDate(`${week.first}T00:00:00.000Z`)}` : daysLabel(week.first, week.last)
}

/** The days the ideas read, named, and their whole weeks. Null where the
 *  stored window is not a window. Pure. */
export function ideasReadOf(idea: Pick<PostIdeaRow, 'read_start' | 'read_end'>): IdeasRead | null {
  const covered = coveredDays({ from: idea.read_start, to: idea.read_end })
  if (!covered) return null
  const from = Date.parse(idea.read_start)
  const span = Date.parse(idea.read_end) - from
  const count = Math.round(span / (7 * DAY_MS))
  // Whole weeks to the minute: the step stores exactly 28 days.
  const whole = count >= 2 && Math.abs(span - count * 7 * DAY_MS) < 60_000
  const weeks = whole
    ? Array.from({ length: count }, (_, i) => {
        const w = { from: new Date(from + i * 7 * DAY_MS).toISOString(), to: i === count - 1 ? idea.read_end : new Date(from + (i + 1) * 7 * DAY_MS).toISOString() }
        return { ...w, label: shortDate(`${coveredDays(w)!.first}T00:00:00.000Z`) }
      })
    : null
  return { from: idea.read_start, to: idea.read_end, label: daysLabel(covered.first, covered.last), weeks }
}

/** "From questions asked 14 Sep to 11 Oct": the days the ideas read, as the
 *  page, the tile and the idea's page print them. */
export const askedPhrase = (read: Pick<IdeasRead, 'label'>): string => `From questions asked ${read.label}`

/** The ideas' own week, against the page's, the days they read, and the
 *  month their figures are printed beside. */
export function ideasWeekOf(ideas: readonly PostIdeaRow[], page: ContentWeek | null): IdeasWeek | null {
  const idea = ideas[0]
  if (!idea) return null
  const w = contentWeek(idea.run_id, { from: idea.window_start, to: idea.window_end })
  const read = ideasReadOf(idea)
  if (!w || !read) return null
  const current = page == null || page.runId === idea.run_id
  // The page's month is its week's (`contentMonth`), and a current set's run
  // window IS the page's week; an older set is beside its own read window's.
  const r = readingMonthOf(current ? { from: w.from, to: w.to } : { from: read.from, to: read.to })
  const month: ContentMonth = { month: r.month, complete: r.complete, from: `${r.month}T00:00:00.000Z`, to: r.to }
  return { runId: idea.run_id, label: w.label, phrase: weekPhrase(w), current, read, month }
}

/** Are the ideas too old to print: written for a week that ended more than
 *  `IDEAS_STALE_DAYS` before the page's week did? */
export function ideasStale(ideas: readonly PostIdeaRow[], page: ContentWeek | null): boolean {
  const idea = ideas[0]
  if (!idea || !page) return false
  const gap = Date.parse(page.to) - Date.parse(idea.window_end)
  return Number.isFinite(gap) && gap > IDEAS_STALE_DAYS * 86_400_000
}

/** "No new ideas this week. These are from the week of 28 Sep." */
export const olderIdeasLine = (week: Pick<IdeasWeek, 'phrase'>): string => `No new ideas this week. These are from ${week.phrase}.`

/** A post or a video's title: there is no title column, so the opening
 *  where the classifier read one, else the caption's first line, hashtags and
 *  links dropped, at most 80 characters. */
export function postTitle(v: { hook_text?: string | null; caption?: string | null }): string | null {
  const clean = (s: string) => s
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const hook = clean(v.hook_text ?? '')
  const line = clean((v.caption ?? '').split(/\r?\n/).find((l) => clean(l).length > 0) ?? '')
  const full = hook.length >= 8 ? hook : line
  if (!full) return null
  // The first sentence, where it is long enough to name the post.
  const first = full.split(/(?<=[.!?])\s+/)[0] ?? full
  const text = first.length >= 8 ? first : full
  return text.length > 80 ? `${text.slice(0, 79).replace(/\s+\S*$/, '')}…` : text
}

/** A video's rate, where it is comparable (Reddit's is capped: formats.ts). */
const rateOf = (v: { platform: string; engagement_rate: number | string | null }): number | null => {
  if (ENGAGEMENT_EXCLUDED.includes(v.platform)) return null
  const e = Number(v.engagement_rate)
  return Number.isFinite(e) && e > 0 ? e : null
}

/** The market's typical video this month: the category's median rate. */
export function typicalRate(playbook: PlaybookBlock | null): number | null {
  const side = playbook?.formats.sides.find((s) => s.audience === INDUSTRY_AUDIENCE)
  const v = side?.median.value ?? null
  return v != null && v > 0 ? v : null
}

export interface PanelVideoRow {
  id: string
  video_id: string
  platform: string
  video_url: string | null
  account_name: string | null
  caption: string | null
  hook_text: string | null
  classified_type: string | null
  hook_style: string | null
  engagement_rate: number | string | null
  source: string | null
  is_client: boolean | null
  views: number | string | null
}

/** The market's videos where the question came up, best response first: own
 *  posts out, a video with a multiple before one without, then by views. */
export function marketVideoCards(rows: readonly PanelVideoRow[], typical: number | null, n = PANEL_VIDEOS): MarketVideoCard[] {
  const seen = new Set<string>()
  return rows
    .filter((v) => !isOwnedPost(v) && !seen.has(v.id) && seen.add(v.id))
    .map((v) => {
      const rate = rateOf(v)
      return {
        card: {
          id: v.id,
          title: postTitle(v),
          account: v.account_name,
          platform: v.platform,
          format: v.classified_type ? formatLabel(v.classified_type) : null,
          opening: v.hook_style ? openingLabel(v.hook_style) : null,
          multiple: rate != null && typical != null ? round1(rate / typical) : null,
          url: v.video_url,
        },
        views: Number(v.views) || 0,
      }
    })
    .sort((a, b) => (b.card.multiple ?? -1) - (a.card.multiple ?? -1) || b.views - a.views || a.card.id.localeCompare(b.card.id))
    .slice(0, n)
    .map((x) => x.card)
}

/** Words to borrow: Pass A's own short phrases off the idea's comments, the
 *  readable ones, one wording once. */
export function wordsToBorrow(samples: readonly { id: string; phrase: string | null }[], n = WORDS_SHOWN): { ref: string; text: string }[] {
  const seen = new Set<string>()
  const out: { ref: string; text: string }[] = []
  for (const s of samples) {
    const text = (s.phrase ?? '').replace(/\s+/g, ' ').trim().replace(/^["“”']+|["“”']+$/g, '')
    if (text.length < 6 || text.length > WORD_MAX_CHARS) continue
    if (!readableQuote({ text })) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ref: quoteRef.phrase(s.id), text })
    if (out.length >= n) break
  }
  return out
}

// ---- What works ---------------------------------------------------------------------

/** One chart's rows: the market's values with a multiple, the most made first
 *  (the six the board draws, plus any you use that the six leave out), then
 *  drawn best response first. */
export function worksRows(playbook: PlaybookBlock, key: 'formats' | 'hooks', label: (k: string) => string, n = WORKS_ROWS): WorksRow[] {
  const matrix = playbook[key]
  const market = matrix.sides.find((s) => s.audience === INDUSTRY_AUDIENCE)
  const own = matrix.sides.find((s) => s.audience === CLIENT_AUDIENCE)
  if (!market) return []
  const rated = Object.values(market.byKey).filter((r): r is NonNullable<typeof r> => r != null && r.multiple != null)
  // `byKey` holds the matrix's keys; read the reading's whole set through
  // them, count-ordered as the matrix keeps them.
  const byCount = [...rated].sort((a, b) => b.value.k - a.value.k || a.key.localeCompare(b.key))
  const top = byCount.slice(0, n)
  const yoursOf = (k: string) => own?.byKey[k]?.value.k ?? 0
  for (const r of byCount.slice(n)) if (yoursOf(r.key) > 0 && top.length < n + 2) top.push(r)
  return top
    .map((r) => ({ key: r.key, label: label(r.key), share: r.pct, multiple: r.multiple as number, yours: yoursOf(r.key) }))
    .sort((a, b) => b.multiple - a.multiple || a.label.localeCompare(b.label))
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
/** "a" or "an" before a label ("an educational video", "a how-to video"). */
export const article = (word: string): 'a' | 'an' => (/^[aeiou]/i.test(word) ? 'an' : 'a')
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/**
 * The sentence about your mix, written by code from the two charts: what you
 * made most and how that kind draws, the kind that draws best and how many of
 * yours it was, and how most of yours open. Numbers are figures; nothing here
 * says anything moved.
 */
export function mixSentence(input: { formats: readonly WorksRow[]; openings: readonly WorksRow[]; posts: number; unclassified: number; month: string; complete: boolean }): SentencePart[] | null {
  const { formats, openings, posts } = input
  const when = input.complete ? `in ${longMonth(input.month)}` : `in ${longMonth(input.month)} so far`
  if (posts === 0) return [`You published nothing of your own ${when}.`]
  const out: SentencePart[] = []
  const gap = () => (out.length ? ' ' : '')
  const videos = (label: string) => `${lower(label)} videos`
  const mostMade = [...formats].filter((r) => r.yours > 0).sort((a, b) => b.yours - a.yours || b.multiple - a.multiple)[0]
  if (mostMade) {
    const one = `${article(mostMade.label)} ${lower(mostMade.label)} video`
    out.push({ figure: `${fmtInt(mostMade.yours)} of your ${fmtInt(posts)}` }, ` posts ${when} ${mostMade.yours === 1 ? `was ${one}` : `were ${videos(mostMade.label)}`}, which draw `, { figure: fmtMultiple(mostMade.multiple) }, ' a typical video.')
  }
  const best = formats[0]
  if (best && best.key !== mostMade?.key) {
    const made: SentencePart[] = best.yours === 0 ? [', and none of yours were.'] : best.yours === 1 ? [', and you made one.'] : [', and you made ', { figure: fmtInt(best.yours) }, '.']
    out.push(`${gap()}${videos(best.label).replace(/^./, (c) => c.toUpperCase())} draw `, { figure: fmtMultiple(best.multiple) }, ...made)
  }
  const opens = [...openings].filter((r) => r.yours > 0).sort((a, b) => b.yours - a.yours || b.multiple - a.multiple)[0]
  if (opens) {
    out.push(
      `${gap()}${opens.yours * 2 > posts ? 'Most of yours open with' : 'The opening you used most is'} ${lower(opens.label)} (`,
      { figure: `${fmtInt(opens.yours)} of ${fmtInt(posts)}` },
      '), which draws ', { figure: fmtMultiple(opens.multiple) }, '.',
    )
  }
  if (input.unclassified > 0) {
    out.push(gap(), { figure: fmtInt(input.unclassified) }, ` of your posts ${plural(input.unclassified, 'has', 'have')} no format read yet.`)
  }
  return out.length ? out : null
}

/** "Read from 412 of the 640 market videos published in October so far that
 *  have a format…": the classified n beside the published one (D6). */
export function worksBasis(of: number, published: number, month: Pick<ContentMonth, 'month' | 'complete'>): SentencePart[] {
  return [
    'Read from ', { figure: `${fmtInt(of)} of ${fmtInt(published)}` },
    ` market videos published ${monthWords(month)} that have a format. Response is each kind’s median against the market’s median video; Reddit is left out of response.`,
  ]
}

export function worksBlock(input: { playbook: PlaybookBlock | null; owned: OwnedPosts | null; month: ContentMonth }): WorksBlock {
  const { playbook, owned, month } = input
  const base = { month: month.month, complete: month.complete, formats: [], openings: [], posts: owned?.total ?? 0, sentence: null, basis: null }
  if (!playbook) return { ...base, unread: 'What works could not be read just now.' }
  const formats = worksRows(playbook, 'formats', formatLabel)
  const openings = worksRows(playbook, 'hooks', openingLabel)
  const market = playbook.formats.sides.find((s) => s.audience === INDUSTRY_AUDIENCE)
  if (formats.length === 0 && openings.length === 0) {
    return { ...base, unread: playbook.unread ?? `Too few of the market's videos published ${monthWords(month)} have a format and a response figure to compare yet.` }
  }
  const unclassified = (owned?.posts ?? []).filter((p) => !p.classified_type).length
  return {
    ...base,
    formats,
    openings,
    sentence: mixSentence({ formats, openings, posts: owned?.total ?? 0, unclassified, month: month.month, complete: month.complete }),
    basis: market ? worksBasis(market.of, market.published, month) : null,
    unread: null,
  }
}

// ---- Your posts ----------------------------------------------------------------------

export function postRow(p: OwnedPost, typical: number | null): PostRow {
  const rate = rateOf(p)
  return {
    id: p.id,
    date: p.upload_date,
    platform: p.platform,
    title: postTitle(p),
    format: p.classified_type ? formatLabel(p.classified_type) : null,
    opening: p.hook_style ? openingLabel(p.hook_style) : null,
    multiple: rate != null && typical != null ? round1(rate / typical) : null,
    url: p.video_url,
  }
}

/** Response floor: a typical post needs this many rated posts (the format
 *  reading's own floor, ENGAGEMENT_MIN_VIDEOS). */
export const OWN_RESPONSE_MIN = 3

export function postsBlock(input: { owned: OwnedPosts | null; typical: number | null; month: ContentMonth }): PostsBlock {
  const { owned, typical, month } = input
  const base = { month: month.month, complete: month.complete }
  if (!owned) return { ...base, total: 0, byPlatform: [], response: null, rated: 0, marketTypical: typical != null, best: null, rows: [], unread: 'Your posts could not be read just now.' }
  const rates = owned.posts.map(rateOf).filter((r): r is number => r != null)
  const own = median(rates)
  const rows = owned.posts.map((p) => postRow(p, typical))
  const best = [...rows].filter((r) => r.multiple != null).sort((a, b) => (b.multiple ?? 0) - (a.multiple ?? 0) || b.date.localeCompare(a.date))[0] ?? null
  return {
    ...base,
    total: owned.total,
    byPlatform: owned.byPlatform,
    response: own != null && typical != null && rates.length >= OWN_RESPONSE_MIN ? { multiple: round1(own / typical), rated: rates.length } : null,
    rated: rates.length,
    marketTypical: typical != null,
    best,
    rows,
    unread: null,
  }
}

// ---- Worth a reply ------------------------------------------------------------------

export const REPLIES_NO_WEEK = 'No update has covered a week yet, so there is no reply list.'
/** Also asked (and the ideas row's empty cards) before any update has
 *  covered a week. */
export const ASKED_NO_WEEK = 'No update has covered a week yet.'

/** The days the reply list is picked from: the run's week, or the month it is
 *  restated against, and never past that month's end (a week that runs into
 *  the next month lists only the month it names). */
export function repliesWindowOf(period: ContentPeriod, week: ContentWeek | null, month: ContentMonth): DaysWindow | null {
  if (period === 'month') return { from: month.from, to: month.to, phrase: monthWords(month) }
  return week ? { from: week.from, to: week.to, phrase: daysPhrase(week.first, week.last) } : null
}

export function repliesView(block: RepliesBlock | null, window: DaysWindow | null): RepliesView {
  const empty = { window, rows: [], flagged: [], total: 0, counts: { buying: 0, question: 0, objection: 0, flagged: 0 }, under: { own: 0, about: 0, elsewhere: 0 } }
  if (!block) return { ...empty, unread: 'The comments worth a reply could not be read just now.' }
  if (block.unread) return { ...empty, unread: block.unread }
  const all = [...block.rows, ...block.flagged]
  const count = (i: string) => block.rows.filter((r) => r.intent === i).length
  return {
    window,
    rows: block.rows,
    flagged: block.flagged,
    total: all.length,
    counts: { buying: count('buying'), question: count('question'), objection: count('objection'), flagged: block.flagged.length },
    under: {
      own: all.filter((r) => r.under === 'own_post').length,
      about: all.filter((r) => r.under === 'names_you').length,
      elsewhere: all.filter((r) => r.under !== 'own_post' && r.under !== 'names_you').length,
    },
    unread: null,
  }
}

// ---- Also asked ---------------------------------------------------------------------

export interface QuestionConversation {
  registryId: string
  label: string
}

export interface AskedInput {
  period: ContentPeriod
  questions: readonly QuestionConversation[] | null
  /** Each conversation's videos over the week and over the month; the
   *  period ranks by its own. */
  counts: { week: Map<string, number> | null; month: Map<string, number> | null }
  weeks: (Map<string, number> | null)[] | null
  exclude: ReadonlySet<string>
  groups: Map<string, GroupName[]>
  subjects: Map<string, string | null>
  /** Your posts the touch test reads (`touchPosts`) and the month they are
   *  read from. */
  owned: OwnedPosts | null
  since: string
  expanded: boolean
}

/** The also-asked table, as the page draws it beside ideas that fill all
 *  three cards. */
export function askedBlock(input: AskedInput): AskedBlock {
  return askedWithLead({ ...input, lead: 0 }).asked
}

/**
 * The also-asked list, its first `lead` rows set aside for the ideas row's
 * empty cards (`IdeasBlock.questions`) and the table holding the rest: the
 * cards are the top of the list and the table goes on after them, so no
 * question prints twice.
 */
export function askedWithLead(input: AskedInput & { lead: number }): { asked: AskedBlock; lead: AskedRow[] } {
  const { period, questions } = input
  const counts = period === 'month' ? input.counts.month : input.counts.week
  const posts = input.owned ? input.owned.total : null
  const base = { period, rows: [], total: 0, touched: 0, since: input.since, posts, expanded: input.expanded }
  if (!questions || !counts) return { asked: { ...base, unread: 'The questions people asked could not be read just now.' }, lead: [] }
  const asked = questions
    .filter((q) => !input.exclude.has(q.registryId) && (counts.get(q.registryId) ?? 0) > 0)
    .sort((a, b) => (counts.get(b.registryId) ?? 0) - (counts.get(a.registryId) ?? 0) || a.label.localeCompare(b.label))
  let touched = 0
  const open = asked.filter((q) => {
    const t = ownTouch([q.label], input.owned, input.since)
    if (t.state === 'touched') { touched += 1; return false }
    return true
  })
  const lead = open.slice(0, Math.max(0, input.lead))
  const rest = open.slice(lead.length)
  const shown = input.expanded ? rest : rest.slice(0, ASKED_SHOWN)
  const weeksOf = (id: string): number[] | null => {
    if (!input.weeks || input.weeks.some((w) => w == null)) return null
    return input.weeks.map((w) => w!.get(id) ?? 0)
  }
  const row = (q: QuestionConversation): AskedRow => ({
    registryId: q.registryId,
    label: q.label,
    groups: (input.groups.get(q.registryId) ?? []).slice(0, GROUPS_SHOWN),
    subject: input.subjects.get(q.registryId) ?? null,
    week: input.counts.week ? input.counts.week.get(q.registryId) ?? 0 : null,
    month: input.counts.month ? input.counts.month.get(q.registryId) ?? 0 : null,
    weeks: weeksOf(q.registryId),
  })
  return {
    asked: { ...base, rows: shown.map(row), total: rest.length, touched, unread: null },
    lead: lead.map(row),
  }
}

// ---- What to post next --------------------------------------------------------------

/** A flag the anomaly check stored for a conversation this run. */
export interface FlagRowIn {
  object_kind: string
  object_id: string
  label: string
  denominator: string
  week_k: number
  week_n: number
  baseline_k: number
  baseline_n: number
  change_pts: number | string
  band_pts: number | string
}

/** The anomaly check's flag as a week verdict (`FlagChip` prints "Unusual
 *  this week" off it, and nothing else does). Only flagged rows are stored. */
export function flagVerdict(f: FlagRowIn, week: { from: string; to: string }): Verdict {
  return {
    objectKind: 'theme',
    objectId: f.object_id,
    objectLabel: f.label,
    audience: f.denominator,
    window: { kind: 'week', from: week.from, to: week.to },
    value: { k: Number(f.week_k), n: Number(f.week_n) },
    baseline: { k: Number(f.baseline_k), n: Number(f.baseline_n) },
    changePts: Number(f.change_pts),
    bandPts: Number(f.band_pts),
    state: 'moved',
    flags: [],
  }
}

/** The week read's "new this week": a level carrying the reader flag. */
export function newVerdict(registryId: string, label: string, month: ContentMonth, value: Counted): Verdict {
  return bandVerdict({
    objectKind: 'theme', objectId: registryId, objectLabel: label, audience: 'market',
    window: { kind: 'month', from: month.from.slice(0, 10), to: nextMonth(month.month) }, value, flags: ['new'],
  })
}

export function ideaCard(input: {
  idea: PostIdeaRow
  label: string | null
  read: Counted | null
  month: Counted | null
  weeks: { label: string; count: number }[] | null
  flag: Verdict | null
  groups: GroupName[]
  /** Your posts the touch test reads (`touchPosts`) and the month they are
   *  read from. */
  owned: OwnedPosts | null
  since: string
  subject: { id: string; name: string } | null
  medical: boolean
}): IdeaCard {
  const { idea } = input
  return {
    id: idea.id,
    rank: idea.rank,
    registryId: idea.registry_id,
    title: idea.title,
    label: input.label,
    read: input.read,
    month: input.month,
    weeks: input.weeks,
    flag: input.flag,
    groups: input.groups.slice(0, GROUPS_SHOWN),
    own: ownTouch([input.label ?? idea.title], input.owned, input.since),
    format: recipe(idea.format, idea.format_multiple, 'format'),
    opening: recipe(idea.opening, idea.opening_multiple, 'opening'),
    subject: input.subject,
    medical: input.medical,
  }
}

export const agentHref = (text: string): string => `/dashboard/agent?ask=${encodeURIComponent(text)}`
/** A conversation's page on Market (17 Oct: a page, never a panel). */
export const conversationHref = (registryId: string): string => marketConversationPath(registryId)
export { voicesGroupPath as groupHref } from './voices-address'

// ---- the reads ----------------------------------------------------------------------

const fail = (what: string, e: unknown): Error => new Error(`content.${what}: ${(e as { message?: string })?.message ?? String(e)}`)

/** Log and answer null: one block's read failing costs that block only. */
export async function soft<T>(what: string, p: PromiseLike<T> | (() => PromiseLike<T>)): Promise<T | null> {
  try {
    return await (typeof p === 'function' ? p() : p)
  } catch (e) {
    console.error(`[pages] content.${what}: ${(e as { message?: string })?.message ?? String(e)}`)
    return null
  }
}

/** The ideas, and whether the table is there at all (`loadPostIdeas` answers
 *  [] for both; one probe tells them apart, only when it does). */
export async function readIdeas(db: SupabaseClient, clientId: string): Promise<{ state: IdeasState; rows: PostIdeaRow[] }> {
  // Switched off for this workspace (T13's switch, lib/config.ts): no read at
  // all, and no stored idea prints, older ones included.
  if (!postIdeasEnabled(clientId)) return { state: 'not_on', rows: [] }
  const rows = await loadPostIdeas(db, clientId)
  if (rows.length > 0) return { state: 'ready', rows }
  const probe = await db.from(TABLE_POST_IDEAS).select('run_id').eq('client_id', clientId).limit(1)
  if (probe.error) {
    if (isMissingPostIdeas(probe.error)) return { state: 'not_on', rows: [] }
    throw fail('ideasProbe', probe.error)
  }
  return { state: 'none', rows: [] }
}

export async function readPersonas(db: SupabaseClient, clientId: string): Promise<StoredPersona[]> {
  const res = await db.from('consumer_profiles').select('personas, run_date')
    .eq('client_id', clientId).order('run_date', { ascending: false }).limit(1).maybeSingle()
  if (res.error) throw fail('personas', res.error)
  return storedPersonas((res.data as { personas?: unknown } | null)?.personas)
}

export async function readBrand(db: SupabaseClient, clientId: string): Promise<string> {
  const res = await db.from('clients').select('company_name').eq('id', clientId).maybeSingle()
  if (res.error) throw fail('brand', res.error)
  return ((res.data as { company_name?: string | null } | null)?.company_name ?? '').trim() || 'You'
}

/** The run's question conversations: the run's observations (the run's own
 *  clustering), category `question`. */
export async function readQuestions(db: SupabaseClient, clientId: string, runId: string): Promise<QuestionConversation[]> {
  const rows = await selectAll<{ theme_id: string; label: string | null }>(() =>
    db.from('theme_observations').select('theme_id, label')
      .eq('client_id', clientId).eq('run_id', runId).eq('category', 'question').order('theme_id'))
  return rows.filter((r) => r.label).map((r) => ({ registryId: String(r.theme_id), label: String(r.label) }))
}

/** Labels for conversations the question read did not name (an idea whose
 *  conversation the run filed under another kind). */
export async function readLabels(db: SupabaseClient, clientId: string, runId: string, ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const res = await db.from('theme_observations').select('theme_id, label')
    .eq('client_id', clientId).eq('run_id', runId).in('theme_id', [...ids])
  if (res.error) throw fail('labels', res.error)
  return new Map(((res.data ?? []) as { theme_id: string; label: string | null }[]).filter((r) => r.label).map((r) => [String(r.theme_id), String(r.label)]))
}

/** The run's flagged conversations, by the rule the weekly email freezes
 *  (`weekFlagRows`, lib/pages/week.ts): none where the check raised nothing,
 *  and none printed where it says it flagged and the flags cannot be read. */
export async function readFlags(db: SupabaseClient, clientId: string, runId: string): Promise<FlagRowIn[]> {
  const [check, flags] = await Promise.all([loadCheckStrict(db, clientId, runId), loadFlagsStrict(db, clientId, runId)])
  return (weekFlagRows(check, flags) ?? []).filter((f) => f.object_kind === 'theme')
}

/** Each shown conversation's subject, by Market's rule (`placeSubject` over
 *  `loadSubjectPlacement`, lib/pages/subject-place.ts: a ready subject wins,
 *  one whose check has not passed, open or failed, only where no ready one
 *  takes it), on the conversation's member insights this run. The one rule
 *  every surface names a conversation's subject by, so a conversation names
 *  the same subject here as on Market. A name only: Content prints no
 *  figure of the subject's own (ruling U6). */
export async function readSubjects(handle: Scope['reading'], runId: string, ids: readonly string[]): Promise<Map<string, { id: string; name: string } | null>> {
  if (ids.length === 0) return new Map()
  const { client, clientId } = handle
  const [obs, placement] = await Promise.all([
    selectAll<{ theme_id: string; member_insight_ids: string[] | null }>(() =>
      client.from('theme_observations').select('theme_id, member_insight_ids')
        .eq('client_id', clientId).eq('run_id', runId).in('theme_id', [...ids]).order('theme_id')),
    loadSubjectPlacement(client, clientId),
  ])
  const members = new Map(obs.map((o) => [String(o.theme_id), (o.member_insight_ids ?? []).map(String)]))
  return placeConversations(new Map(ids.map((id) => [id, members.get(id) ?? []])), placement.placed)
}

export const PANEL_VIDEO_COLUMNS = 'id, video_id, platform, video_url, account_name, caption, hook_text, classified_type, hook_style, engagement_rate, source, is_client, views'

/** The idea's videos. A sub-question's `videoIds` are `videos.id` (T13's
 *  `IdeaComment.videoId`, lib/post-ideas/select.ts), its `commentIds`
 *  `comments.id`. */
export async function readPanelVideos(db: SupabaseClient, clientId: string, ids: readonly string[]): Promise<PanelVideoRow[]> {
  const parts = await Promise.all(chunk([...ids], UUID_IN_CHUNK).map((part) =>
    selectAll<PanelVideoRow>(() => db.from('videos').select(PANEL_VIDEO_COLUMNS).eq('client_id', clientId).in('id', part).order('id'))))
  return parts.flat()
}

export async function readWords(db: SupabaseClient, clientId: string, commentIds: readonly string[]): Promise<{ id: string; phrase: string | null }[]> {
  if (commentIds.length === 0) return []
  const parts = await Promise.all(chunk([...commentIds], UUID_IN_CHUNK).map(async (part) => {
    const res = await db.from('language_samples_current').select('id, phrase, comment_id').eq('client_id', clientId).in('comment_id', part)
    if (res.error) throw fail('words', res.error)
    return (res.data ?? []) as { id: string; phrase: string | null }[]
  }))
  return parts.flat().sort((a, b) => a.id.localeCompare(b.id))
}

/** The page's week: the newest of the published week read's run and the
 *  ideas' run (a thin week stores no ideas, and a week read that is not ready
 *  publishes none, so either can be the older). Its window is the page's
 *  week, its run the clustering the week's counts are read under. */
export function anchorOf(ideas: readonly PostIdeaRow[], published: PublishedWeekRead | null): ContentWeek | null {
  const idea = ideas[0]
  const fromIdea = idea ? contentWeek(idea.run_id, { from: idea.window_start, to: idea.window_end }) : null
  const w = published?.data?.window
  const fromRead = published && w?.from && w?.to ? contentWeek(published.runId, { from: w.from, to: w.to }) : null
  if (!fromIdea) return fromRead
  if (!fromRead) return fromIdea
  return Date.parse(fromIdea.to) > Date.parse(fromRead.to) ? fromIdea : fromRead
}

export interface WeekReads {
  audiences: string[]
  market: { week: number | null; month: number | null }
  themes: { week: Map<string, number> | null; month: Map<string, number> | null; weeks: (Map<string, number> | null)[] | null }
  /** Every theme's comments over the week and the month, and its videos by
   *  platform over each (the ideas row's question cards). */
  comments: { week: Map<string, number> | null; month: Map<string, number> | null }
  mixes: { week: Map<string, Map<string, number>> | null; month: Map<string, Map<string, number>> | null }
  weekLabels: string[] | null
  /** Over the days the ideas read (`IdeasRead`): the market's videos, every
   *  theme's, and every theme's in each of its weeks; and over the month
   *  their figures are printed beside (`IdeasWeek.month`). Null where there
   *  are no ideas. */
  ideas: {
    market: number | null
    themes: Map<string, number> | null
    weeks: (Map<string, number> | null)[] | null
    month: { market: number | null; themes: Map<string, number> | null }
    /** Every theme's videos by platform over the days the ideas read (an
     *  idea's page: "Where it came up"), from the same read. */
    mix: Map<string, Map<string, number>> | null
  } | null
}

/** The window readings the page states: the market's videos this week and
 *  this month, and every theme's over the week, the month and the two weeks
 *  before (three bare counts); and, where there are ideas, over the days
 *  they read and each of its weeks (`ideas`). All under the anchor run's
 *  clustering, each an arbitrary window read (never a sum of weeks).
 *  `week: false` leaves the page's week unread (the Dashboard's tile prints
 *  none). */
export async function readWindows(scope: Scope, week: ContentWeek | null, month: ContentMonth, audiences: string[], opts: { trend?: boolean; week?: boolean; ideas?: Pick<IdeasWeek, 'read' | 'month'> | null } = {}): Promise<WeekReads> {
  const { client, clientId } = scope.reading
  const read = (from: string, to: string, runId: string | null) => loadWindowReading(client, clientId, { from, to, audiences, runId })
  const runId = week?.runId ?? null
  const weeks = week && opts.trend !== false && opts.week !== false ? threeWeeks(week) : null
  const ideas = opts.ideas?.read ?? null
  const ideaWeeks = ideas && opts.trend !== false ? ideas.weeks : null
  // The ideas' month: the page's where it is the same days (a current set),
  // read once; an older set's own month, read beside it.
  const ideasMonth = opts.ideas?.month ?? null
  const ownMonth = ideasMonth && (ideasMonth.from !== month.from || ideasMonth.to !== month.to) ? ideasMonth : null
  const [w, m, i, im, ...rest] = await Promise.all([
    week && opts.week !== false ? read(week.from, week.to, week.runId) : Promise.resolve(null),
    read(month.from, month.to, runId),
    ideas ? read(ideas.from, ideas.to, runId) : Promise.resolve(null),
    ownMonth ? read(ownMonth.from, ownMonth.to, runId) : Promise.resolve(null),
    ...(weeks ? weeks.slice(0, 2).map((x) => read(x.from, x.to, runId)) : []),
    ...(ideaWeeks ? ideaWeeks.map((x) => read(x.from, x.to, runId)) : []),
  ])
  const prior = weeks ? rest.slice(0, 2) : []
  const ideaSlices = ideaWeeks ? rest.slice(prior.length) : null
  const weekThemes = pooledThemeVideos(w?.themes ?? null, audiences)
  return {
    audiences,
    market: { week: pooledVideos(w?.denominators ?? null, audiences), month: pooledVideos(m.denominators, audiences) },
    themes: {
      week: weekThemes,
      month: pooledThemeVideos(m.themes, audiences),
      weeks: weeks ? [...prior.map((p) => pooledThemeVideos(p.themes, audiences)), weekThemes] : null,
    },
    comments: { week: pooledThemeComments(w?.themes ?? null, audiences), month: pooledThemeComments(m.themes, audiences) },
    mixes: { week: pooledThemeMix(w?.themes ?? null, audiences), month: pooledThemeMix(m.themes, audiences) },
    weekLabels: weeks ? weeks.map((x) => x.label) : null,
    ideas: i
      ? {
          market: pooledVideos(i.denominators, audiences),
          themes: pooledThemeVideos(i.themes, audiences),
          weeks: ideaSlices ? ideaSlices.map((p) => pooledThemeVideos(p.themes, audiences)) : null,
          month: { market: pooledVideos((im ?? m).denominators, audiences), themes: pooledThemeVideos((im ?? m).themes, audiences) },
          mix: pooledThemeMix(i.themes, audiences),
        }
      : null,
  }
}

/** An idea's weekly counts over the days its set read, oldest first, as bare
 *  counts: null unless every week was read. Pure. */
export function ideaWeeks(read: Pick<IdeasRead, 'weeks'> | null, series: readonly (Map<string, number> | null)[] | null | undefined, id: string): { label: string; count: number }[] | null {
  if (!read?.weeks || !series || series.length !== read.weeks.length || series.some((s) => s == null)) return null
  return read.weeks.map((w, i) => ({ label: w.label, count: series[i]!.get(id) ?? 0 }))
}

/** A theme's level over a window: null where either side was not read (a
 *  theme the read did not return is 0 only when the read itself came back). */
const counted = (themes: Map<string, number> | null | undefined, id: string, n: number | null): Counted | null =>
  themes && n != null && n > 0 ? { k: themes.get(id) ?? 0, n } : null

/**
 * The Content page.
 *
 * `scope.supabase` reads the tenant's own rows (the session client on the app
 * path); `scope.reading` the window readings, the published read and the
 * subjects (the service role, the tenant pinned by the session).
 */
export async function loadContentPage(scope: Scope, opts: { now?: Date } = {}): Promise<ContentPageData> {
  const db = scope.supabase as SupabaseClient
  const { clientId } = scope
  const admin = scope.reading.client
  const state = parseContentParams(scope.params)
  const now = opts.now ?? new Date()

  // ---- wave 1
  const [ideasRead, published, brand, personas, rivals] = await Promise.all([
    soft('ideas', readIdeas(db, clientId)),
    soft('published', loadPublishedWeekRead(admin, clientId)),
    soft('brand', readBrand(db, clientId)),
    soft('personas', readPersonas(db, clientId)),
    soft('rivals', loadTrackedRivals(db, clientId)),
  ])
  const week = anchorOf(ideasRead?.rows ?? [], published)
  // Ideas written for a week more than four weeks before the page's are not
  // printed: the step stores nothing for a thin week and tells nobody.
  const stale = ideasStale(ideasRead?.rows ?? [], week)
  const ideas = stale ? [] : ideasRead?.rows ?? []
  const ideasWeek = ideasWeekOf(ideas, week)
  const month = contentMonth(week, now)
  const audiences = marketAudiences(marketRivalAudiences(rivals ?? []))
  const groups = groupsByConversation(personas ?? [])
  const repliesWindow = repliesWindowOf(state.period, week, month)
  const since = ideaOwnedFrom(month.month)

  // ---- wave 2
  const [windows, questions, flags, ownedRead, playbook, replies] = await Promise.all([
    soft('windows', readWindows(scope, week, month, audiences, { ideas: ideasWeek })),
    week ? soft('questions', readQuestions(db, clientId, week.runId)) : Promise.resolve(null),
    week ? soft('flags', readFlags(db, clientId, week.runId)) : Promise.resolve([] as FlagRowIn[]),
    // ONE READ of your posts, from the touch test's first month to the end of
    // the page's month: the touch test's window and the month's are cut from it.
    soft('owned', ownedPosts({ supabase: db, clientId }, { from: since, to: ownedTo(month, week) })),
    soft('playbook', async () => buildPlaybook({ month: month.month, brand: brand ?? 'You', rival: null, videos: await loadPlaybookVideos(db, clientId, month.month), clientSide: 'owned' })),
    repliesWindow
      ? soft('replies', buildReplies({ supabase: db, clientId, runId: week?.runId ?? '', window: { from: repliesWindow.from, to: repliesWindow.to, basis: 'content' }, videos: Promise.resolve([]), gate: true }))
      : Promise.resolve(null),
  ])
  const owned = ownedRead ? summariseOwnedPosts(ownedRead.posts, { from: month.month, to: nextMonth(month.month) }) : null
  const touch = touchPosts(ownedRead, month.month, week?.to ?? now.toISOString())

  // Labels for ideas the question read did not name.
  const labelOf = new Map((questions ?? []).map((q) => [q.registryId, q.label]))
  const missing = ideas.map((i) => i.registry_id).filter((id) => !labelOf.has(id))
  if (week && missing.length) {
    const more = await soft('labels', readLabels(db, clientId, week.runId, missing))
    for (const [id, label] of more ?? []) labelOf.set(id, label)
  }

  const ideaIds = new Set(ideas.map((i) => i.registry_id))
  // The cards the ideas leave hold the next questions in line (IdeasBlock.questions).
  const { asked: askedRead, lead } = askedWithLead({
    lead: Math.max(0, IDEA_SLOTS - ideas.length),
    period: state.period,
    questions,
    counts: { week: windows?.themes.week ?? null, month: windows?.themes.month ?? null },
    weeks: windows?.themes.weeks ?? null,
    exclude: ideaIds,
    groups,
    subjects: new Map(),
    owned: touch,
    since,
    expanded: state.asked,
  })
  // No update has covered a week: there are no questions to list, which is
  // not a read that failed.
  const asked: AskedBlock = week ? askedRead : { ...askedRead, unread: ASKED_NO_WEEK }

  // ---- wave 3: the subjects of what is shown
  const shownIds = [...ideaIds, ...lead.map((r) => r.registryId), ...asked.rows.map((r) => r.registryId)]
  const subjects = week ? await soft('subjects', readSubjects(scope.reading, week.runId, shownIds)) : null
  for (const r of [...lead, ...asked.rows]) r.subject = subjects?.get(r.registryId)?.name ?? null

  const flagOf = new Map((flags ?? []).map((f) => [String(f.object_id), f]))
  const newIds = published && week && published.runId === week.runId && 'newThisWeek' in published.data
    ? new Set((published.data.newThisWeek ?? []).map((n) => n.themeId))
    : new Set<string>()
  const medical = printsMedicalLine(clientId)
  // An idea's counts are over THE DAYS ITS SET READ (`ideasWeek.read`, the
  // four weeks to its run's end) and each of their weeks, beside THEIR month
  // (`ideasWeek.month`: the page's for a current set, the read window's own
  // for an older one), all under the page's run's clustering (a registry id
  // is the cross-run key); the days are printed above the cards. The week
  // read's "New" stays on the page's month: it is the page's week's flag.
  const cards: IdeaCard[] = ideas.map((idea) => {
    const id = idea.registry_id
    const label = labelOf.get(id) ?? null
    const pageMonthLevel = counted(windows?.themes.month, id, windows?.market.month ?? null)
    const f = flagOf.get(id)
    const flag = f && week ? flagVerdict(f, week) : newIds.has(id) && pageMonthLevel ? newVerdict(id, label ?? idea.title, month, pageMonthLevel) : null
    return ideaCard({
      idea,
      label,
      read: counted(windows?.ideas?.themes, id, windows?.ideas?.market ?? null),
      month: counted(windows?.ideas?.month.themes, id, windows?.ideas?.month.market ?? null),
      weeks: ideaWeeks(ideasWeek?.read ?? null, windows?.ideas?.weeks, id),
      flag,
      groups: groups.get(id) ?? [],
      owned: touch,
      since,
      subject: subjects?.get(id) ?? null,
      medical,
    })
  })

  // The questions in the cards the ideas leave wear the flag an idea would.
  const questionSlots: QuestionSlot[] = lead.map((r) => {
    const f = flagOf.get(r.registryId)
    const level = counted(windows?.themes.month, r.registryId, windows?.market.month ?? null)
    const flag = f && week ? flagVerdict(f, week) : newIds.has(r.registryId) && level ? newVerdict(r.registryId, r.label, month, level) : null
    const weekComments = windows?.comments.week
    const monthComments = windows?.comments.month
    return {
      ...r,
      flag,
      platforms: platformsOf(state.period === 'month' ? windows?.mixes.month : windows?.mixes.week, r.registryId),
      comments: weekComments || monthComments
        ? { week: weekComments ? weekComments.get(r.registryId) ?? 0 : null, month: monthComments ? monthComments.get(r.registryId) ?? 0 : null }
        : null,
    }
  })

  const typical = typicalRate(playbook)
  const ideasState: IdeasState = !ideasRead ? 'unread' : stale ? 'stale' : ideasRead.state === 'ready' && cards.length === 0 ? 'none' : ideasRead.state
  return {
    brand: brand ?? 'You',
    period: state.period,
    week,
    month,
    market: windows?.market ?? { week: null, month: null },
    ideas: { state: ideasState, cards, week: cards.length > 0 ? ideasWeek : null, questions: questionSlots },
    works: worksBlock({ playbook, owned, month }),
    replies: repliesWindow ? repliesView(replies, repliesWindow) : { ...repliesView(null, null), unread: REPLIES_NO_WEEK },
    posts: postsBlock({ owned, typical, month }),
    asked,
  }
}

// ---- the Dashboard's tile (T8) --------------------------------------------------------

/** What the Dashboard's Content tile prints (E1-Dashboard): the first post
 *  idea, its videos over the days the ideas read beside its month, its format
 *  and opening, and whether your posts touched on it; or the honest empty
 *  state. */
export interface TopContent {
  state: IdeasState
  idea: {
    /** `post_ideas.id`: the idea's page. */
    id: string
    rank: PostIdeaRank
    title: string
    /** Over the days the ideas read (`ideasWeek.read`) and the month beside
     *  them (`ideasWeek.month`), as on Content. */
    read: Counted | null
    month: Counted | null
    monthWords: string
    format: Recipe | null
    opening: Recipe | null
    own: OwnTouch
    medical: boolean
    /** The week the idea was written for; `current` false where no newer
     *  ideas were stored (the tile then prints `olderIdeasLine`). */
    ideasWeek: IdeasWeek
  } | null
  /** The idea's page (`/dashboard/content/ideas/<id>`, depth as pages, 17
   *  Oct), or Content where there is no idea. */
  href: string
  /** The empty state's line where there is no idea; where the idea is from an
   *  older week, the line saying so. */
  line: string | null
  /** OPTIONAL (the weekly read v3, 18 Oct): every idea of the set `idea`
   *  leads, in rank order, each with its page, as Content's ideas row lists
   *  them. Absent where there is no idea, and on a dump from before it. */
  ideas?: { id: string; rank: PostIdeaRank; title: string; href: string }[]
}

/** Why there is no idea, in the reader's words. The table not there yet
 *  (`not_on`) is today's state in production; `none` is a workspace the step
 *  has written nothing for; `stale` ideas more than four weeks older than the
 *  newest week. */
export const IDEAS_EMPTY: Record<Exclude<IdeasState, 'ready'>, string> = {
  not_on: 'Post ideas are not switched on for this workspace.',
  none: 'No post ideas were written for this week.',
  stale: 'No new post ideas in the last four weeks.',
  unread: 'The post ideas could not be read just now.',
}

/** The Dashboard tile's empty line: the reason, and where the questions are. */
export const topContentEmpty = (state: Exclude<IdeasState, 'ready'>): string =>
  state === 'unread' ? IDEAS_EMPTY.unread : `${IDEAS_EMPTY[state]} The questions people asked are on Content.`

// ---- the ideas row's other cards (parity pass, 13 Oct) ------------------------------

/** What a question card prints as its "Post idea" fact: why this card holds
 *  a question and not an idea, in a few calm words. `ready` is a set with
 *  fewer than three ideas; `not_on` prints no fact, the row's line says it
 *  once. */
export const QUESTION_IDEA_LINE: Record<IdeasState, string | null> = {
  ready: 'None was written for this question',
  // Said once, over the row (`questionsHeading`), never on each card.
  not_on: null,
  none: 'None was written this week',
  stale: 'None written in the last four weeks',
  unread: 'Could not be read just now',
}

/** What the ideas row's question cards need from the page: the period and
 *  its words, the market's videos and the month beside them, the three
 *  weeks' names, the touch test's window, and the line for a card with no
 *  question left. */
export interface QuestionSlotsContext {
  period: ContentPeriod
  /** "this week", "between 28 Sep and 4 Oct", or the month's words. */
  when: string
  market: { week: number | null; month: number | null }
  month: Pick<ContentMonth, 'month' | 'complete'>
  /** The three weeks' names, oldest first ("21 Sep"); null where the week is
   *  not seven days. */
  weekLabels: string[] | null
  since: string
  /** Your posts the touch test read; null where they could not be read. */
  posts: number | null | undefined
  /** The line on a card with neither an idea nor a question. */
  emptyLine: string
}

export function questionSlotsContext(data: Pick<ContentPageData, 'period' | 'week' | 'month' | 'market' | 'asked' | 'ideas'>): QuestionSlotsContext {
  const { week, month, asked } = data
  const weekWords = !week || week.isWeek ? 'this week' : daysPhrase(week.first, week.last)
  const when = data.period === 'month' ? monthWords(month) : weekWords
  // "other" only where a card before it holds an idea or a question.
  const other = data.ideas.cards.length + data.ideas.questions.length > 0 ? 'other ' : ''
  const emptyLine = asked.unread
    ? asked.unread
    : !week && data.period === 'week'
      ? ASKED_NO_WEEK
      : asked.touched > 0
        ? `Every ${other}question people asked was touched on by one of your posts.`
        : `No ${other}question came up ${when}.`
  return {
    period: data.period,
    when,
    market: data.market,
    month,
    weekLabels: week ? threeWeeks(week)?.map((w) => w.label) ?? null : null,
    since: asked.since,
    posts: asked.posts,
    emptyLine,
  }
}

/** The ideas row's line where every card is a question (no idea printed):
 *  what the cards are, in the board's place for "Questions people keep
 *  asking that your posts don't answer yet, biggest first". */
export function questionsHeading(ctx: Pick<QuestionSlotsContext, 'when' | 'since' | 'posts'>, state?: IdeasState): string {
  // Where your posts could not be read, or there were none, nothing was left
  // out as touched, and the line does not say so.
  const what = ctx.posts === null || ctx.posts === 0
    ? `Questions people asked ${ctx.when}, the most videos first`
    : `Questions people asked ${ctx.when} that none of your posts since ${longMonth(ctx.since)} touched on, the most videos first`
  // Post ideas not switched on is said here, once, and on no card.
  return state === 'not_on' ? `Post ideas are not switched on. ${what}` : what
}

/** The clause a row of fewer ideas adds for the questions after them. */
export const questionsAfterIdeas = (ctx: Pick<QuestionSlotsContext, 'when'>): string => `, then the next questions asked ${ctx.when}`

/**
 * The Dashboard's Content tile, light: the ideas (two round trips) beside the
 * published week read (one), then, for the first idea only, the market and
 * conversation counts over the days the ideas read and over the month, your
 * posts and the rivals, in parallel. No reply queue (it is four reads deep), no idea's page. The same rules
 * as the page: the newest week anchors, ideas more than four weeks older are
 * not shown, older ones say so.
 */
export async function topContent(scope: Scope, opts: {
  now?: Date
  /** The published week read where the caller already holds it (the
   *  Dashboard reads it once for several tiles); read here when omitted. */
  published?: PublishedWeekRead | null
} = {}): Promise<TopContent> {
  const db = scope.supabase as SupabaseClient
  const { clientId } = scope
  // Switched off for this workspace: nothing is read and no stored idea shows.
  if (!postIdeasEnabled(clientId)) return { state: 'not_on', idea: null, href: CONTENT_PATH, line: topContentEmpty('not_on') }
  const [read, published] = await Promise.all([
    soft('top.ideas', readIdeas(db, clientId)),
    opts.published !== undefined ? Promise.resolve(opts.published) : soft('top.published', loadPublishedWeekRead(scope.reading.client, clientId)),
  ])
  if (!read) return { state: 'unread', idea: null, href: CONTENT_PATH, line: topContentEmpty('unread') }
  const week = anchorOf(read.rows, published)
  if (ideasStale(read.rows, week)) return { state: 'stale', idea: null, href: CONTENT_PATH, line: topContentEmpty('stale') }
  const idea = read.rows[0]
  const ideasWeek = ideasWeekOf(read.rows, week)
  if (!idea || !ideasWeek) return { state: read.state === 'ready' ? 'none' : read.state, idea: null, href: CONTENT_PATH, line: topContentEmpty(read.state === 'ready' ? 'none' : read.state) }
  const month = contentMonth(week, opts.now ?? new Date())
  const since = ideaOwnedFrom(month.month)
  const [rivals, ownedRead, label] = await Promise.all([
    soft('top.rivals', loadTrackedRivals(db, clientId)),
    soft('top.owned', ownedPosts({ supabase: db, clientId }, { from: since, to: ownedTo(month, week) })),
    week ? soft('top.label', readLabels(db, clientId, week.runId, [idea.registry_id])) : Promise.resolve(null),
  ])
  const audiences = marketAudiences(marketRivalAudiences(rivals ?? []))
  const windows = await soft('top.windows', readWindows(scope, week, month, audiences, { trend: false, week: false, ideas: ideasWeek }))
  const id = idea.registry_id
  return {
    state: 'ready',
    idea: {
      id: idea.id,
      rank: idea.rank,
      title: idea.title,
      read: counted(windows?.ideas?.themes, id, windows?.ideas?.market ?? null),
      month: counted(windows?.ideas?.month.themes, id, windows?.ideas?.month.market ?? null),
      monthWords: monthWords(ideasWeek.month),
      format: recipe(idea.format, idea.format_multiple, 'format'),
      opening: recipe(idea.opening, idea.opening_multiple, 'opening'),
      own: ownTouch([label?.get(id) ?? idea.title], touchPosts(ownedRead, month.month, week?.to ?? (opts.now ?? new Date()).toISOString()), since),
      medical: printsMedicalLine(clientId),
      ideasWeek,
    },
    href: contentIdeaPath(idea.id),
    line: ideasWeek.current ? null : olderIdeasLine(ideasWeek),
    ideas: read.rows.map((r) => ({ id: r.id, rank: r.rank, title: r.title, href: contentIdeaPath(r.id) })),
  }
}

/** For the copy: "Instagram 5, TikTok 2". */
export function platformsLine(byPlatform: readonly { platform: string; posts: number }[]): string {
  return byPlatform.map((p) => `${platformLabel(p.platform)} ${fmtInt(p.posts)}`).join(', ')
}

// ---- The Dashboard's tile with no idea (parity pass, 13 Oct) -------------------------------

/**
 * WHAT THE CONTENT TILE PRINTS WHERE THERE IS NO POST IDEA (switched off, none
 * written, too old, or unread): Content's first question card, the question
 * asked in the most of the week's videos that your posts have not touched,
 * its week beside its month (decision 1) and your posts against it. The
 * board's "Post next" card keeps its shape (a title, a count of the week's
 * videos, your posts) on what the data holds without an idea (Heinrich, 13
 * Oct: "the page shouldn't look too different if everything isn't as
 * populated as the design"). The rule is the page's: `askedWithLead` over the
 * same reads. Where the tile prints no idea the page's row holds none either
 * (switched off, unread, too old or none written: `ideasStale`, `readIdeas`),
 * so its three cards are the top three questions, and the tile's question is
 * the first of them (`lead[0]`, its card `questionSlotId(1)`), never the Also
 * asked table, which goes on after the cards.
 */
export interface TopAsked {
  /** `theme_registry.id`. */
  registryId: string
  /** The conversation's label (a model's name for it, `pass_b_theme`). */
  label: string
  /** Its videos this week, of the market's; and in the month beside it. */
  week: Counted | null
  month: Counted | null
  /** "this week" for a seven-day window, else its days ("between 28 Sep and
   *  4 Oct"): Content's own rule (`weekWordsOf`). */
  weekWords: string
  /** "in October so far". */
  monthWords: string
  /** The groups whose conversations include it (names only, decision 5),
   *  as Content's "Who asks" column holds them. */
  groups: GroupName[]
  /** The next questions in line (at most `ASKED_NEXT`: the next question
   *  card, then the Also asked table), each its week beside its month and
   *  where it opens: what else the week asked that your posts have not
   *  touched. */
  next: { registryId: string; label: string; week: number | null; month: number | null; href: string }[]
  /** Your posts against it (none touched it, by the table's rule); null where
   *  they were not read. */
  own: OwnTouch | null
  /** Content's first question card (`questionSlotId(1)`). */
  href: string
}

/** The questions the tile lists under its own. */
export const ASKED_NEXT = 1

/** The tile's question from the page's own split (`askedWithLead` with no
 *  idea on the row): the first question card, then the next in line, each
 *  opening its own card, or the Also asked table once the cards run out.
 *  Pure. */
export function topAskedOf(
  read: { asked: AskedBlock; lead: readonly AskedRow[] },
  market: { week: number | null; month: number | null },
  month: Pick<ContentMonth, 'month' | 'complete'>,
  own: OwnTouch | null,
  week: Pick<ContentWeek, 'isWeek' | 'first' | 'last'> | null = null,
): TopAsked | null {
  const row = read.lead[0]
  if (!row) return null
  const level = (k: number | null, n: number | null): Counted | null => (k != null && n != null && n > 0 ? { k, n } : null)
  const inLine = [
    ...read.lead.slice(1).map((r, i) => ({ r, href: `${CONTENT_PATH}#${questionSlotId(i + 2)}` })),
    ...read.asked.rows.map((r) => ({ r, href: `${CONTENT_PATH}#${ASKED_ID}` })),
  ]
  return {
    registryId: row.registryId,
    label: row.label,
    week: level(row.week, market.week),
    month: level(row.month, market.month),
    weekWords: weekWordsOf(week),
    monthWords: monthWords(month),
    groups: row.groups,
    next: inLine.slice(0, ASKED_NEXT).map(({ r, href }) => ({ registryId: r.registryId, label: r.label, week: r.week, month: r.month, href })),
    own,
    href: `${CONTENT_PATH}#${questionSlotId(1)}`,
  }
}

/**
 * The tile's question, read the page's way: the week the page anchors on (the
 * published read's; no ideas to anchor on), its month, the week's questions,
 * the market's videos over both, and your posts. Null where there is no week
 * or no question; never throws (each read is soft, as on the page).
 */
export async function topAsked(scope: Scope, opts: { now?: Date; published?: PublishedWeekRead | null } = {}): Promise<TopAsked | null> {
  const db = scope.supabase as SupabaseClient
  const { clientId } = scope
  const published = opts.published !== undefined ? opts.published : await soft('asked.published', loadPublishedWeekRead(scope.reading.client, clientId))
  const week = anchorOf([], published ?? null)
  if (!week) return null
  const month = contentMonth(week, opts.now ?? new Date())
  const since = ideaOwnedFrom(month.month)
  const [rivals, questions, ownedRead, personas] = await Promise.all([
    soft('asked.rivals', loadTrackedRivals(db, clientId)),
    soft('asked.questions', readQuestions(db, clientId, week.runId)),
    soft('asked.owned', ownedPosts({ supabase: db, clientId }, { from: since, to: ownedTo(month, week) })),
    soft('asked.personas', readPersonas(db, clientId)),
  ])
  if (!questions || questions.length === 0) return null
  const audiences = marketAudiences(marketRivalAudiences(rivals ?? []))
  const windows = await soft('asked.windows', readWindows(scope, week, month, audiences, { trend: false }))
  if (!windows) return null
  const touch = touchPosts(ownedRead, month.month, week.to)
  // The page's split with no idea on the row: its three cards hold the top
  // questions, and the table goes on after them.
  const split = askedWithLead({
    lead: IDEA_SLOTS,
    period: 'week',
    questions,
    counts: { week: windows.themes.week, month: windows.themes.month },
    weeks: null,
    exclude: new Set(),
    groups: groupsByConversation(personas ?? []),
    subjects: new Map(),
    owned: touch,
    since,
    expanded: false,
  })
  const row = split.lead[0]
  return topAskedOf(split, windows.market, month, row ? ownTouch([row.label], touch, since) : null, week)
}
