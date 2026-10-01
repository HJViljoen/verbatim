import { longMonth } from '../format'
import { nextMonth } from '../reading/month-key'

// The week and the month it is restated against (writing back; the lead's
// ruling on review M2, 1 Oct). Pure.
//
// THE DAYS A WINDOW HOLDS. A run's window is the frozen, half-open
// `[from, to)` (`rowWindow`), and a comment is dated by its DATE only, so a
// window holds the comment dates `d` with `from <= d 00:00 < to`. On the Sunday
// cadence that is the seven days ending on the morning of the run: the window
// [Sun 27 Sep 04:03, Sun 4 Oct 04:02) holds 28 September to 4 October (a
// comment dated 27 September sits at 00:00, before the window opens). Named
// here as the window's length in whole days, ending on the day of its last
// instant, which is the same days for every window the cadence makes.
//
// THE MONTH IT IS RESTATED AGAINST (AGENTS.md: a week is never printed alone,
// it is stated again as a contribution to its month). A week inside one month
// is restated against that month so far ("16 in October so far"). A week that
// STARTS in one month and ends in the next is restated against the month it
// started in, IN FULL ("16 in September", "September in total"): the month
// that has just ended is whole by the time the run reads it, and the new
// month is a few days old, so "October so far" beside a seven-day week would
// read as a collapse ("5 videos this week · 0 in October so far").

const DAY_MS = 86_400_000

export interface CoveredDays {
  /** The first and last comment dates the window holds, `YYYY-MM-DD` (UTC). */
  first: string
  last: string
  days: number
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** The comment dates a window holds, or null for a window that is not one. */
export function coveredDays(window: { from: string; to: string } | null | undefined): CoveredDays | null {
  if (!window) return null
  const from = Date.parse(window.from)
  const to = Date.parse(window.to)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null
  const days = Math.max(1, Math.round((to - from) / DAY_MS))
  const lastDay = Date.parse(`${ymd(to - 1)}T00:00:00.000Z`)
  return { first: ymd(lastDay - (days - 1) * DAY_MS), last: ymd(lastDay), days }
}

export interface ReadingMonth {
  /** The month the week is restated against, `YYYY-MM-01`. */
  month: string
  /** True where the week started in the month before the one it ended in:
   *  the month is stated in full, not "so far". */
  complete: boolean
  /** Where the month's figures end, exclusive: the window's end while the
   *  month is under way, the first of the next month when it is complete. */
  to: string
  /** The month the week ended in, `YYYY-MM-01` (the prompt names it). */
  endMonth: string
}

/** The month a run's week is restated against, and how far into it. */
export function readingMonthOf(window: { from: string; to: string }): ReadingMonth {
  const covered = coveredDays(window)
  const endMonth = `${(covered?.last ?? window.to).slice(0, 7)}-01`
  const startMonth = covered ? `${covered.first.slice(0, 7)}-01` : endMonth
  if (startMonth < endMonth) {
    return { month: startMonth, complete: true, to: `${nextMonth(startMonth)}T00:00:00.000Z`, endMonth }
  }
  return { month: endMonth, complete: false, to: window.to, endMonth }
}

/** "in September so far" while the month is under way, "in September" once
 *  the week has carried past its end. */
export function inMonth(month: string, complete: boolean | null | undefined): string {
  return complete ? `in ${longMonth(month)}` : `in ${longMonth(month)} so far`
}

/** The month's own heading beside the week's: "September so far" or
 *  "September in total". */
export function monthHeading(month: string, complete: boolean | null | undefined): string {
  return complete ? `${longMonth(month)} in total` : `${longMonth(month)} so far`
}

/** Months in words, oldest first: "August and September", "July, August and
 *  September" (the long-run read's heading and evidence lines). Pure. */
export function monthsPhrase(months: readonly string[]): string {
  const names = months.map((x) => longMonth(x))
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
