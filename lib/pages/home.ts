import type { SupabaseClient } from '@supabase/supabase-js'

import { STILL_FILLING, weekDetailLabel, type WeekDetail } from '../charts/week-bars'
import { fmtInt, longMonth, shortDate } from '../format'
import { surface, type NavKey } from '../nav'
import { isMissingRecDecisions, REC_DECISIONS_TABLE, type RecDecision } from '../rec-decisions'
import { INDUSTRY_AUDIENCE, loadTrackedRivals } from '../rivals'
import { selectAll } from '../supabase-admin'
import { loadChanges, loadWindowReading, readingHandle } from '../reading/read'
import { marketAudiences } from '../reading/market'
import { nextMonth } from '../reading/month-key'
import { loadCadenceRuns, loadDeliveredRuns, loadReadingMonth, marketRivalAudiences, updateInstant } from '../reading/reading-view'
import { chartSettlingUpdates, withChartCadence, type ChartRun } from '../reading/week-line'
import { ourChangesWithoutGatherFlags } from '../reading/gather-flags'
import {
  addDays, checkedRows, isoWeekOf, marketWeekRowOf, pooledWeekVolumes, weekRules, weeksSinceOurChanges,
  type MarketWeekRowRaw, type WeekVolume,
} from '../reading/weeks'
import { isFailOpenFix, type OurChange } from '../reading/comparability'
import { weekReadDates } from '../reports/weekly-read'
import { monthHeading } from '../written/month'
import { loadPublishedWeekRead } from '../written/published'
import type { WeekReadData, WeekReadStanding } from '../written/types'
import type { FigureTable } from '../reports/types'
import { adviceShortlist } from './advice-shortlist'
import type { BrandList } from './brands'
import { loadBrandList } from './brands-load'
import { buildAdviceRows, type RecCopy } from './market-surface'
import { POOL_FLOOR, segmentOf, THEME_FLOOR } from './overview-market/board'
import { monthPhrase } from './week'
import { TABLE_MOVES } from '../subjects/types'

// THE DASHBOARD (`/dashboard`, nav key `home`; pages build, HOME package, 1 Oct).
//
// The approved artboard `Page-Dashboard.dc.html`, top to bottom:
//   1. "Your market in numbers": the market's videos and comments this week and
//      this month, the four figures the latest READY weekly read froze at its
//      run (`week_reads.data.market`, the market base: the category plus the
//      tracked brands' audiences, the client's own posts out);
//   2. "Week by week": the market's weekly videos and comments, only weeks
//      read one way, from the first such week the data shows (`homeAxis`,
//      `weeksSinceOurChanges`; never a constant); a week still filling is
//      drawn faint; until one such week exists the block is the artboard's
//      empty frame with "Insufficient data" (Heinrich, 1 Oct);
//   3. the Agent box (the page draws it; nothing is read);
//   4. six tiles, one number and a few short rows each, each appearing only
//      when its fact exists.
//
// NOT THE STORED `dashboard` PAGE KEY. That key is a stored contract (old
// snapshots, a share link, a schedule) and stays in the registry; this page
// has no page key and its own files (page review §5.2).
//
// ONE WAVE OF LIGHT READS, NO PAGE LOADER. Every read below is a small,
// bounded select or one RPC, started together; the only hop is the handful
// that need the latest read's month, run and window, which start the moment
// that one row lands. A failed read empties its block or tile, never the page.
//
// PURE BUILDERS, EXPORTED. `homeNumbers`, `homeWeeks` and the tile builders
// take rows and return what prints, so lib/pages/home.test.ts pins every rule
// without a database.

// ---- What the page prints -------------------------------------------------------

/** One half of "Your market in numbers": its heading and the two counts. */
export interface HomeNumbersHalf {
  heading: string
  videos: string
  comments: string
}

export interface HomeNumbers {
  week: HomeNumbersHalf | null
  month: HomeNumbersHalf | null
}

/** One column of "Week by week". `videos` and `comments` are null on a slot
 *  the chart frames but has no settled week for yet. */
export interface HomeWeekColumn {
  week: string
  label: string
  videos: number | null
  comments: number | null
  /** False while the week is still filling (under way, or fewer than two
   *  updates since it ended): drawn at reduced opacity, with no words. */
  settled: boolean
}

export interface HomeWeeks {
  columns: HomeWeekColumn[]
  /** The tallest bar and the highest point, which every column is drawn against. */
  maxVideos: number
  maxComments: number
}

/** A tile row: a label with a share bar (the artboard's `minirows`), or a
 *  label and a quiet value (its `textrows`). `copy` names where the label's
 *  words came from, so the render marks them for the copy contract. */
export type HomeTileRow =
  | { kind: 'bar'; label: string; copy: 'theme' | null; pct: number | null; value: string }
  | { kind: 'text'; label: string; copy: 'finding' | null; value: string }

export type HomeTileKey = 'overview' | 'week' | 'voice' | 'competitive' | 'subjects' | 'market'

export interface HomeTile {
  key: HomeTileKey
  title: string
  href: string
  big: string
  sub: string
  rows: HomeTileRow[]
}

export interface HomeData {
  /** Null where no half was read: the block prints `INSUFFICIENT`. */
  numbers: HomeNumbers | null
  /** Always a frame: `homeWeeksFrame` where no week is drawable. */
  weeks: HomeWeeks
  tiles: HomeTile[]
}

// ---- The tiles' titles, in the artboard's order --------------------------------------

/** The six tiles, in the artboard's order, with the artboard's titles. The link
 *  is the page's own address in lib/nav.ts, so a route that moves (Your market
 *  to /dashboard/overview) moves the link with it. */
export const HOME_TILES: readonly { key: HomeTileKey; title: string }[] = [
  { key: 'overview', title: 'Your market' },
  { key: 'week', title: 'This week' },
  { key: 'voice', title: 'Conversation' },
  { key: 'competitive', title: 'Competitive' },
  { key: 'subjects', title: 'Subjects' },
  { key: 'market', title: 'Your moves' },
]

/** Rows a tile prints at most (the artboard: three). */
export const TILE_ROWS = 3

/** Columns "Week by week" frames (the artboard: eight weeks). */
export const WEEK_COLUMNS = 8

/** Clean weeks the chart needs before it is drawn at all (Heinrich, 1 Oct:
 *  from ONE clean week; a week still filling is drawn faint). */
export const WEEKS_MIN = 1

/**
 * THE CHART'S FIRST WEEK IS THE DATA'S, NEVER A CONSTANT (the lead's ruling,
 * 1 Oct night). The axis is the last `WEEK_COLUMNS` weeks to now, and the
 * weeks drawn are those `weeksSinceOurChanges` finds read one way: after the
 * latest search or relevance change on the axis (the fail-open fixes aside,
 * `isFailOpenFix`), with something gathered, and counting no video let in
 * without a check that stands (`unchecked`, the newest verdict: left out of
 * the counts where the SQL says what it holds, `checkedRows`, else the week
 * is not drawn). A change before the axis leaves every axis week after it, so
 * nothing older is needed. On Sealand (5 Oct) that is: the 17 Sep search
 * change cuts everything to the week of 14 Sep, the week of 21 Sep is drawn
 * (its two 24 Sep rehearsals gathered nothing, so they are not runs of the
 * cadence, `chartRunGatheredNothing`), and the week of 28 Sep is drawn with
 * its one unchecked video left out.
 */
export function homeAxis(now: string): string[] {
  const current = isoWeekOf(now)
  const axis: string[] = []
  for (let i = WEEK_COLUMNS - 1; i >= 0; i--) axis.push(addDays(current, -7 * i))
  return axis
}

/** `isFailOpenFix` lives with the change log's grouping now
 *  (lib/reading/comparability.ts), so the week line reads the same exemption;
 *  re-exported for the Dashboard's callers and tests. */
export { isFailOpenFix }

const hrefOf = (key: HomeTileKey): string => surface(key as NavKey).href
const titleOf = (key: HomeTileKey): string => HOME_TILES.find((t) => t.key === key)?.title ?? key
const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many)

// ---- 1. Your market in numbers ------------------------------------------------------

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/**
 * The four numbers, from the read's frozen market figures. A half prints only
 * where both its counts were read (a figure that was not read is null, never
 * zero, and is not printed as one); the block is null where neither half is.
 *
 * The headings are the read's own dates: "This week, 21 to 27 September", and
 * the month it is restated against, "September so far", or "September in
 * total" once the week has carried past the month's end (M2,
 * lib/written/month.ts).
 */
export function homeNumbers(read: WeekReadData | null): HomeNumbers | null {
  if (!read || read.version !== 2 || !read.market) return null
  const { week, month } = read.market
  const dates = weekReadDates(read.window)
  const half = (heading: string, v: { videos: number | null; comments: number | null }): HomeNumbersHalf | null =>
    isCount(v.videos) && isCount(v.comments) ? { heading, videos: fmtInt(v.videos), comments: fmtInt(v.comments) } : null
  const out: HomeNumbers = {
    week: dates ? half(`This week, ${dates}`, week) : null,
    month: half(monthHeading(read.month, read.monthComplete), month),
  }
  return out.week || out.month ? out : null
}

// ---- 2. Week by week -------------------------------------------------------------

/**
 * The weeks the chart may draw, from the last `WEEK_COLUMNS` weeks
 * (`homeAxis`), ONLY weeks read one way: none before our latest
 * search or relevance change (the fail-open fixes aside, `isFailOpenFix`; a
 * change made inside a run before its gather cuts only the weeks before that
 * run's, `preGatherCutBefore`), none with nothing gathered
 * (`weeksSinceOurChanges`, T0a's rule for the weekly bars). A bar counts only
 * CHECKED videos and their comments (`checkedRows`, 5 Oct; Your market and
 * This week count the same way): a video let in without a check that still
 * stands is left out of its week's counts, and a week whose unchecked videos'
 * counts are not known is not drawn.
 *
 * DRAWN FROM ONE SUCH WEEK (Heinrich, 1 Oct): a week still filling (under
 * way, or fewer than two updates since it ended, `weekStateOf`) is drawn at
 * reduced opacity with no words (`settled: false`) and goes solid once
 * settled. Null only where no such week exists: the loader then hands the
 * page `homeWeeksFrame`, the empty frame with "Insufficient data".
 *
 * The chart frames `WEEK_COLUMNS` weeks (the artboard's eight), opening at
 * the first week drawn, the latest eight once the series is longer; a week
 * still to come is an empty column.
 */
export function homeWeeks(input: {
  rows: readonly MarketWeekRowRaw[]
  rivalAudiences: readonly string[]
  changes: readonly OurChange[]
  updates: readonly string[]
  /** Every run, any status, with its errors and window (`loadCadenceRuns`):
   *  the cadence test (`chartCadenceBroken`) and where a change made inside a
   *  run before its gather starts (`preGatherCutBefore`). The loader always
   *  passes them; a caller without them (a fixture) is not cut for cadence, and
   *  every change cuts at its own week. */
  runs?: readonly ChartRun[]
  now: string
}): HomeWeeks | null {
  const axis = homeAxis(input.now)
  // A run that gathered nothing settles no week (`chartSettlingUpdates`).
  const pooled = pooledWeekVolumes(checkedRows(input.rows.map(marketWeekRowOf)), input.rivalAudiences, axis, { now: input.now, updates: chartSettlingUpdates(input.updates, input.runs) })
  const weeks = input.runs ? withChartCadence(pooled, input.runs, input.now) : pooled
  const clean = weeksSinceOurChanges(weeks, weekRules(input.changes, axis, input.runs))
    .filter((w) => w.state === 'settled' || w.state === 'filling' || w.state === 'so_far')
  if (clean.length < WEEKS_MIN) return null
  const byWeek = new Map<string, WeekVolume>(clean.map((w) => [w.week, w]))
  const last = clean[clean.length - 1].week
  // The frame opens at the first week drawn: an earlier week is not a silent
  // market, it is a week not read one way, and it is left off the frame.
  let first = addDays(last, -7 * (WEEK_COLUMNS - 1))
  if (first < clean[0].week) first = clean[0].week
  const columns: HomeWeekColumn[] = []
  for (let w = first; columns.length < WEEK_COLUMNS; w = addDays(w, 7)) {
    const v = byWeek.get(w)
    columns.push({ week: w, label: shortDate(`${w}T00:00:00.000Z`), videos: v ? v.videos : null, comments: v ? v.comments : null, settled: v?.state === 'settled' })
  }
  return {
    columns,
    maxVideos: Math.max(...clean.map((w) => w.videos)),
    maxComments: Math.max(...clean.map((w) => w.comments)),
  }
}

/**
 * THE EMPTY FRAME (Heinrich, 1 Oct: a block without enough data shows
 * "Insufficient data", not nothing). Where `homeWeeks` finds no week to draw,
 * the block is the artboard's empty frame: `WEEK_COLUMNS` blank columns from
 * the current week on, labelled as drawn (28 Sep to 16 Nov on 1 October).
 */
export function homeWeeksFrame(now: string): HomeWeeks {
  const columns: HomeWeekColumn[] = []
  for (let w = isoWeekOf(now); columns.length < WEEK_COLUMNS; w = addDays(w, 7)) {
    columns.push({ week: w, label: shortDate(`${w}T00:00:00.000Z`), videos: null, comments: null, settled: false })
  }
  return { columns, maxVideos: 0, maxComments: 0 }
}

/** Whether "Week by week" has a week to draw; where not, it prints `INSUFFICIENT`. */
export const weeksDrawable = (weeks: HomeWeeks): boolean => weeks.columns.some((c) => c.videos != null)

/**
 * A drawn week's numbers, for its tooltip and its button's accessible name
 * (Heinrich, 5 Oct: the numbers show on hover, on a tap on a phone, and to a
 * keyboard): "Week of 28 Sep", its videos and its comments as the column
 * draws them, and "still filling" where the column is drawn faint. Read off
 * the column itself, never recomputed, in the shape the weekly bars' card
 * prints (`WeekDetail`, `weekDetail`). Null for a column with nothing drawn.
 */
export function homeWeekDetail(c: HomeWeekColumn): WeekDetail | null {
  if (c.videos == null || c.comments == null) return null
  const title = `Week of ${c.label}`
  const lines = [
    { value: fmtInt(c.videos), words: 'videos', strong: true, gap: false },
    { value: fmtInt(c.comments), words: 'comments', strong: true, gap: false },
  ]
  const state = c.settled ? null : STILL_FILLING
  return { week: c.week, title, lines, panel: [], state, label: weekDetailLabel({ title, lines, state }) }
}

// ---- 4. The tiles ------------------------------------------------------------------

/** The figure key a stored standing line prints its level under
 *  (`standingLine`: "[[subj_x_level]] of [[subj_x_n]] videos …"). */
const LEVEL_KEY_RE = /\[\[([a-z0-9_]+_level)\]\]/

/** A ready subject's level as the read printed it, or null where the read
 *  printed none (a subject that is not ready prints no figure, §0a). */
export function standingLevel(s: WeekReadStanding, figures: FigureTable): { pct: number | null; value: string } | null {
  if (s.calibration !== 'ready' || s.rung === 'none' || !s.line) return null
  const key = LEVEL_KEY_RE.exec(s.line)?.[1]
  const fig = key ? figures[key] : undefined
  if (!fig || !fig.value) return null
  if (fig.kind === 'pct') {
    const pct = Number.parseInt(String(fig.value), 10)
    return Number.isFinite(pct) ? { pct, value: String(fig.value) } : null
  }
  // Under a hundred videos the level is a count (`levelText`), and a count
  // prints as a count, with its base and no bar.
  const n = figures[key!.replace(/_level$/, '_n')]?.value
  return { pct: null, value: n ? `${fig.value} of ${n}` : String(fig.value) }
}

/** The read's ready subjects with a level, in the read's order (ready first,
 *  largest first). */
function rankedStanding(read: WeekReadData): { name: string; pct: number | null; value: string }[] {
  return read.standing.flatMap((s) => {
    const level = standingLevel(s, read.figures)
    return level ? [{ name: s.name, ...level }] : []
  })
}

/** Your market: the month's market videos, then the three biggest subjects'
 *  shares. Null without the month's count. */
export function overviewTile(read: WeekReadData | null): HomeTile | null {
  const videos = read?.version === 2 ? read.market?.month.videos : null
  if (!read || !isCount(videos) || videos === 0) return null
  return {
    key: 'overview',
    title: titleOf('overview'),
    href: hrefOf('overview'),
    big: fmtInt(videos),
    sub: `${plural(videos, 'video', 'videos')} in ${longMonth(read.month)}`,
    rows: rankedStanding(read).slice(0, TILE_ROWS).map((s) => ({ kind: 'bar', label: s.name, copy: null, pct: s.pct, value: s.value })),
  }
}

/** This week: how many findings the read printed, its dates, and the first
 *  headlines. Null where the read printed none. */
export function weekTile(read: WeekReadData | null): HomeTile | null {
  const findings = read?.findings.filter((f) => f.headline.trim()) ?? []
  if (!read || findings.length === 0) return null
  const dates = weekReadDates(read.window)
  return {
    key: 'week',
    title: titleOf('week'),
    href: hrefOf('week'),
    big: fmtInt(findings.length),
    sub: `${plural(findings.length, 'finding', 'findings')}${dates ? `, ${dates}` : ''}`,
    rows: findings.slice(0, TILE_ROWS).map((f) => ({ kind: 'text', label: f.headline.trim(), copy: 'finding', value: '' })),
  }
}

/** One category theme of the reading month, as the Conversation board reads it. */
export interface HomeTheme {
  registryId: string
  label: string
  k: number
  makerShare: number | null
  noiseShare: number | null
}

/**
 * Conversation: how many conversations the market held this week (themes on
 * `POOL_FLOOR` or more of the market's videos in the read's window), then the
 * month's three biggest, as Conversation's board ranks them: category themes
 * at `THEME_FLOOR` or more, makers' and noise-led themes set apart, each a
 * share of the category's videos in the month. Null without the count.
 */
export function voiceTile(input: {
  weekThemes: number | null
  monthThemes: readonly HomeTheme[] | null
  categoryN: number | null
}): HomeTile | null {
  if (!isCount(input.weekThemes) || input.weekThemes === 0) return null
  const n = input.categoryN
  const board = isCount(n) && n > 0
    ? [...(input.monthThemes ?? [])]
      .filter((t) => t.k >= THEME_FLOOR && t.label.trim() && segmentOf(t) == null)
      .sort((a, b) => b.k - a.k || a.registryId.localeCompare(b.registryId))
    : []
  return {
    key: 'voice',
    title: titleOf('voice'),
    href: hrefOf('voice'),
    big: fmtInt(input.weekThemes),
    sub: `${plural(input.weekThemes, 'conversation', 'conversations')} this week`,
    rows: board.slice(0, TILE_ROWS).map((t) => {
      const share = shareOf(t.k, n as number)
      return { kind: 'bar', label: t.label.trim(), copy: 'theme', pct: share.pct, value: share.value }
    }),
  }
}

/** A share of a base as the pages print it: a whole percent at a hundred
 *  videos or more, the count and its base under (rule 4). */
function shareOf(k: number, n: number): { pct: number | null; value: string } {
  if (n < 100) return { pct: null, value: `${fmtInt(k)} of ${fmtInt(n)}` }
  const pct = Math.round((k / n) * 100)
  return { pct, value: `${pct}%` }
}

/** The brands a "Named most" row lists (the artboard: two). */
export const NAMED_MOST = 2

/**
 * Competitive: the brands you track, and the ones the market named most,
 * off Competitive's own "Brands in your market" (`loadBrandList`, the page's
 * reader and its `brandList`, over the page's reading month; the backfill, 1
 * Oct evening). Unprompted counts, most first, ties by name: what the page
 * lists at its top. The artboard's "Named most this week" needs a week's
 * reading of who was named, and none exists (a mention carries the month it
 * was written in, never the week), so the row reads the month; its
 * "Compared on" row has no source that says what brands are compared on, so
 * it is not drawn (a row that cannot be built is dropped, Heinrich, 1 Oct).
 * Null where no brand is tracked.
 */
export function competitiveTile(brands: number | null, named: Pick<BrandList, 'month' | 'rows'> | null = null): HomeTile | null {
  if (!isCount(brands) || brands === 0) return null
  const top = (named?.rows ?? []).filter((r) => r.k > 0).slice(0, NAMED_MOST)
  return {
    key: 'competitive',
    title: titleOf('competitive'),
    href: hrefOf('competitive'),
    big: fmtInt(brands),
    sub: `${plural(brands, 'brand', 'brands')} you track`,
    rows: named && top.length > 0
      ? [{ kind: 'text', label: `Named most in ${longMonth(named.month)}`, copy: null, value: top.map((r) => r.label).join(', ') }]
      : [],
  }
}

/** Subjects: how many you follow, the biggest in the read's month, and the
 *  one you added most recently. Null where you follow none.
 *
 *  "Biggest this month" only while the read's month is the calendar month;
 *  "Biggest in September" once it is not (fresh review B2, `monthPhrase`): a
 *  week crossing into October is September's, and reaches the page in
 *  October. */
export function subjectsTile(input: {
  subjects: readonly { name: string; named_at: string | null }[] | null
  read: WeekReadData | null
  now: string
}): HomeTile | null {
  const subjects = input.subjects ?? []
  if (subjects.length === 0) return null
  const rows: HomeTileRow[] = []
  const biggest = input.read ? rankedStanding(input.read)[0] : undefined
  if (biggest) rows.push({ kind: 'text', label: `Biggest ${monthPhrase(input.read!.month, input.now)}`, copy: null, value: `${biggest.name}, ${biggest.value}` })
  const latest = subjects
    .filter((s) => s.named_at && Number.isFinite(Date.parse(s.named_at)))
    .sort((a, b) => Date.parse(b.named_at!) - Date.parse(a.named_at!) || a.name.localeCompare(b.name))[0]
  if (latest) rows.push({ kind: 'text', label: 'Added most recently', copy: null, value: `${latest.name}, ${shortDate(latest.named_at!)}` })
  return {
    key: 'subjects',
    title: titleOf('subjects'),
    href: hrefOf('subjects'),
    big: fmtInt(subjects.length),
    sub: `${plural(subjects.length, 'subject', 'subjects')} you follow`,
    rows,
  }
}

/** The artboard's words for a count of none in "Moves you dated". */
export const MOVES_NONE = 'none yet'

/** Your moves: your own posts published in the month, the moves worth
 *  considering and the moves you dated. Null where none of the three was read
 *  or all three are none. */
export function movesTile(input: {
  month: string
  posts: number | null
  advice: number | null
  moves: number | null
}): HomeTile | null {
  const { posts, advice, moves } = input
  if (!isCount(posts)) return null
  if (posts === 0 && !(isCount(advice) && advice > 0) && !(isCount(moves) && moves > 0)) return null
  const rows: HomeTileRow[] = []
  if (isCount(advice)) rows.push({ kind: 'text', label: 'Moves worth considering', copy: null, value: fmtInt(advice) })
  if (isCount(moves)) rows.push({ kind: 'text', label: 'Moves you dated', copy: null, value: moves === 0 ? MOVES_NONE : fmtInt(moves) })
  return {
    key: 'market',
    title: titleOf('market'),
    href: hrefOf('market'),
    big: fmtInt(posts),
    sub: `${plural(posts, 'post', 'posts')} published in ${longMonth(input.month)}`,
    rows,
  }
}

/** Heinrich's words (1 Oct) for a tile without enough data to show. */
export const INSUFFICIENT = 'Insufficient data'

/**
 * ALL SIX TILES, in the artboard's order (Heinrich, 1 Oct: "a tile without
 * enough data shows the tile with the line 'Insufficient data' instead of
 * hiding"). A tile whose fact was not read is its title and its link, with no
 * number and no rows; the page prints `INSUFFICIENT` where the rows go, and
 * does the same for a tile that has its number but no rows (Competitive's "9
 * brands you track", until its brand rows can be built honestly).
 */
export function homeTiles(tiles: readonly (HomeTile | null)[]): HomeTile[] {
  const present = tiles.filter((t): t is HomeTile => t != null)
  return HOME_TILES.map(({ key }) =>
    present.find((t) => t.key === key) ?? { key, title: titleOf(key), href: hrefOf(key), big: '', sub: '', rows: [] })
}

/** Whether a tile prints `INSUFFICIENT` in its rows' place. */
export const tileInsufficient = (tile: Pick<HomeTile, 'rows'>): boolean => tile.rows.length === 0

/** "Moves worth considering": the number of ideas Your moves' short list
 *  draws (`adviceShortlist`, the decided ones and a handful of the current
 *  undecided ones), counted without the embedding fold the page adds, which
 *  can only merge two current rows into one. */
export function adviceCount(copies: readonly RecCopy[], decisions: RecDecision[] | null): number {
  const rows = buildAdviceRows(copies, decisions)
  return adviceShortlist(rows, null).lineages.length
}

// ---- The reads ---------------------------------------------------------------------

export interface HomeSession {
  supabase: SupabaseClient
  clientId: string
}

/** The tenant's PUBLISHED weekly read (`loadPublishedWeekRead`: the newest
 *  ready one, as soon as the run writes it), or null. Service role:
 *  `week_reads` is never read by a tenant session (review L2); the tenant id
 *  is the session's. */
async function loadLatestRead(admin: SupabaseClient, clientId: string): Promise<{ runId: string; data: WeekReadData } | null> {
  const read = await loadPublishedWeekRead(admin, clientId)
  return read ? { runId: read.runId, data: read.data } : null
}

/** A failed read is logged and loses its block, never the page. */
function soft<T>(what: string, p: Promise<T>): Promise<T | null> {
  return p.catch((error: unknown) => {
    console.error(`[pages] home.${what}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  })
}

async function loadActiveSubjects(supabase: SupabaseClient, clientId: string): Promise<{ name: string; named_at: string | null }[]> {
  const res = await supabase.from('subjects').select('name, named_at').eq('client_id', clientId).eq('status', 'active')
  if (res.error) throw new Error(`subjects: ${res.error.message}`)
  return (res.data ?? []) as { name: string; named_at: string | null }[]
}

async function loadAdviceCount(supabase: SupabaseClient, clientId: string): Promise<number> {
  const [copies, decisions] = await Promise.all([
    selectAll<RecCopy>(() =>
      supabase.from('recommendations')
        .select('id, lineage_id, title, type, status, priority, created_at, run_id')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
    ),
    selectAll<RecDecision>(() =>
      supabase.from(REC_DECISIONS_TABLE)
        .select('id, lineage_id, status, decided_at')
        .eq('client_id', clientId)
        .order('decided_at', { ascending: false })
        .order('id', { ascending: false }),
    ).catch((error: unknown) => {
      if (isMissingRecDecisions(error)) return null
      throw error
    }),
  ])
  return adviceCount(copies, decisions)
}

async function countMoves(supabase: SupabaseClient, clientId: string): Promise<number> {
  const res = await supabase.from(TABLE_MOVES).select('id', { count: 'exact', head: true })
    .eq('client_id', clientId).neq('status', 'dropped')
  if (res.error) throw new Error(`moves: ${res.error.message}`)
  return res.count ?? 0
}

async function countOwnPosts(supabase: SupabaseClient, clientId: string, month: string): Promise<number> {
  const res = await supabase.from('videos').select('id', { count: 'exact', head: true })
    .eq('client_id', clientId).eq('is_client', true)
    .gte('upload_date', month.slice(0, 10)).lt('upload_date', nextMonth(month).slice(0, 10))
  if (res.error) throw new Error(`videos: ${res.error.message}`)
  return res.count ?? 0
}

/** Conversations this week: themes on `POOL_FLOOR` or more of the market's
 *  videos in the read's window, under the read's own clustering (the pool's
 *  read, lib/written/pool.ts). */
async function countWeekThemes(
  reading: SupabaseClient,
  clientId: string,
  a: { runId: string; window: { from: string; to: string }; rivals: readonly string[] },
): Promise<number | null> {
  const read = await loadWindowReading(reading, clientId, { from: a.window.from, to: a.window.to, runId: a.runId, audiences: marketAudiences(a.rivals) })
  if (!read.themes) return null
  const videos = new Map<string, number>()
  for (const t of read.themes) videos.set(t.theme_id, (videos.get(t.theme_id) ?? 0) + Number(t.videos))
  return [...videos.values()].filter((v) => v >= POOL_FLOOR).length
}

/** The month's category themes at the board's floor, their labels on the
 *  read's run, their maker and noise shares, and the category's videos. */
async function loadMonthThemes(
  reading: SupabaseClient,
  clientId: string,
  a: { month: string; runId: string },
): Promise<{ themes: HomeTheme[]; categoryN: number | null }> {
  const month = a.month.slice(0, 10)
  const [rowsRes, denRes, obsRes, sharesRes] = await Promise.all([
    reading.from('month_theme_readings').select('theme_id, videos')
      .eq('client_id', clientId).eq('month', month).eq('audience', INDUSTRY_AUDIENCE).gte('videos', THEME_FLOOR)
      .order('videos', { ascending: false }).order('theme_id', { ascending: true }).limit(40),
    reading.from('month_denominators').select('videos')
      .eq('client_id', clientId).eq('month', month).eq('audience', INDUSTRY_AUDIENCE).maybeSingle(),
    selectAll<{ theme_id: string; label: string | null }>(() =>
      reading.from('theme_observations').select('theme_id, label')
        .eq('client_id', clientId).eq('run_id', a.runId).order('theme_id', { ascending: true })),
    reading.rpc('theme_maker_shares', { p_client: clientId, p_month: month, p_run: a.runId }),
  ])
  if (rowsRes.error) throw new Error(`month_theme_readings: ${rowsRes.error.message}`)
  if (denRes.error) throw new Error(`month_denominators: ${denRes.error.message}`)
  const labels = new Map(obsRes.map((o) => [String(o.theme_id), (o.label ?? '').trim()]))
  // A share nobody measured is null, and then nothing is set apart on it
  // (`segmentOf`): the board does the same.
  const shares = new Map<string, { maker: number | null; noise: number | null }>()
  if (!sharesRes.error && Array.isArray(sharesRes.data)) {
    for (const r of sharesRes.data as { registry_id: string; videos: number; maker: number; noise: number }[]) {
      const v = Number(r.videos)
      const part = (x: unknown): number | null => {
        const m = Number(x)
        return Number.isFinite(v) && v > 0 && Number.isFinite(m) && m >= 0 && m <= v ? m / v : null
      }
      shares.set(String(r.registry_id), { maker: part(r.maker), noise: part(r.noise) })
    }
  } else if (sharesRes.error) {
    console.error(`[pages] home.makerShares: ${sharesRes.error.message}`)
  }
  const themes = ((rowsRes.data ?? []) as { theme_id: string; videos: number }[]).map((r) => {
    const id = String(r.theme_id)
    return { registryId: id, label: labels.get(id) ?? '', k: Number(r.videos), makerShare: shares.get(id)?.maker ?? null, noiseShare: shares.get(id)?.noise ?? null }
  })
  const n = (denRes.data as { videos?: number } | null)?.videos
  return { themes, categoryN: typeof n === 'number' ? n : n != null ? Number(n) : null }
}

/** `market_week_volumes` over the chart's weeks. */
async function loadWeekRows(reading: SupabaseClient, clientId: string, now: string): Promise<MarketWeekRowRaw[]> {
  const to = addDays(isoWeekOf(now), 7)
  const res = await reading.rpc('market_week_volumes', { p_client: clientId, p_from: homeAxis(now)[0], p_to: to })
  if (res.error) throw new Error(`market_week_volumes: ${res.error.message}`)
  return (res.data ?? []) as MarketWeekRowRaw[]
}

/**
 * Everything the Dashboard prints, in one wave. `now` is injectable for a
 * script; the page passes nothing.
 */
export async function loadHome(session: HomeSession, opts: { now?: string } = {}): Promise<HomeData> {
  const { supabase, clientId } = session
  const now = opts.now ?? new Date().toISOString()
  const reading = readingHandle(clientId).client

  const readAhead = soft('read', loadLatestRead(reading, clientId))
  const rivalsAhead = soft('rivals', loadTrackedRivals(supabase, clientId))
  const subjectsAhead = soft('subjects', loadActiveSubjects(supabase, clientId))
  const adviceAhead = soft('advice', loadAdviceCount(supabase, clientId))
  const movesAhead = soft('moves', countMoves(supabase, clientId))
  const weeksAhead = soft('weeks', Promise.all([
    loadWeekRows(reading, clientId, now),
    loadDeliveredRuns(supabase, clientId),
    loadChanges(reading, clientId),
    rivalsAhead,
    loadCadenceRuns(supabase, clientId),
  ]).then(([rows, runs, changeRows, rivals, cadenceRuns]) => homeWeeks({
    rows,
    rivalAudiences: marketRivalAudiences(rivals ?? []),
    changes: ourChangesWithoutGatherFlags(changeRows.filter((r) => !isFailOpenFix(r))),
    updates: runs.map(updateInstant),
    runs: cadenceRuns,
    now,
  })))

  // Competitive's "Brands in your market", over the page's own reading month
  // (`loadReadingMonth`, the month every reading page reads).
  const namedAhead = soft('named', Promise.all([
    loadReadingMonth(supabase, readingHandle(clientId), now),
    rivalsAhead,
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
  ]).then(([rm, rivals, client]) => rm && rivals
    ? loadBrandList({
        db: reading,
        clientId,
        month: rm.month,
        rivals,
        client: ((client.data as { company_name?: string | null } | null)?.company_name ?? '').trim() || 'you',
      })
    : null))

  // The reads that need the latest read's month, run and window.
  const read = await readAhead
  const month = read?.data.month ?? `${now.slice(0, 7)}-01`
  const postsAhead = soft('posts', countOwnPosts(supabase, clientId, month))
  const voiceAhead = read
    ? soft('voice', Promise.all([
      rivalsAhead.then((rivals) => countWeekThemes(reading, clientId, {
        runId: read.runId, window: read.data.window, rivals: marketRivalAudiences(rivals ?? []),
      })),
      loadMonthThemes(reading, clientId, { month: read.data.month, runId: read.runId }),
    ]).then(([weekThemes, m]) => voiceTile({ weekThemes, monthThemes: m.themes, categoryN: m.categoryN })))
    : Promise.resolve(null)

  const [rivals, subjects, advice, moves, weeks, posts, voice, named] = await Promise.all([
    rivalsAhead, subjectsAhead, adviceAhead, movesAhead, weeksAhead, postsAhead, voiceAhead, namedAhead,
  ])
  const data = read?.data ?? null
  const tracked = rivals ? rivals.filter((r) => r.retiredAt == null).length : null

  return {
    numbers: homeNumbers(data),
    weeks: weeks ?? homeWeeksFrame(now),
    tiles: homeTiles([
      overviewTile(data),
      weekTile(data),
      voice,
      competitiveTile(tracked, named),
      subjectsTile({ subjects, read: data, now }),
      movesTile({ month, posts, advice, moves }),
    ]),
  }
}
