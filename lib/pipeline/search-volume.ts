/**
 * THE SEARCH VOLUME CHECK (24 Nov 2026): a platform's searches finding far
 * fewer videos than they usually do for this tenant, as a run WARNING.
 *
 * From about 17 Nov Instagram's hashtag pages stopped handing the scraper a
 * dense, recent feed: `apify/instagram-scraper` in `posts` mode went from its
 * cap of 70 a search to 1 to 9, on every build tried (0.0.844, the build of
 * the last good run, included) and in the sister `instagram-hashtag-scraper`,
 * whose 70 now span nine years. Every call SUCCEEDED and every item was a real
 * post, so nothing failed and nothing said so: Össur's Instagram searches
 * found 17 videos on 22 Nov against about 250, Sealand's 88 on 18 Nov and 54
 * on 22 Nov against about 520, and both runs closed `completed` with no
 * warning.
 *
 * THE RULE (`searchVolumeCollapse`): a platform warns when this run's
 * searches found fewer than SEARCH_VOLUME_COLLAPSE_RATIO (a quarter) of the
 * MEDIAN of the same platform's last SEARCH_VOLUME_HISTORY_RUNS comparable
 * runs. It says nothing with fewer than SEARCH_VOLUME_MIN_HISTORY of them, or
 * where that median is under SEARCH_VOLUME_MIN_MEDIAN, so a small tenant or a
 * new platform does not flap. "Found" is `keyword_performance.videos_found`
 * summed over the platform's terms (each term's distinct videos, the reels and
 * posts halves of an Instagram term together), which is what the gate writes,
 * and this run's figure is counted the same way off the memoised searches
 * (`searchFound`), never read back.
 *
 * COMPARABLE (`comparableHistory`): another run of the tenant that searched
 * the platform (it has `keyword_performance` rows for it), is not running,
 * found more than nothing there (a run whose searches all failed is an outage
 * its own errors counted, not a level), was not capped (`videoLimit` /
 * `maxVideos`, which shrink the search) and whose window is within a factor of
 * SEARCH_VOLUME_WINDOW_FACTOR of this run's (a monthly or 21-day catch-up run
 * is not a week). This run is judged only when it is uncapped and windowed.
 *
 * A WARNING, NOT AN ERROR: nothing failed, so the status, `errors` and every
 * rule that judges a run are unchanged (`lib/pipeline/run-warnings.ts`). It is
 * STALE-DATA, so the run's one alert carries it, because the week's figures
 * for that platform rest on a fraction of their usual videos.
 *
 * ONE SMALL READ a platform (`loadSearchHistory`): the tenant's last
 * SEARCH_VOLUME_FETCH_RUNS runs with their `keyword_performance` rows for the
 * platform embedded, one PostgREST statement (`pipeline_runs` by client_id,
 * `keyword_performance` by run_id), inside the platform's existing
 * `gate:<platform>` step, so no step id moves. It never throws and is capped
 * at SEARCH_VOLUME_READ_MS: a failed or slow read is no check, logged.
 *
 * A COLLAPSE THAT LASTS GOES QUIET: collapsed runs join the baseline, so the
 * warning fires for one or two runs and then stops (simulated at the 22 Nov
 * level: Sealand silent from 6 Dec, Ossur from 13 Dec). Silence after a
 * warning is not a recovery; compare the found counts.
 */

import { platformLabel } from '../format'
import type { createAdminClient } from '../supabase-admin'
import type { RunWindow } from './window'

/** The comparable runs the median is taken over, newest first. */
export const SEARCH_VOLUME_HISTORY_RUNS = 4
/** Fewer comparable runs than this and the check says nothing. */
export const SEARCH_VOLUME_MIN_HISTORY = 3
/** A median under this is too small a volume to judge a drop on. */
export const SEARCH_VOLUME_MIN_MEDIAN = 50
/** Found under this share of the median warns. */
export const SEARCH_VOLUME_COLLAPSE_RATIO = 0.25
/** A run compares when its window is within this factor of this run's. */
export const SEARCH_VOLUME_WINDOW_FACTOR = 2
/** Runs read, so that up to HISTORY_RUNS survive the comparable filter. */
export const SEARCH_VOLUME_FETCH_RUNS = 8
/** The history read's own deadline (the gate step's 300 s cap is shared). */
export const SEARCH_VOLUME_READ_MS = 10_000

const DAY_MS = 86_400_000

/** One earlier run's volume on the platform, as `loadSearchHistory` reads it. */
export interface SearchHistoryRun {
  runId: string
  startedAt: string | null
  /** Its window in days; null on a baseline (unwindowed) run. */
  windowDays: number | null
  /** Run with `videoLimit` or `maxVideos`. */
  capped: boolean
  /** Σ videos_found over the platform's terms. */
  found: number
}

export interface SearchVolumeCollapse {
  platform: string
  found: number
  /** The median of `history`, unrounded. */
  median: number
  /** The comparable runs it was taken over. */
  runs: number
  /** found / median. */
  ratio: number
}

/** The run window in days, to a tenth (a week's window ends seconds short of
 *  seven days: 15 Nov 04:00:30 to 22 Nov 04:00:24), or null when it has no
 *  lower bound. PURE. */
export function windowDays(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null
  const days = Math.round(((Date.parse(end) - Date.parse(start)) / DAY_MS) * 10) / 10
  return Number.isFinite(days) && days > 0 ? days : null
}

/** Does this run get judged at all: uncapped and windowed. PURE. */
export function searchVolumeJudged(
  options: { videoLimit?: unknown; maxVideos?: unknown },
  window: Pick<RunWindow, 'start' | 'end'> | null | undefined,
): boolean {
  return options.videoLimit == null && options.maxVideos == null && windowDays(window?.start, window?.end) != null
}

/**
 * This run's found on one platform: each term's distinct videos, summed over
 * the terms, the variants of a term (Instagram's reels and posts) together.
 * The figure the gate writes as `keyword_performance.videos_found`. PURE.
 */
export function searchFound(searches: readonly { keyword: string; videos: readonly { video_id: string }[] }[]): number {
  const byTerm = new Map<string, Set<string>>()
  for (const s of searches) {
    const ids = byTerm.get(s.keyword) ?? new Set<string>()
    for (const v of s.videos) ids.add(v.video_id)
    byTerm.set(s.keyword, ids)
  }
  let total = 0
  for (const ids of byTerm.values()) total += ids.size
  return total
}

/** The comparable runs' found, newest first, at most HISTORY_RUNS. PURE. */
export function comparableHistory(runs: readonly SearchHistoryRun[], currentWindowDays: number): number[] {
  const lo = currentWindowDays / SEARCH_VOLUME_WINDOW_FACTOR
  const hi = currentWindowDays * SEARCH_VOLUME_WINDOW_FACTOR
  return runs
    .filter((r) => !r.capped && r.found > 0 && r.windowDays != null && r.windowDays >= lo && r.windowDays <= hi)
    .slice(0, SEARCH_VOLUME_HISTORY_RUNS)
    .map((r) => r.found)
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** The collapse, or null: too little history, too small a median, or not
 *  under a quarter of it. PURE. */
export function searchVolumeCollapse(
  platform: string,
  found: number,
  history: readonly number[] | null | undefined,
): SearchVolumeCollapse | null {
  if (!history || history.length < SEARCH_VOLUME_MIN_HISTORY) return null
  const m = median(history)
  if (m < SEARCH_VOLUME_MIN_MEDIAN) return null
  if (found >= m * SEARCH_VOLUME_COLLAPSE_RATIO) return null
  return { platform, found, median: m, runs: history.length, ratio: found / m }
}

/** The warning's cause: the platform and the numbers. PURE. */
export function searchVolumeCause(c: SearchVolumeCollapse): string {
  const videos = c.found === 1 ? 'video' : 'videos'
  return `${platformLabel(c.platform)} searches found ${c.found} ${videos} this update, ${Math.round(c.ratio * 100)}% of their median of ${Math.round(c.median)} over the last ${c.runs} comparable updates`
}

interface HistoryRow {
  id: string
  started_at: string | null
  window_start: string | null
  window_end: string | null
  options: unknown
  keyword_performance: { videos_found: number | null }[] | null
}

/** The embedded rows as history, in the order read. PURE. */
export function historyFromRows(rows: readonly HistoryRow[]): SearchHistoryRun[] {
  return rows.map((r) => {
    const o = (r.options && typeof r.options === 'object' ? r.options : {}) as { videoLimit?: unknown; maxVideos?: unknown }
    return {
      runId: r.id,
      startedAt: r.started_at,
      windowDays: windowDays(r.window_start, r.window_end),
      capped: o.videoLimit != null || o.maxVideos != null,
      found: (r.keyword_performance ?? []).reduce((n, k) => n + (Number(k.videos_found) || 0), 0),
    }
  })
}

/**
 * The platform's comparable history for this run: ONE read, never a throw.
 * Null when it could not be read (logged), which is no check.
 */
export async function loadSearchHistory(
  admin: ReturnType<typeof createAdminClient>,
  args: { clientId: string; runId: string; platform: string; window: Pick<RunWindow, 'start' | 'end'> | null | undefined },
): Promise<number[] | null> {
  const days = windowDays(args.window?.start, args.window?.end)
  if (days == null) return null
  try {
    // A plain read, never `selectAll`: its `range()` overwrites the limit,
    // which is the point here (the anomaly-check precedent).
    const { data, error } = await admin
      .from('pipeline_runs')
      .select('id, started_at, window_start, window_end, options, keyword_performance!inner(videos_found)')
      .eq('client_id', args.clientId)
      .neq('id', args.runId)
      .in('status', ['completed', 'partial', 'failed'])
      .eq('keyword_performance.platform', args.platform)
      .order('started_at', { ascending: false })
      .limit(SEARCH_VOLUME_FETCH_RUNS)
      // The read sits after the gate's paid classification inside one step,
      // so it must never be what pushes that step to its cap: an abort comes
      // back as `error` (postgrest-js does not throw) and is no check.
      .abortSignal(AbortSignal.timeout(SEARCH_VOLUME_READ_MS))
    if (error) throw new Error(error.message)
    return comparableHistory(historyFromRows((data ?? []) as unknown as HistoryRow[]), days)
  } catch (e) {
    console.warn(`[search-volume] ${args.platform}: history not read, so no volume check this run: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}
