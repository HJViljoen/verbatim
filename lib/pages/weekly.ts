import type { SupabaseClient } from '@supabase/supabase-js'
import type { Scope } from '../renderables/types'
import type { MonthStatus } from '../reading/types'
import type { ForSalesData } from '../blocks/for-sales'
import { barLine } from '../reading/reading-month'
import { monthStartOf } from '../reading/month-key'
import { loadOverview, type OverviewData, type SubjectsBlock } from './overview'
import { loadWeekParts, marketSubjectArrivals, type HeardBlock, type MarketCameIn, type RepliesBlock } from './week'
import { loadMarketRivalAudiences } from '../reading/reading-view'
import { loadWhatWeChanged } from '../settings/what-we-changed-load'
import type { LedgerLine } from './overview-market/change'

/**
 * The weekly report's loader: "your market this week" (market-first WP3.7,
 * plan §2.9; the approved preview's WeeklyReport).
 *
 * THE REPORT IS THE PAGES' OWN READING, NOT A SECOND ONE. It reads the READING
 * MONTH (decision A), as every page does since WP1.2; the calendar-month pin
 * the weekly kept through deploys 1 and 2 (its preview was the parity gate) is
 * gone. What it prints comes from two pages' builders:
 *   · Your market's (`loadOverview`, built as the front page on the reading
 *     month): the market's level (WR1), the market by subject (WR2), what the
 *     market talked about (WR3) and what changed, and what is ours (WR6);
 *   · This week's (`loadWeekParts`, the page's own builders over the same
 *     update): what the update brought in (WR1), the themes it first heard
 *     (WR3's "New with this update"), For sales (WR4) and Worth a reply (WR5).
 * So the weekly and This week print the same counts for one update (WP3.7's
 * done-when), and the weekly and the front page the same month.
 *
 * AND THE DATED LIST OF OUR CHANGES (WR6): Settings › What we changed's own
 * loader, filtered to the changes made in the reading month.
 *
 * WHAT DEGRADES, AND HOW. Every part is optional in the shape: a read that
 * fails leaves its part null and the section says it is not counted, never a
 * zero; a tenant with nothing delivered has no report (null).
 */

export interface WeeklyData {
  brand: string
  /** The reading month (decision A): the month every section reads. */
  month: string
  monthStatus: MonthStatus
  /** The instant this reading was taken. */
  readingAt: string
  runId: string | null
  /** The update's frozen window (`pipeline_runs.window_start/_end`). */
  window: { from: string; to: string } | null
  /** This update's date and the one delivered before it. */
  update: { date: string | null; previous: string | null }
  /** The masthead's one line (25 Sep rulings): "as at the 20 Sep update ·
   *  next update Sun 27 Sep", or "... · updates paused". */
  barLine: string | null
  /** WR1's level: the reading month's market (the category and the brands you
   *  track, pooled; decision E). Null where the month rows cannot be read. */
  market: { videos: number | null; comments: number | null } | null
  /** WR1: what the update brought in, This week's `marketCameIn` (the same
   *  counts the page prints). Its month is the one the window ends in. */
  cameIn: MarketCameIn | null
  /** The front page on the reading month: WR2's subjects, WR3's board, WR6's
   *  change block. */
  overview: OverviewData
  /** WR2's "With this update", by subject id: the update's days in the
   *  reading month, on the market. Null where no row can print one, or the
   *  read cannot answer. */
  contributions: Record<string, number> | null
  /** WR3's "New with this update": This week's heard block. */
  heard: HeardBlock | null
  /** WR4: This week's For sales, over the update's window. */
  sales: ForSalesData
  /** WR5: This week's reply queue. */
  replies: RepliesBlock
  /** WR6: our changes made in the reading month, newest first, each with its
   *  reach; null where the change log cannot be read. */
  changes: LedgerLine[] | null
}

/**
 * The weekly report, for one tenant. Null is the first-update empty state: a
 * tenant with nothing delivered has no week to report.
 */
export async function loadWeekly(scope: Scope): Promise<WeeklyData | null> {
  const supabase = scope.supabase as SupabaseClient
  const readingAt = new Date().toISOString()
  // THE READING MONTH (decision A), as the front page reads it.
  const overview = await loadOverview(scope, { marketFront: true })
  if (!overview) return null
  const month = overview.month
  const [parts, changed] = await Promise.all([
    loadWeekParts(scope),
    loadWhatWeChanged(supabase, scope.reading, readingAt).catch((error: unknown) => {
      console.error(`[pages] weekly.changes: ${(error as { message?: string })?.message ?? String(error)}`)
      return null
    }),
  ])
  if (!parts) return null
  const window = parts.window ? { from: parts.window.from.slice(0, 10), to: parts.window.to.slice(0, 10) } : null
  const contributions = await subjectArrivals(scope, overview.subjects, parts.window ? { from: parts.window.from, to: parts.window.to } : null, month)
  const count = overview.market?.find((c) => monthStartOf(c.month) === monthStartOf(month)) ?? null
  return {
    brand: overview.brand,
    month,
    monthStatus: overview.monthStatus,
    readingAt,
    runId: parts.update.id,
    window,
    update: { date: parts.update.date, previous: parts.update.previous },
    barLine: overview.reading ? barLine(overview.reading) : null,
    market: count ? { videos: count.videos, comments: count.comments } : null,
    cameIn: parts.cameIn,
    overview,
    contributions,
    heard: parts.heard,
    sales: parts.sales,
    replies: parts.replies,
    changes: changed ? changesInMonth(changed.lines, month, readingAt) : null,
  }
}

/** The dated list's lines for the changes made in `month` and by `now`
 *  (never a change the reading could not have seen), newest first. */
export function changesInMonth(lines: readonly LedgerLine[], month: string, now: string): LedgerLine[] {
  const m = monthStartOf(month)
  const until = Date.parse(now)
  return lines
    .filter((l) => monthStartOf(l.date) === m && !(Date.parse(l.date) > until))
    .map(({ changeId, date, surface, words, detail, reach, months }) => ({ changeId, date, surface, words, detail: detail ?? null, reach, months }))
}

/** Is `anomaly_checks` (M7) simply not applied here? (The quarterly reads it.) */
export function isMissingAnomalyChecks(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!text.includes('anomaly_checks')) return false
  if (code && ['PGRST202', 'PGRST205', '42883', '42P01'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

/**
 * WR2's "+N with this update", by subject id (market-first WP2.7): the market's
 * videos this update's days put into each subject in the month
 * (`marketSubjectArrivals`, the read This week's subjects print).
 *
 * ONLY FOR A ROW THAT PRINTS IT. A subject being re-described, or one the
 * month was not read for, prints its name and words alone, so its count is not
 * held either. Null where no row can print one, where the update covered no
 * window, or where the read cannot answer.
 */
async function subjectArrivals(
  scope: Scope,
  subjects: SubjectsBlock,
  window: { from: string; to: string } | null,
  month: string,
): Promise<Record<string, number> | null> {
  const rowsOut = subjects.rows.filter((r) => r.calibration !== 'failed' && !r.unread)
  if (rowsOut.length === 0 || !window) return null
  try {
    const rivals = await loadMarketRivalAudiences(scope.supabase as SupabaseClient, scope.clientId)
    if (!rivals) return null
    const pooled = await marketSubjectArrivals(scope.reading, scope.clientId, window, month, rivals)
    if (!pooled) return null
    return Object.fromEntries(rowsOut.map((r) => [r.id, pooled.get(r.id) ?? 0]))
  } catch (error) {
    console.error(`[pages] weekly.subjectArrivals: ${(error as { message?: string })?.message ?? String(error)}`)
    return null
  }
}
