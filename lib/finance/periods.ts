import { addMonths } from '@/lib/costs/dates'
import type { BillingProfile, DueRule } from './types'

// When a month is billed. A month is billed IN ADVANCE: its invoice is issued
// on the profile's day of the month before (the 15th), and is due by that
// month's last day. January 2027 → issued 15 Dec 2026, due 31 Dec 2026.
// Every date is a 'YYYY-MM-DD' Johannesburg day (lib/costs/dates.ts). Pure.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** '2027-01-01' → 'January 2027'. */
export function periodLabel(periodStart: string): string {
  return `${MONTHS[Number(periodStart.slice(5, 7)) - 1]} ${periodStart.slice(0, 4)}`
}

/** The first of the month a day falls in. */
export function monthOf(day: string): string {
  return `${day.slice(0, 7)}-01`
}

/** The day the month starting `periodStart` is invoiced on: `issueDay` of the
 *  month before. */
export function issueDateFor(periodStart: string, issueDay: number): string {
  return addMonths(periodStart, -1, issueDay)
}

/** The day it is due: the last day of the month before, or null (on receipt). */
export function dueDateFor(periodStart: string, rule: DueRule): string | null {
  if (rule === 'on_receipt') return null
  const prev = addMonths(periodStart, -1)
  return addMonths(prev, 0, 31) // clamped to that month's last day
}

export interface BillableMonth {
  periodStart: string
  periodLabel: string
  /** The day the run issues it on: today, which is the nominal issue day or a
   *  later one when that run was missed. */
  issuedOn: string
  dueOn: string | null
}

/**
 * The month the daily job should invoice today, or null.
 *
 * Only ever NEXT month: the one month that has not started yet and whose
 * issue day can already have come (any later month's issue day is next month
 * or later). It is invoiced once its issue day has come and it is not billed
 * yet; a missed issue day is caught up by any run before the month starts.
 * An older month is never back-filled, so a paused profile switched on again
 * bills from next month, never for the gap. `billed` is the period_start of
 * every live invoice (credited and void ones left out).
 */
export function nextBillablePeriod(
  profile: Pick<BillingProfile, 'active' | 'issueDay' | 'dueRule' | 'lines'>,
  billed: readonly string[],
  today: string,
): BillableMonth | null {
  if (!profile.active || profile.lines.length === 0) return null
  const periodStart = addMonths(monthOf(today), 1)
  if (today < issueDateFor(periodStart, profile.issueDay)) return null
  if (billed.includes(periodStart)) return null
  return { periodStart, periodLabel: periodLabel(periodStart), issuedOn: today, dueOn: dueDateFor(periodStart, profile.dueRule) }
}

/** '2026-12-31' → '31.12.2026', the invoice's own date style. */
export function fmtInvoiceDate(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`
}
