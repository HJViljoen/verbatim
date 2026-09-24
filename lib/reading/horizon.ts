import { monthName } from '../format'
import { SHARE_BAND, type BandOptions } from '../report-bands'
import { monthEndInstant, monthStartOf, monthsBetween } from './monthly'
import type { VerdictWindow } from './verdicts'

// The horizon control — how far back a reading looks (design items 1 and 6,
// decision M).
//
// A HORIZON IS A SERIES PLUS ONE FIGURE, NOT A BIGGER READ. The chart is drawn
// from the stored month rows, which is the cheap indexed read and the frozen
// record; the one number a page states in prose — "19% (69 of 366) over the
// last three months" — comes from the window functions of M3. That split is not
// an optimisation, it is the only correct shape: a windowed video count is not
// the sum of the months (+38.7% over twelve months on Össur's own brand), and a
// month row is the only thing that can answer "this update's contribution to
// September". Measured, the widening itself is free: the theme read touches
// 54,765 shared buffers at "this month" and 54,765 at "since we started", to
// the block. What a wider horizon costs is rows returned, and the cliff is
// PostgREST's 1,000-row page, not the window.
//
// "SINCE WE STARTED" HAD THREE POSSIBLE MEANINGS AND NO DEFINITION. The first
// stored month (63 months on Össur, 66 on Sealand, nearly all of them holding
// too little to read), the first month clearing the floor (4 and 2), or the
// first pipeline run (2026-04-06 and 2026-06-28). Decision M takes the second:
// the axis starts where a comparison could first have been drawn, and the
// months before it are named in one line rather than plotted as a long flat
// nothing. `sinceStart` is that rule, and it carries the count of what it left
// out so a reader can ask for it.
//
// THE HORIZON LIVES IN THE URL. `Scope.params` is "the page's own URL params,
// verbatim" and an export resolves the same selection the reader was looking
// at, so putting the horizon there makes every export window-aware for free.

export const HORIZONS = ['this_month', 'last_3', 'last_12', 'since_start'] as const
export type Horizon = (typeof HORIZONS)[number]

/** The URL parameter. One name, so the page bar, the export and a share link
 *  cannot spell it three ways. */
export const HORIZON_PARAM = 'horizon'

/** What a page shows when nobody has chosen. The month in hand is the only
 *  horizon every tenant can answer on day one. */
export const DEFAULT_HORIZON: Horizon = 'this_month'

/** How many calendar months each horizon spans. `since_start` is open-ended and
 *  takes its start from the data. */
const SPAN: Record<Exclude<Horizon, 'since_start'>, number> = {
  this_month: 1,
  last_3: 3,
  last_12: 12,
}

/** The control's own words. Client-facing: no window, no range, no basis. */
export const HORIZON_LABEL: Record<Horizon, string> = {
  this_month: 'This month',
  last_3: 'Last 3 months',
  last_12: 'Last 12 months',
  since_start: 'Since we started',
}

/** Read the URL parameter. Anything unrecognised is the default rather than an
 *  error: a horizon is a view, and a stale link should still open the page. */
export function parseHorizon(value: string | undefined | null): Horizon {
  return (HORIZONS as readonly string[]).includes(value ?? '') ? (value as Horizon) : DEFAULT_HORIZON
}

export interface HorizonWindow {
  horizon: Horizon
  /** The verdict contract's name for the shape of the claim. `month` is one
   *  month against the one before it; `quarter` is any multi-month window
   *  against the EQUAL window before it, which is what Last 3 and Last 12 both
   *  are; `since` is the whole readable history, which has nothing before it to
   *  be compared with. */
  kind: VerdictWindow['kind']
  /** The axis, inclusive, oldest first. */
  months: string[]
  /** The half-open instants `[from, to)` the window functions take. */
  from: string
  to: string
  /** The equal window before this one, for a window-against-window change.
   *  Null for `since_start`, which has no equal window before it. */
  basis: { from: string; to: string; months: string[] } | null
}

const windowOfMonths = (months: readonly string[]): { from: string; to: string } => ({
  from: `${months[0]}T00:00:00.000Z`,
  to: monthEndInstant(months[months.length - 1]),
})

function previousMonth(month: string): string {
  const d = new Date(`${monthStartOf(month)}T00:00:00.000Z`)
  return monthStartOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString())
}

/** `count` calendar months ending at `last`, oldest first. */
function monthsBack(last: string, count: number): string[] {
  const out: string[] = []
  let m = monthStartOf(last)
  for (let i = 0; i < count; i++) {
    out.unshift(m)
    m = previousMonth(m)
  }
  return out
}

/**
 * The months a horizon covers, and the equal window before them.
 *
 * `now` is an instant; the current month is always the last month on the axis,
 * still filling and all — a horizon that quietly dropped the month in hand
 * would answer a question nobody asked. `firstReadable` is `sinceStart`'s
 * answer and only `since_start` uses it; with none, `since_start` falls back to
 * the month in hand, which is the honest reading of a tenant that has nothing
 * to read back yet.
 */
export function horizonWindow(horizon: Horizon, now: string, firstReadable?: string | null): HorizonWindow {
  const current = monthStartOf(now)

  if (horizon === 'since_start') {
    const start = firstReadable ? monthStartOf(firstReadable) : current
    const months = start <= current ? monthsBetween(start, monthEndInstant(current)) : [current]
    return { horizon, kind: 'since', months, ...windowOfMonths(months), basis: null }
  }

  const span = SPAN[horizon]
  const months = monthsBack(current, span)
  const before = monthsBack(previousMonth(months[0]), span)
  return {
    horizon,
    kind: horizon === 'this_month' ? 'month' : 'quarter',
    months,
    ...windowOfMonths(months),
    basis: { ...windowOfMonths(before), months: before },
  }
}

/** A denominator row, as much of it as the "since we started" rule needs. */
export interface FloorRow {
  month: string
  videos: number
}

export interface SinceStart {
  /** The first month in which ANY audience carried enough conversation to be
   *  compared at all. Null when none ever has. */
  from: string | null
  /** The earliest month with a row of any size — the whole back-read's start,
   *  which is what "one click down" opens. */
  earliest: string | null
  /** Months with a row that sit before `from`. */
  earlier: number
  /** The one line that stands in for them, or null when there are none. */
  label: string | null
}

/**
 * Where "since we started" starts (decision M).
 *
 * The first month in which any audience cleared the floor — ANY, deliberately:
 * an axis per audience would start in a different month on every line of one
 * chart, and the reader is being told when the product could first read
 * anything at all, not when each rival could. On today's corpus that is June
 * 2026 for Össur and August 2026 for Sealand, against first stored months of
 * 2020-10 and 2020-12.
 *
 * The months before it are not hidden, they are counted and named. Plotting
 * them would draw four years of flat nothing and imply the conversation was
 * quiet; saying "N earlier months hold too little to read" is the same fact
 * without the implication, and the back-read stays one click away.
 */
export function sinceStart(rows: readonly FloorRow[], floor: BandOptions = SHARE_BAND): SinceStart {
  const months = rows.map((r) => monthStartOf(r.month))
  const earliest = months.length > 0 ? months.reduce((a, b) => (a < b ? a : b)) : null
  const clearing = rows.filter((r) => r.videos >= floor.minN).map((r) => monthStartOf(r.month))
  const from = clearing.length > 0 ? clearing.reduce((a, b) => (a < b ? a : b)) : null
  if (!from) return { from: null, earliest, earlier: 0, label: null }
  const earlier = new Set(months.filter((m) => m < from)).size
  return {
    from,
    earliest,
    earlier,
    label:
      earlier > 0
        ? `${earlier} earlier ${earlier === 1 ? 'month holds' : 'months hold'} too little to read.`
        : null,
  }
}

/** The dates a horizon prints beside its name — "Jun 2026 to Sep 2026", or the
 *  single month's name when it is one month. Month granularity on purpose: the
 *  axis is dated by the comment, and a day would imply a precision the freeze
 *  line does not have. */
export function horizonDates(window: Pick<HorizonWindow, 'months'>): string {
  const months = window.months
  if (months.length === 0) return ''
  return months.length === 1
    ? monthName(months[0])
    : `${monthName(months[0])} to ${monthName(months[months.length - 1])}`
}

/** How many months a month-by-month chart shows, whatever the horizon. */
export const CHART_MONTHS = 12

/**
 * THE CHART'S AXIS IS NOT THE HORIZON'S (2026-09-24).
 *
 * The horizon control chooses the period the FIGURES are read over; it used to
 * choose the chart's axis too, so the default "This month" drew a line chart
 * one month wide — a single dot — and a reader who knew the product had been
 * reading for months asked where the line was. The chart now always shows the
 * trailing `CHART_MONTHS`, ending on the month in hand, or from the tenant's
 * first readable month (`sinceStart().from`) where that is later: months before
 * it hold too little to read, and a year of empty slots is the flat nothing
 * decision M refused to plot. The horizon changes the figures, not how much
 * line you can see.
 */
export function chartMonths(now: string, firstReadable?: string | null): string[] {
  const months = monthsBack(monthStartOf(now), CHART_MONTHS)
  const from = firstReadable ? monthStartOf(firstReadable) : null
  if (!from) return months
  const trimmed = months.filter((m) => m >= from)
  return trimmed.length > 0 ? trimmed : [months[months.length - 1]]
}
