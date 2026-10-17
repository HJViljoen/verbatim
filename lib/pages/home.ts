import type { SupabaseClient } from '@supabase/supabase-js'

import { STILL_FILLING, weekDetailLabel, type WeekDetail } from '../charts/week-bars'
import { fmtInt, shortDate } from '../format'
import { surface, type NavKey } from '../nav'
import { loadTrackedRivals, type TrackedRival } from '../rivals'
import { loadChanges } from '../reading/read'
import { loadCadenceRuns, loadDeliveredRuns, marketRivalAudiences, updateInstant } from '../reading/reading-view'
import { chartSettlingUpdates, withChartCadence, type ChartRun } from '../reading/week-line'
import { ourChangesWithoutGatherFlags } from '../reading/gather-flags'
import {
  addDays, checkedRows, isoWeekOf, marketWeekRowOf, pooledWeekVolumes, weekRules, weeksSinceOurChanges,
  type MarketWeekRowRaw, type WeekVolume,
} from '../reading/weeks'
import { isFailOpenFix, type OurChange } from '../reading/comparability'

// THE DASHBOARD'S WEEK BY WEEK (`/dashboard`, nav key `home`; pages build, HOME
// package, 1 Oct), and the map of its tiles to their pages.
//
// Design v2 (depth plan T8, board E1-Dashboard) rebuilt the page itself:
// lib/pages/v2/home.ts reads it (each page's light `top<Page>()` beside this
// file's weekly chart) and components/pages/v2/home draws it. What stays here
// is the part the rebuild keeps EXACTLY, because Market's rail draws the same
// chart (lib/pages/v2/market.ts) and the cut and cadence rules are pinned by
// AGENTS.md ("The week chart's cut and cadence"):
//   · the market's weekly videos and comments, only weeks read one way, from
//     the first such week the data shows (`homeAxis`, `weeksSinceOurChanges`;
//     never a constant); a week still filling is drawn faint; until one such
//     week exists the block is the empty frame with "Insufficient data"
//     (Heinrich, 1 Oct);
//   · a drawn week's numbers, for its hover, focus and tap (`homeWeekDetail`).
//
// NOT THE STORED `dashboard` PAGE KEY. That key is a stored contract (old
// snapshots, a share link, a schedule) and stays in the registry; this page
// has no page key and its own files (page review §5.2).
//
// PURE BUILDERS, EXPORTED. `homeWeeks` takes rows and returns what prints, so
// lib/pages/home.test.ts pins every rule without a database.

// ---- What the page prints -------------------------------------------------------

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

// ---- The tiles and their pages ------------------------------------------------------

/** The Dashboard's tiles (board E1-Dashboard), in the board's order: the
 *  market's week, the market's size this week, then Voices, Your products and
 *  Content, then Your moves. The Agent box sits beside Your moves and is not
 *  a page's tile. */
export type HomeTileKey = 'market' | 'week' | 'voices' | 'products' | 'content' | 'moves'

/** The page each tile opens: its address in lib/nav.ts, so a route that moves
 *  moves the link with it. Each tile's own link opens what it names: a page
 *  on Market (a conversation's or a subject's, 17 Oct), or that page's panel
 *  in place (Voices `?group=`, Your products `?product=` or `?group=`,
 *  Content `?idea=`, Your moves `?advice=`); this is the page under it, where
 *  the tile has nothing to open. "Your market this week" is the
 *  market's own size, so Market. */
export const TILE_NAV: Readonly<Record<HomeTileKey, NavKey>> = {
  market: 'market',
  week: 'market',
  voices: 'voices',
  products: 'products',
  content: 'content',
  moves: 'moves',
}

/** The page under a tile, where it has no panel to open. */
export const tileHref = (key: HomeTileKey): string => surface(TILE_NAV[key]).href

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

// ---- Week by week -------------------------------------------------------------

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
 * The chart frames the last `WEEK_COLUMNS` weeks ENDING AT THE CURRENT WEEK
 * (`homeAxis`; Heinrich, 5 Oct: "have the bars go all the way to the right"):
 * the newest week sits on the right edge, and a week not drawn (before the
 * series could be read one way) is an empty column on the left.
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
  const columns: HomeWeekColumn[] = axis.map((w) => {
    const v = byWeek.get(w)
    return { week: w, label: shortDate(`${w}T00:00:00.000Z`), videos: v ? v.videos : null, comments: v ? v.comments : null, settled: v?.state === 'settled' }
  })
  return {
    columns,
    maxVideos: Math.max(...clean.map((w) => w.videos)),
    maxComments: Math.max(...clean.map((w) => w.comments)),
  }
}

/**
 * THE EMPTY FRAME (Heinrich, 1 Oct: a block without enough data shows
 * "Insufficient data", not nothing). Where `homeWeeks` finds no week to draw,
 * the block is the same frame the bars use: the last `WEEK_COLUMNS` weeks
 * ending at the current week, blank and labelled as drawn.
 */
export function homeWeeksFrame(now: string): HomeWeeks {
  const columns: HomeWeekColumn[] = homeAxis(now).map((w) => ({ week: w, label: shortDate(`${w}T00:00:00.000Z`), videos: null, comments: null, settled: false }))
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

/** Heinrich's words (1 Oct) for a block without enough data to show. */
export const INSUFFICIENT = 'Insufficient data'

/**
 * A weekly volume read that FAILED (`market_week_volumes` or one of its
 * companions threw), as against one that read and found too few clean weeks
 * (`homeWeeks` null, which keeps `INSUFFICIENT`). Phase 4 fix round: both
 * printed "Insufficient data", a failure shown as an absence; a reader carries
 * this marker instead of null so a surface can say the read failed.
 */
export const WEEKS_FAILED = { state: 'failed' } as const
export type WeeksFailed = typeof WEEKS_FAILED
/** The weekly volume as a surface holds it: the chart, too few clean weeks
 *  (null), or a read that failed. */
export type WeeksRead = HomeWeeks | WeeksFailed | null
export const weeksFailed = (w: WeeksRead | undefined): w is WeeksFailed =>
  w != null && (w as { state?: unknown }).state === 'failed'

// ---- The reads ---------------------------------------------------------------------

/** `market_week_volumes` over the chart's weeks. */
export async function loadWeekRows(reading: SupabaseClient, clientId: string, now: string): Promise<MarketWeekRowRaw[]> {
  const to = addDays(isoWeekOf(now), 7)
  const res = await reading.rpc('market_week_volumes', { p_client: clientId, p_from: homeAxis(now)[0], p_to: to })
  if (res.error) throw new Error(`market_week_volumes: ${res.error.message}`)
  return (res.data ?? []) as MarketWeekRowRaw[]
}

/**
 * Week by week, read: the weeks' rows, the delivered runs, our change log,
 * the tracked rivals and every run for the cadence, in one wave. The runs
 * and the cadence runs are memoised on the session client and the change log
 * on the reading client (lib/reading/memo.ts), so a page that reads them for
 * another block too (the Dashboard's Market tile) reads each once. `rivals`
 * is the caller's own read where it holds one. Null where no week may be
 * drawn; a read that fails throws, and the caller loses this block alone.
 */
export async function loadHomeWeeks(
  session: { supabase: SupabaseClient; clientId: string; reading: SupabaseClient; rivals?: Promise<TrackedRival[] | null> },
  now: string,
): Promise<HomeWeeks | null> {
  const { supabase, clientId, reading } = session
  const [rows, runs, changeRows, rivals, cadenceRuns] = await Promise.all([
    loadWeekRows(reading, clientId, now),
    loadDeliveredRuns(supabase, clientId),
    loadChanges(reading, clientId),
    session.rivals ?? loadTrackedRivals(supabase, clientId),
    loadCadenceRuns(supabase, clientId),
  ])
  return homeWeeks({
    rows,
    rivalAudiences: marketRivalAudiences(rivals ?? []),
    changes: ourChangesWithoutGatherFlags(changeRows.filter((r) => !isFailOpenFix(r))),
    updates: runs.map(updateInstant),
    runs: cadenceRuns,
    now,
  })
}
