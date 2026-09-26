import type { SupabaseClient } from '@supabase/supabase-js'
import type { Scope } from '../renderables/types'
import { monthStartOf } from '../reading/month-key'
import { loadMonthSeries, readingHandle, type ReadingHandle } from '../reading/read'
import { MONTH_PARAM, parseMonthParam, scheduledUpdateAfter } from '../reading/reading-month'
import { loadMarketRivalAudiences, loadReadingSchedule, monthlyMonthFor } from '../reading/reading-view'
import type { MonthStatus } from '../reading/types'
import type { MarketCount } from '../reading/market'
import { monthlySubject, nextMonthlyOf, type NextMonthly } from '../reports/monthly'
import { monthlySlotsFrom, type MonthlySlots } from '../reports/monthly-slots'
import { loadOverview, type LedgerRow, type OverviewData } from './overview'

/**
 * The monthly report's loader: "September in your market" (market-first
 * WP2.1, decision J, plan §2.9).
 *
 * THE ARTEFACT IS THE FRONT PAGE'S OWN READING, NOT A SECOND ONE. Its builder
 * is `loadOverview` built as "Your market" (`marketFront`), on the month that
 * has just ended with the horizon pinned to it; the monthly blocks print the
 * front page's blocks from that reading. So the report cannot say something
 * the page cannot, because it IS the page, read on an ended month.
 *
 * WHAT IS MONTHLY-ONLY, and it is only three things: the month is always one
 * that has ended; "What to decide" names the next monthly and when it comes;
 * and four sections are slots other packages fill (`lib/reports/monthly-slots.ts`),
 * each absent until its package lands.
 *
 * NO MODEL CALL. The build reads, composes in code and stops (plan WP2.1,
 * "Cost"): no interpretation slot, no cover prose.
 */

// ---- the shapes ---------------------------------------------------------------

/** "What to decide": the standing advice and the next monthly. */
export interface DecideSection {
  /** The current recommendation, as the front page's ledger reads it (the
   *  newest first, WP1.9), or null where none stands. */
  ledger: LedgerRow | null
  /** The next monthly, read to the second update after its month ends and
   *  sent the day after (decision J); null where no update is promised. */
  next: NextMonthly | null
  href: string
}

export interface MonthlyData {
  brand: string
  /** Always a month that has ENDED (plan WP2.1, "Interfaces"). */
  month: string
  monthStatus: MonthStatus
  /** When the build was taken: the clock. What the month was read to is
   *  `readTo`. */
  readingAt: string
  /** The last update that read the month (`ReadingMonth.readTo`): the
   *  masthead's "read to the 11 Oct update". */
  readTo: string | null
  /** The month's pooled market (decision E): the subject line's count and
   *  "The month"'s size. */
  market: MarketCount | null
  /** The front page's reading of the month, built as "Your market". */
  overview: OverviewData
  /** The four sections other packages fill; a stub is absent. */
  slots: MonthlySlots
  decide: DecideSection
  subject: string
}

// ---- the pure half ------------------------------------------------------------

/**
 * The month the artefact reads: a month the caller names, if it has ENDED at
 * `now`, else the latest ended month with a row (`closed`, from
 * `monthlyMonthFor`). A named month still running is not a monthly: it would
 * be an artefact headed "October in your market" over four days of October.
 */
export function monthlyMonthOf(now: string, named: string | null | undefined, closed: string): string {
  const month = parseMonthParam(named)
  if (month && month < monthStartOf(now)) return month.slice(0, 7)
  return closed.slice(0, 7)
}

// ---- the loader ---------------------------------------------------------------

/**
 * The whole artefact, for one tenant, over the month that has just ended.
 *
 * Null is the first-run empty state: a tenant whose first update has not landed
 * has no reading of anything, and the send path marks itself `skipped` on it
 * rather than delivering an empty report.
 *
 * THE HORIZON IS PINNED TO THE MONTH. A monthly report over "last 12" would be
 * an artefact whose title and whose numbers disagree, so the scope handed to
 * the front page's loader names `this_month` and the month, whatever the
 * caller was looking at.
 */
export async function loadMonthly(scope: Scope): Promise<MonthlyData | null> {
  const supabase = scope.supabase as SupabaseClient
  const reading: ReadingHandle = scope.reading ?? readingHandle(scope.clientId)
  // THE MONTH THAT HAS JUST ENDED (decision A: "the monthly report always
  // reads the month that has just ended"). One denominator read, the same
  // whole-history ask the front page makes first (memoised: the same request
  // pays for it once), and the one market every page pools.
  const now = new Date().toISOString()
  const [history, rivalAudiences, schedule] = await Promise.all([
    loadMonthSeries(reading.client, scope.clientId, { from: '2019-01-01', to: now, updatesByMonth: {} }),
    loadMarketRivalAudiences(supabase, scope.clientId),
    // The tenant's cadence, for the next monthly's date (memoised: the front
    // page's loader reads the same row for "next update").
    loadReadingSchedule(supabase, scope.clientId),
  ])
  const closed = monthlyMonthFor(now, history.denominators, null, rivalAudiences)
  const month = monthlyMonthOf(now, scope.params[MONTH_PARAM], closed)
  const monthScope: Scope = { ...scope, reading, params: { ...scope.params, horizon: 'this_month', [MONTH_PARAM]: month } }

  const overview = await loadOverview(monthScope, { marketFront: true })
  if (!overview) return null

  const market = overview.market?.find((c) => c.month === overview.month) ?? null
  return {
    brand: overview.brand,
    month: overview.month,
    monthStatus: overview.monthStatus,
    readingAt: overview.readingAt,
    readTo: overview.reading?.readTo ?? null,
    market,
    overview,
    // Each package fills its slot in `monthlySlotsFrom` (WP2.3 the change
    // section's re-check, WP2.6 the brands); the rest are still stubs.
    slots: monthlySlotsFrom(overview),
    decide: {
      ledger: overview.sentence.ledger,
      // A paused tenant is promised no update, so no next monthly either.
      next: overview.reading?.paused ? null : nextMonthlyOf(overview.month, schedule ? scheduledUpdateAfter(schedule) : null),
      href: '/dashboard/market',
    },
    subject: monthlySubject(overview.brand, overview.month, market?.videos ?? null),
  }
}
