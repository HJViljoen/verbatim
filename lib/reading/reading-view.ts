import type { SupabaseClient } from '@supabase/supabase-js'

import type { ScheduleConfig } from '../pipeline/schedule-due'
import { isRivalAudience } from '../rivals'
import { selectAll } from '../supabase-admin'
import { marketAudiences, pooledDenominators } from './market'
import { memoRead } from './memo'
import { monthStartOf } from './month-key'
import { closedMonthFor, parseMonthParam, readingMonthFor, scheduledUpdateAfter, type ReadingMonth } from './reading-month'
import type { MonthOrigin, MonthStatus } from './types'

// The reading month, from what a page loader holds (market-first WP1.2).
//
// `lib/reading/reading-month.ts` is the rule and is pure; this is the one place
// the loaders turn their rows into its input, so six loaders cannot each decide
// what "an update" or "a month with a row" means. Two halves:
//
//   · `readingViewFrom`, pure and tested: the delivered runs, the stored
//     denominator rows and the tenant's schedule in, the reading month and the
//     one other month the bar's selector offers out;
//   · `loadDeliveredRuns` and `loadReadingSchedule`, the two small reads a
//     loader that does not already hold them makes, memoised per request so a
//     page that loads several surfaces (an export, a brief) reads them once.
//
// AN UPDATE IS A DELIVERED RUN, DATED BY WHEN IT FINISHED. Completed and partial
// runs are updates; a failed or running one is not. The finish instant is
// `completed_at`, and a row with none falls back to `started_at` rather than
// vanishing: a run that delivered is an update whatever its bookkeeping says.
//
// THE MARKET POOLS THE CATEGORY AND THE RIVAL AUDIENCES (decision E,
// `pooledDenominators`). The client's own posts are not the market, so a month
// holding only the client's own posts has no row here.

/** A delivered run, as much of it as the reading month needs. */
export interface DeliveredRun {
  id: string
  started_at: string
  completed_at?: string | null
}

/** A stored denominator row, as much of it as the reading month needs. */
export interface ReadingDenominator {
  month: string
  audience: string
  videos: number
  comments?: number | null
  status?: MonthStatus | null
  origin?: MonthOrigin | null
}

/** The one other month the bar's selector offers. `isDefault`: it is the month
 *  the page reads with no `?month=`, so its link carries no parameter. */
export interface OtherMonth {
  month: string
  isDefault: boolean
}

export interface ReadingView {
  reading: ReadingMonth
  other: OtherMonth | null
}

export interface ReadingViewInput {
  now: string
  /** Delivered runs (completed or partial), any order. */
  runs: readonly DeliveredRun[]
  /** Stored `month_denominators` rows, every audience. */
  denominators: readonly ReadingDenominator[]
  /** The tracked rival audiences (`competitor:<name>`). Null or omitted: every
   *  rival audience that has a row. */
  rivalAudiences?: readonly string[] | null
  /** The tenant's cadence (`tracking_configs.report_period`, `report_day`). */
  schedule?: ScheduleConfig | null
  /** `?month=` as the URL carried it. */
  explicit?: string | null
  switchFraction?: number
}

/** A run's finish instant: `completed_at`, else `started_at`. */
export const updateInstant = (r: DeliveredRun): string => r.completed_at ?? r.started_at

/** "As at": the finish instant of the latest update on or before `now`, or
 *  null when none has finished yet. The same answer `ReadingMonth.asAt` gives,
 *  for a caller that needs it before the month is decided. */
export function asAtOf(runs: readonly DeliveredRun[], now: string): string | null {
  const nowMs = Date.parse(now)
  let best: { iso: string; ms: number } | null = null
  for (const r of runs) {
    const iso = updateInstant(r)
    const ms = Date.parse(iso)
    if (Number.isNaN(ms) || ms > nowMs) continue
    if (!best || ms > best.ms) best = { iso, ms }
  }
  return best?.iso ?? null
}

/**
 * The reading month and the selector's other month, from the rows a loader
 * holds.
 *
 * THE OTHER MONTH, one rule for every page:
 *   · a `?month=` the rule honoured → the month the page reads without it;
 *   · the current month leads → the latest month before it with a row;
 *   · an ended month leads → the current month, once it has a row.
 * Null where there is no second month to offer.
 */
export function readingViewFrom(input: ReadingViewInput): ReadingView {
  const rivals = input.rivalAudiences ?? [...new Set(input.denominators.map((d) => d.audience).filter(isRivalAudience))]
  const pooled = pooledDenominators(
    input.denominators.map((d) => ({ month: d.month, audience: d.audience, videos: d.videos, comments: d.comments ?? 0 })),
    rivals,
  )
  const videosByMonth = new Map<string, number>()
  for (const [month, c] of pooled) if (c.videos != null) videosByMonth.set(month, c.videos)

  // The stored row's status and origin, over the market's audiences: frozen
  // only when every one of them is, read at setup only when every one was.
  const market = new Set(marketAudiences(rivals))
  const flags = new Map<string, { frozen: boolean; backRead: boolean }>()
  for (const d of input.denominators) {
    if (!market.has(d.audience) || !d.status || !d.origin) continue
    const m = monthStartOf(d.month)
    const f = flags.get(m) ?? { frozen: true, backRead: true }
    f.frozen &&= d.status === 'frozen'
    f.backRead &&= d.origin === 'back_read'
    flags.set(m, f)
  }
  const rows = new Map<string, { status: MonthStatus; origin: MonthOrigin }>()
  for (const [m, f] of flags) rows.set(m, { status: f.frozen ? 'frozen' : 'filling', origin: f.backRead ? 'back_read' : 'live' })

  const runs = [...input.runs].sort((a, b) => (a.started_at < b.started_at ? -1 : a.started_at > b.started_at ? 1 : 0))
  const base = {
    now: input.now,
    updates: runs.map(updateInstant),
    videosByMonth,
    firstRunMonth: runs.length > 0 ? monthStartOf(runs[0].started_at) : monthStartOf(input.now),
    rows,
    switchFraction: input.switchFraction,
    nextUpdateAfter: input.schedule ? scheduledUpdateAfter(input.schedule) : undefined,
  }
  const reading = readingMonthFor({ ...base, explicit: input.explicit ?? null })

  let other: OtherMonth | null = null
  if (reading.reason === 'explicit') {
    const rule = readingMonthFor(base)
    if (rule.month !== reading.month) other = { month: rule.month, isDefault: true }
  } else if (reading.leadsWithCurrent) {
    const before = [...videosByMonth.keys()].filter((m) => m < reading.month).sort()
    if (before.length > 0) other = { month: before[before.length - 1], isDefault: false }
  } else if (videosByMonth.has(reading.current.month)) {
    other = { month: reading.current.month, isDefault: false }
  }
  return { reading, other }
}

/**
 * How current a page dated by the UPDATE is (This week): the last update, the
 * next one the schedule promises, and whether updates have paused. The same
 * rule the reading month applies (`readingMonthFor`), taken without a month,
 * because none of the three depends on which month is read.
 */
export function updateClock(input: {
  now: string
  runs: readonly DeliveredRun[]
  schedule?: ScheduleConfig | null
}): { asAt: string | null; nextUpdate: string | null; paused: boolean } {
  const r = readingMonthFor({
    now: input.now,
    updates: input.runs.map(updateInstant),
    videosByMonth: new Map(),
    firstRunMonth: monthStartOf(input.now),
    nextUpdateAfter: input.schedule ? scheduledUpdateAfter(input.schedule) : undefined,
  })
  return { asAt: r.asAt, nextUpdate: r.nextUpdate, paused: r.paused }
}

/** The months the market has a row for, oldest first (the client's own posts
 *  are not the market). */
export function marketMonths(
  denominators: readonly ReadingDenominator[],
  rivalAudiences?: readonly string[] | null,
): string[] {
  const rivals = rivalAudiences ?? [...new Set(denominators.map((d) => d.audience).filter(isRivalAudience))]
  const pooled = pooledDenominators(
    denominators.map((d) => ({ month: d.month, audience: d.audience, videos: d.videos, comments: d.comments ?? 0 })),
    rivals,
  )
  return [...pooled.keys()]
}

/**
 * The month the monthly report reads (decision A): the one a caller names, or
 * the month that has just ended, never the month it is built in. Built on
 * 4 October it is September's report, not four days of October's
 * (`closedMonthFor`). Returned as the `?month=` value the page loaders take.
 */
export function monthlyMonthFor(now: string, denominators: readonly ReadingDenominator[], explicit?: string | null): string {
  const named = parseMonthParam(explicit)
  return (named ?? closedMonthFor(now, marketMonths(denominators))).slice(0, 7)
}

// ---- The two reads ------------------------------------------------------------

/**
 * Every delivered run, oldest first, with its finish instant. The same filter
 * and order the page loaders' own run reads use, so a loader can take this in
 * place of its own read and draw exactly what it drew.
 */
export function loadDeliveredRuns(supabase: SupabaseClient, clientId: string): Promise<DeliveredRun[]> {
  return memoRead(supabase, `reading-view:runs:${clientId}`, () =>
    selectAll<DeliveredRun>(() =>
      supabase.from('pipeline_runs').select('id, started_at, completed_at')
        .eq('client_id', clientId).in('status', ['completed', 'partial'])
        .order('started_at', { ascending: true })
        .order('id', { ascending: true }),
    ),
  )
}

/**
 * The tenant's cadence, for "next update". Null where it cannot be read: the
 * bar then says only "as at", which is true, rather than promising a date.
 */
export function loadReadingSchedule(supabase: SupabaseClient, clientId: string): Promise<ScheduleConfig | null> {
  return memoRead(supabase, `reading-view:schedule:${clientId}`, async () => {
    try {
      const { data, error } = await supabase
        .from('tracking_configs').select('report_period, report_day').eq('client_id', clientId).maybeSingle()
      if (error) {
        console.error(`[reading-view] schedule: ${error.message}`)
        return null
      }
      return (data as ScheduleConfig | null) ?? null
    } catch (error) {
      console.error(`[reading-view] schedule: ${(error as { message?: string })?.message ?? String(error)}`)
      return null
    }
  })
}
