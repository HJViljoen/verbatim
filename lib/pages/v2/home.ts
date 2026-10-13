import type { SupabaseClient } from '@supabase/supabase-js'

import { loadObjectReadings, type MarketObjectRef } from '../../agent/movement'
import { surface } from '../../nav'
import { loadAppPairOn } from '../../reading/gather-flags'
import { monthStartOf, prevMonth } from '../../reading/month-key'
import { loadDeliveredRuns, loadReadingSchedule, marketRivalAudiences, updateClock } from '../../reading/reading-view'
import type { ReadingHandle } from '../../reading/read'
import type { Verdict } from '../../reading/verdicts'
import type { Scope } from '../../renderables/types'
import { weekReadDates } from '../../reports/weekly-read'
import { loadTrackedRivals } from '../../rivals'
import { subjectCalibration } from '../../subjects/calibration-state'
import { loadActiveSubjects } from '../../subjects/membership'
import { isMissingSubjects } from '../../subjects/types'
import { inMonth, readingMonthOf } from '../../written/month'
import { loadPublishedWeekRead, type PublishedWeekRead } from '../../written/published'
import { factsFromReadings, marketComparable } from '../../written/standing'
import type { StandingFact } from '../../written/types'
import { longMonth } from '../../format'
import { homeWeeksFrame, loadHomeWeeks, WEEKS_FAILED, weeksFailed, type HomeWeeks, type WeeksRead } from '../home'
import { topAsked, topContent, type TopAsked, type TopContent } from './content'
import { marketParams, monthSoFar, subjectHref, topMarket, weekReadMonth, type MarketTop } from './market'
import { topMoves, type TopMoves } from './moves'
import { topProducts, type TopProducts } from './products'
import { topVoices, type TopVoices } from './voices'

// THE DASHBOARD (Design v2, depth plan T8; boards E1-Dashboard and
// E1-Dashboard-Phone), at `/dashboard` (nav key `home`, no page key).
//
// THE PAGE, TOP TO BOTTOM, AND WHERE EACH TILE COMES FROM:
//   1. THE BAR: the published week's dates, when it was read and the next
//      update (`updateClock`, the update line every page dated by its update
//      prints).
//   2. MARKET (`topMarket`, lib/pages/v2/market.ts): the anomaly check's flag
//      where it raised one, else the week's biggest new conversation, else its
//      biggest; then the week's biggest with its three bare weekly counts and
//      one more first heard this week. Each opens its panel on Market
//      (`?conv=`).
//   3. YOUR MARKET THIS WEEK: the market's videos and comments this week, the
//      month beside them (the published read's frozen figures), the weekly
//      volume (lib/pages/home.ts `homeWeeks`, kept exactly), and the subjects
//      against last month: the biggest, and the one that moved most, banded
//      through its `Verdict` (`factsFromReadings`, Market's own subject rule).
//   4. VOICES (`topVoices`): the group in the most videos this month and its
//      panel (`?group=`), every group's videos as separate bars (decision 2:
//      never a share, never stacked), and the two brands named most.
//   5. YOUR PRODUCTS (`topProducts`, lib/pages/v2/products.ts): a product's
//      first month with videos, else the product talked about most, into its
//      open panel; the catalogue's products that came up, and the mini shelf.
//   6. CONTENT (`topContent`): the first post idea (`?idea=`), its week beside
//      its month, its format and opening, whether your posts touched on it, and
//      the medical team line where the market is medical; with no idea, the
//      week's most-asked question your posts have not touched (`topAsked`,
//      Content's "Also asked" rule) and why there is no idea.
//   7. YOUR MOVES (`topMoves`): the first piece of advice waiting for a
//      decision (`?advice=`), with Accept and Not for us for an owner or an
//      admin, and the move whose market moved most since it was dated.
//   8. THE AGENT: a question box, and two questions to try about the week's
//      biggest conversations (the read's frozen `conversations`).
//
// DECISION 1 (13 Oct): no weekly direction words; every week figure sits
// beside its month; no quote and no model sentence at level 1 (a stored name,
// a conversation's label, an idea's title and a piece of advice's title print
// as names, each in its slot).
//
// ONE WAVE. `startDashboard` starts every tile's reads together and awaits
// nothing; each tile then settles on its own. The reads two tiles share are
// read once: the published week read is passed to Market and Content; one
// reading handle and one session client serve every tile, so the memoised
// reads (delivered runs, cadence runs, the change log, the schedule, the
// window readings: lib/reading/memo.ts) are made once a request.
//
// THE BOARD'S SHAPE IN EVERY DATA STATE (parity pass, 13 Oct; Heinrich: "the
// page shouldn't look too different if everything isn't as populated as the
// design"). A tile never collapses to a line because its data is thin: the
// loader hands each tile what it can draw its parts with (the subjects'
// reason, `WeekSubjects.gap`; the tracked brands, `TopVoices.tracked`; the
// page's own shelf, unshaded where its month was not read,
// `TopProducts.columns`; Content's first question card, `ContentTile.asked`;
// the newest move, `TopMoves.newest`), and each gap is
// said inside its part in one quiet line.
//
// A TILE THAT FAILS LOSES ONLY ITSELF (AGENTS.md: a page that throws keeps
// the shell). Each tile is `{ state: 'failed' }` where its read threw, and
// the page prints one calm line in it.

// ---- Your products (T5's tile) -------------------------------------------------------

// T5's reader and its pinned type (lib/pages/v2/products.ts): the tile's
// figures are the page's own, read the page's way.
export type { TopProducts } from './products'

// ---- What the page prints ---------------------------------------------------------------

/** A tile's read: what it read, or that its read failed. */
export type TileRead<T> = { state: 'ok'; top: T } | { state: 'failed' }

export interface DashboardBar {
  /** The published week's days, "5 to 11 October"; null with no read. */
  dates: string | null
  /** The same, short, for the phone's bar ("5 to 11 Oct"). */
  short: string | null
  /** The last update the page reads, and the next one the schedule promises. */
  asAt: string | null
  nextUpdate: string | null
  paused: boolean
}

export interface MarketTile {
  top: MarketTop | null
  /** The market's videos this week, as the week's tile prints them (the
   *  read's frozen figure), so the tile can say how its category's count sits
   *  inside it; null with no read. */
  marketWeek: number | null
  /** The month the week is restated against, `YYYY-MM-01` (a "New" chip's
   *  month); null with no read. */
  month: string | null
}

/** One subject as the week's tile prints it. */
export interface WeekSubject {
  id: string
  name: string
  href: string
}

/** The subjects against last month, as Market's board reads them. */
export interface WeekSubjects {
  /** "October so far", "September". */
  monthText: string
  /** "September". */
  prevText: string
  /** The biggest ready subject this month, its level of the market's videos. */
  biggest: (WeekSubject & { k: number; n: number }) | null
  /** The subject whose month moved most against last month, beyond its band. */
  moved: (WeekSubject & { verdict: Verdict }) | null
  /** No subject moved beyond its band, and at least one was compared. */
  noneMoved: boolean
  /** OPTIONAL (parity pass, 13 Oct): why the rows hold no subject, so the
   *  block keeps both of the board's rows and says it inside them:
   *  `calibrating`, subjects are named and none is calibrated yet (Össur
   *  today); `none_named`, no subject is named; `failed`, the read threw.
   *  Absent where the rows print what they read (a ready subject with no
   *  month before to compare says that in its own row). */
  gap?: 'calibrating' | 'none_named' | 'failed'
}

/** The subjects block where it holds no ready subject (parity pass): both
 *  rows kept, the reason said inside them. Pure. */
export function weekSubjectsGap(month: string, soFar: boolean, gap: NonNullable<WeekSubjects['gap']> | null): WeekSubjects {
  const m = monthStartOf(month)
  return { monthText: soFar ? `${longMonth(m)} so far` : longMonth(m), prevText: longMonth(prevMonth(m)), biggest: null, moved: null, noneMoved: false, ...(gap ? { gap } : {}) }
}

/** "Your market this week": the market's size, the month beside it, the
 *  weekly volume and the subjects. */
export interface WeekTile {
  /** "5 to 11 October"; null with no published read. */
  dates: string | null
  /** The read's frozen figures for the week and for the month it is restated
   *  against; null where a side was not read. */
  week: { videos: number | null; comments: number | null }
  month: { videos: number | null; comments: number | null }
  /** "in October so far", "in September"; null with no read. */
  inMonth: string | null
  /** The weekly volume: `homeWeeks`, or the empty frame. */
  weeks: HomeWeeks
  /** The weekly volume's read FAILED (the frame is empty because nothing
   *  could be read, not because too few clean weeks were): the tile says so
   *  rather than "Insufficient data" (Phase 4 fix round). */
  weeksFailed?: boolean
  subjects: WeekSubjects | null
  /** Market, where the market's size is the page. */
  href: string
}

/** A conversation to ask the Agent about from the box: its label (the link's
 *  words) and the question the link asks. */
export interface AgentTry {
  label: string
  question: string
  href: string
}

export interface AgentBox {
  action: string
  tries: AgentTry[]
}

/** Content's tile: the first post idea, or where there is none, the
 *  question the week asked most that your posts have not touched (`asked`,
 *  parity pass, 13 Oct; optional, so a dump from before it still draws). */
export type ContentTile = TopContent & { asked?: TopAsked | null }

export interface DashboardData {
  bar: DashboardBar
  market: TileRead<MarketTile>
  week: TileRead<WeekTile>
  voices: TileRead<TopVoices | null>
  products: TileRead<TopProducts>
  content: TileRead<ContentTile>
  moves: TileRead<TopMoves | null>
  agent: AgentBox
}

/** The same, each part still settling: what the route streams. */
export type DashboardReads = { [K in keyof DashboardData]: Promise<DashboardData[K]> }

/** The questions the Agent box offers to try (the board's two). */
export const AGENT_TRIES = 2

// ---- Pure builders ----------------------------------------------------------------------

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/**
 * The week tile, from the published read, the weekly volume and the subjects.
 * The figures are the read's frozen market (the category and the tracked
 * brands, your own posts out), restated against the month the week falls in
 * as Market restates it (`readingMonthOf`, `monthSoFar`): "in October so far",
 * or "in September" once the week has carried past its end. Pure.
 */
export function weekTileOf(input: {
  read: PublishedWeekRead | null
  /** The chart; null where too few clean weeks were read; `WEEKS_FAILED`
   *  where the read threw. */
  weeks: WeeksRead
  subjects: WeekSubjects | null
  now: string
}): WeekTile {
  const data = input.read?.data ?? null
  const market = data && data.version === 2 && data.market ? data.market : null
  const num = (v: unknown): number | null => (isCount(v) ? v : null)
  let inMonthWords: string | null = null
  if (data) {
    const rm = readingMonthOf(data.window)
    const month = monthStartOf(rm.month)
    inMonthWords = inMonth(month, !monthSoFar(month, monthStartOf(input.now), rm.complete))
  }
  return {
    dates: data ? weekReadDates(data.window) || null : null,
    week: { videos: num(market?.week.videos), comments: num(market?.week.comments) },
    month: { videos: num(market?.month.videos), comments: num(market?.month.comments) },
    inMonth: inMonthWords,
    weeks: input.weeks && !weeksFailed(input.weeks) ? input.weeks : homeWeeksFrame(input.now),
    ...(weeksFailed(input.weeks) ? { weeksFailed: true } : {}),
    subjects: input.subjects,
    href: surface('market').href,
  }
}

/**
 * The subjects the week's tile names, from the standing facts Market's board
 * reads (`factsFromReadings`): the biggest ready subject, by its level of the
 * market's videos (ties by name), and the one whose month moved most against
 * last month beyond its band (`verdict.state === 'moved'`, the largest change
 * either way). A subject that is not ready prints neither. Null where neither
 * prints and nothing was compared. Pure.
 */
export function weekSubjectsOf(facts: readonly StandingFact[], month: string, soFar: boolean): WeekSubjects | null {
  const m = monthStartOf(month)
  const p = marketParams({})
  const href = (id: string) => subjectHref(p, id)
  const ready = facts.filter((f) => f.calibration === 'ready')
  const biggest = ready
    .filter((f) => f.level && f.level.n > 0)
    .sort((a, b) => b.level!.k / b.level!.n - a.level!.k / a.level!.n || a.name.localeCompare(b.name))[0] ?? null
  const moved = ready
    .filter((f) => f.verdict?.state === 'moved' && f.verdict.changePts != null && f.verdict.changePts !== 0)
    .sort((a, b) => Math.abs(b.verdict!.changePts!) - Math.abs(a.verdict!.changePts!) || a.name.localeCompare(b.name))[0] ?? null
  const compared = ready.some((f) => f.verdict?.state === 'moved' || f.verdict?.state === 'no_clear_change')
  if (!biggest && !moved && !compared) return null
  return {
    monthText: soFar ? `${longMonth(m)} so far` : longMonth(m),
    prevText: longMonth(prevMonth(m)),
    biggest: biggest ? { id: biggest.subjectId, name: biggest.name, k: biggest.level!.k, n: biggest.level!.n, href: href(biggest.subjectId) } : null,
    moved: moved ? { id: moved.subjectId, name: moved.name, verdict: moved.verdict!, href: href(moved.subjectId) } : null,
    noneMoved: !moved && compared,
  }
}

/**
 * What to try asking (the board's "Try"): the week's two biggest
 * conversations, by their labels. The read's frozen `conversations` where it
 * holds them (ranked as the week's lead ranks them, T11b), else the ones the
 * Market tile leads with (its lead and its rows: a read stored before T11b
 * holds none); a set-apart one leads nothing (decision F). Each link asks the
 * Agent what the market says about that conversation, its label quoted
 * whole: a label is a model's free text ("Will it fit airline rules"), and no
 * one sentence frame reads right around every one, so the box prints the
 * label and the question carries it. None where neither holds one. Pure.
 */
export function agentTries(read: PublishedWeekRead | null, market: MarketTop | null = null): AgentTry[] {
  const data = read?.data
  const frozen = data && data.version === 2 ? (data.conversations ?? []) : []
  const labels: string[] = frozen.filter((c) => !c.setApart && c.label.trim()).map((c) => c.label.trim())
  if (labels.length < AGENT_TRIES && market) {
    const hero = market.hero
    const lead = hero ? (hero.kind === 'flag' ? hero.card.conv : hero.conv) : null
    for (const c of [lead, ...market.rows.map((r) => r.conv)]) {
      if (c && !c.setApart && c.label.trim() && !labels.includes(c.label.trim())) labels.push(c.label.trim())
    }
  }
  return labels.slice(0, AGENT_TRIES).map((label) => {
    const question = `What does my market say about "${label}"?`
    return { label, question, href: `${surface('ask').href}?ask=${encodeURIComponent(question.slice(0, 300))}` }
  })
}

/** "5 to 11 October" as the phone's bar prints it: "5 to 11 Oct". */
export const shortDates = (dates: string): string =>
  dates.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/g, (m) => m.slice(0, 3))

/** The bar, from the read and the update clock. Pure. */
export function dashboardBar(input: {
  read: PublishedWeekRead | null
  clock: { asAt: string | null; nextUpdate: string | null; paused: boolean } | null
}): DashboardBar {
  const data = input.read?.data ?? null
  const dates = data ? weekReadDates(data.window) || null : null
  return {
    dates,
    short: dates ? shortDates(dates) : null,
    asAt: input.clock?.asAt ?? null,
    nextUpdate: input.clock?.nextUpdate ?? null,
    paused: input.clock?.paused ?? false,
  }
}

/** The read's frozen market videos this week, or null. */
export function marketWeekOf(read: PublishedWeekRead | null): number | null {
  const data = read?.data
  const v = data && data.version === 2 ? data.market?.week.videos : null
  return isCount(v) ? v : null
}

// ---- The reads ----------------------------------------------------------------------------

export interface DashboardSession {
  /** The session client (RLS-scoped) on the app path. */
  supabase: SupabaseClient
  clientId: string
  /** ONE handle for every tile, so the reading client (and its memo) is one. */
  reading: ReadingHandle
  /** May the reader Accept or decline advice (`mayDecideMoves`)? */
  canDecide: boolean
  now?: Date
}

const say = (what: string, error: unknown): void => {
  console.error(`[pages] home.${what}: ${(error as { message?: string } | null)?.message ?? String(error)}`)
}

/** A tile's read settles to what it read, or to `failed`, logged. Never throws. */
export function settleTile<T>(what: string, p: Promise<T>): Promise<TileRead<T>> {
  return p.then(
    (top): TileRead<T> => ({ state: 'ok', top }),
    (error: unknown): TileRead<T> => {
      say(what, error)
      return { state: 'failed' }
    },
  )
}

/** Content's tile: the idea where one prints; with none, the week's
 *  most-asked question your posts have not touched (`topAsked`, read only
 *  then; parity pass). A failed question read costs the question, not the
 *  tile. */
export function withAsked(top: TopContent, read: () => Promise<TopAsked | null>): Promise<ContentTile> {
  if (top.idea) return Promise.resolve(top)
  return read().then(
    (asked): ContentTile => ({ ...top, asked }),
    (error: unknown): ContentTile => {
      say('asked', error)
      return { ...top, asked: null }
    },
  )
}

/** A read that may fail without failing its tile: logged, null. */
function soft<T>(what: string, p: Promise<T>): Promise<T | null> {
  return p.catch((error: unknown) => {
    say(what, error)
    return null
  })
}

/**
 * The subjects against last month, as Market's board reads them, for the
 * month the published week is restated against: the active subjects and
 * their calibration, the month-pair judge, then the market's readings of
 * them (`loadObjectReadings`, the Agent's and Market's reader). A missing
 * subjects table is none.
 */
async function loadWeekSubjects(input: {
  reading: ReadingHandle
  clientId: string
  month: string
  soFar: boolean
  nowIso: string
  rivalAudiences: string[] | null
}): Promise<WeekSubjects | null> {
  const db = input.reading.client
  let subjects: Awaited<ReturnType<typeof loadActiveSubjects>>
  try {
    subjects = await loadActiveSubjects(db as never, input.clientId)
  } catch (error) {
    if (isMissingSubjects(error)) return weekSubjectsGap(input.month, input.soFar, 'none_named')
    throw error
  }
  if (subjects.length === 0) return weekSubjectsGap(input.month, input.soFar, 'none_named')
  const all = subjects.map((s) => ({ subject: s, calibration: subjectCalibration(s) }))
  // Only a ready subject prints a level or a verdict here, so only they are read.
  const objects: MarketObjectRef[] = all
    .filter((x) => x.calibration === 'ready')
    .map(({ subject, calibration }) => ({ kind: 'subject' as const, id: subject.id, label: subject.name, calibration }))
  if (objects.length === 0) return weekSubjectsGap(input.month, input.soFar, 'calibrating')
  const pair = await loadAppPairOn(input.reading, input.nowIso)
  const readings = await loadObjectReadings(db, {
    clientId: input.clientId, objects, month: input.month, pair, asOf: input.nowIso, rivalAudiences: input.rivalAudiences,
  })
  const readingOf = new Map(readings.map((r) => [r.object.id, r]))
  const facts = factsFromReadings(
    all.filter((x) => x.calibration === 'ready').map(({ subject, calibration }) => ({ subject, calibration, reading: readingOf.get(subject.id) ?? null })),
    marketComparable(pair, input.month),
  )
  // Ready subjects with neither a level nor a month to compare keep the rows,
  // each saying so.
  return weekSubjectsOf(facts, input.month, input.soFar) ?? weekSubjectsGap(input.month, input.soFar, null)
}

/**
 * Every tile's reads, started together; nothing is awaited here. The route
 * streams each part as it settles (`DashboardReads`); `loadDashboard` awaits
 * them all for a script or a test.
 */
export function startDashboard(session: DashboardSession): DashboardReads {
  const { supabase, clientId, reading, canDecide } = session
  const now = session.now ?? new Date()
  const nowIso = now.toISOString()
  const db = reading.client
  const scope: Scope = { supabase, clientId, reading, params: {} }

  // ---- the one wave: the reads more than one tile needs, then every tile ----
  const published = loadPublishedWeekRead(db, clientId)
  // Each consumer handles a failed read its own way; none is left unhandled.
  published.catch(() => {})
  const publishedSoft = soft('read', published)
  const rivals = soft('rivals', loadTrackedRivals(supabase, clientId))
  const clock = soft('clock', Promise.all([loadDeliveredRuns(supabase, clientId), loadReadingSchedule(supabase, clientId)])
    .then(([runs, schedule]) => updateClock({ now: nowIso, runs, schedule })))

  const market = settleTile('market', published.then((read) => topMarket({ supabase, clientId, reading, read, now })
    .then((top): MarketTile => ({ top, month: read ? weekReadMonth(read.data) : null, marketWeek: marketWeekOf(read) }))))
  const voices = settleTile('voices', topVoices({ supabase, clientId, reading, now: nowIso }))
  const products = settleTile('products', topProducts({ supabase, clientId, reading, now: nowIso }))
  // A failed week read costs Content its anchor week, not the tile: Content
  // anchors on the ideas' own run where the read is missing. With no idea to
  // print, the tile reads the question the week asked most (`topAsked`,
  // Content's own "Also asked" rule; parity pass), so it keeps its shape.
  const ideas = publishedSoft.then((read) => topContent(scope, { now, published: read }))
  const content = settleTile('content', Promise.all([ideas, publishedSoft]).then(([top, read]) => withAsked(top, () => topAsked(scope, { now, published: read }))))
  const moves = settleTile('moves', topMoves(scope, { canDecide }))

  // A failed read is WEEKS_FAILED, never null: null is "too few clean weeks".
  const weeks: Promise<WeeksRead> = loadHomeWeeks({ supabase, clientId, reading: db, rivals }, nowIso)
    .catch((error: unknown) => { say('weeks', error); return WEEKS_FAILED })
  // A read that throws keeps the block: its rows say it could not be read.
  const subjects = Promise.all([publishedSoft, rivals]).then(([read, rv]) => {
    if (!read) return null
    const rm = readingMonthOf(read.data.window)
    const month = monthStartOf(rm.month)
    const soFar = monthSoFar(month, monthStartOf(nowIso), rm.complete)
    return loadWeekSubjects({
      reading, clientId, month, soFar, nowIso,
      rivalAudiences: rv ? marketRivalAudiences(rv) : null,
    }).catch((error: unknown) => { say('subjects', error); return weekSubjectsGap(month, soFar, 'failed') })
  })
  const week = settleTile('week', Promise.all([publishedSoft, weeks, subjects])
    .then(([read, w, s]) => weekTileOf({ read, weeks: w, subjects: s, now: nowIso })))

  return {
    bar: Promise.all([publishedSoft, clock]).then(([read, c]) => dashboardBar({ read, clock: c })),
    market,
    week,
    voices,
    products,
    content,
    moves,
    // The box draws at once; its questions to try wait for the read and the
    // Market tile they are about.
    agent: Promise.all([publishedSoft, market]).then(([read, m]) => ({ action: surface('ask').href, tries: agentTries(read, m.state === 'ok' ? m.top.top : null) })),
  }
}

/** Everything the Dashboard prints, awaited (a script, a test, a dump). */
export async function loadDashboard(session: DashboardSession): Promise<DashboardData> {
  const r = startDashboard(session)
  const [bar, market, week, voices, products, content, moves, agent] = await Promise.all([
    r.bar, r.market, r.week, r.voices, r.products, r.content, r.moves, r.agent,
  ])
  return { bar, market, week, voices, products, content, moves, agent }
}
