import type { Bill, BillCadence } from './types'

// Calendar arithmetic for the Costs page. Every date is a 'YYYY-MM-DD' day in
// Africa/Johannesburg, which is UTC+2 all year (no daylight saving), so a day
// is computed by offset rather than through Intl. Pure.

const JHB_OFFSET_MS = 2 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** Today's date in Johannesburg. */
export function todayJhb(now: Date): string {
  return new Date(now.getTime() + JHB_OFFSET_MS).toISOString().slice(0, 10)
}

/** The instant a Johannesburg day begins, for a query bound. */
export function jhbDayStart(day: string): string {
  return `${day}T00:00:00+02:00`
}

function parts(day: string): [number, number, number] {
  const [y, m, d] = day.split('-').map(Number)
  return [y, m, d]
}

function iso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** A day `n` months on, on `anchorDay` (the day's own by default) where the
 *  month has it and clamped to its last day where it does not: 31 Jan + 1
 *  month = 28 Feb. */
export function addMonths(day: string, n: number, anchorDay?: number): string {
  const [y, m, d] = parts(day)
  const total = (y * 12 + (m - 1)) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return iso(ny, nm, Math.min(anchorDay ?? d, daysInMonth(ny, nm)))
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = parts(day)
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10)
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = parts(a)
  const [by, bm, bd] = parts(b)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS)
}

const CYCLE_MONTHS: Record<BillCadence, number> = { monthly: 1, usage: 1, yearly: 12, two_yearly: 24 }

/**
 * The day of the month a bill charges on. A short month clamps the date (a
 * bill on the 31st shows 30 Nov), so the bill keeps its day apart
 * (`cost_bills.anchor_day`): the stored day counts while `date` is what that
 * day gives in its month, and otherwise the date's own day does (no day
 * stored, or the date was moved to another day).
 */
export function anchorDayOf(date: string, stored: number | null): number {
  const [y, m, d] = parts(date)
  const ok = stored !== null && Number.isInteger(stored) && stored >= 1 && stored <= 31
  return ok && Math.min(stored, daysInMonth(y, m)) === d ? stored : d
}

/** The next charge date after one is paid: one cycle on, on the bill's anchor
 *  day, so 31 Oct moves to 30 Nov and 30 Nov (anchored on the 31st) to 31 Dec.
 *  A usage bill that carries a date moves a month. */
export function advanceDate(day: string, cadence: BillCadence, anchorDay: number | null = null): string {
  return addMonths(day, CYCLE_MONTHS[cadence], anchorDayOf(day, anchorDay))
}

/** "9 Oct 2026". */
export function fmtDay(day: string): string {
  const [y, m, d] = parts(day)
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`
}

/** "Fri 9 Oct". */
export function fmtWeekday(day: string): string {
  const [y, m, d] = parts(day)
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${wd} ${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}`
}

// ---- What is coming up ----------------------------------------------------------

export interface Charge {
  billId: string
  name: string
  date: string
  amount: number | null
  currency: Bill['currency']
  isEstimate: boolean
  status: Bill['status']
  /** The date has passed and the charge was not marked paid. */
  late: boolean
}

/** A bill that no longer charges, or is on hold, puts nothing on the calendar. */
const charges = (b: Bill): boolean => b.status !== 'ended' && b.status !== 'paused'

/**
 * Every charge from today through `horizonDays` days on, oldest first, with a
 * bill's later cycles projected inside the window (a monthly bill on the 16th
 * shows the 16th of this month and of the next). Each cycle is counted from
 * the shown date on the bill's anchor day, never chained from a clamped one:
 * 31 Oct, 30 Nov, 31 Dec. A date already past and not marked paid shows once,
 * at its own date, as late. A usage bill's date shows once: it has no fixed
 * rhythm to project.
 */
export function upcomingCharges(bills: readonly Bill[], today: string, horizonDays = 60): Charge[] {
  const end = addDays(today, horizonDays)
  const out: Charge[] = []
  for (const b of bills) {
    if (!charges(b) || !b.nextChargeOn) continue
    const base = { billId: b.id, name: b.name, amount: b.amount, currency: b.currency, isEstimate: b.isEstimate, status: b.status }
    if (b.nextChargeOn < today) {
      out.push({ ...base, date: b.nextChargeOn, late: true })
      continue
    }
    const anchor = anchorDayOf(b.nextChargeOn, b.anchorDay)
    let date = b.nextChargeOn
    for (let i = 1; i <= 12 && date <= end; i++) {
      out.push({ ...base, date, late: false })
      if (b.cadence === 'usage') break
      date = addMonths(b.nextChargeOn, i * CYCLE_MONTHS[b.cadence], anchor)
    }
  }
  return out.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : a.date < b.date ? -1 : 1))
}

// ---- Apify's billing cycle -------------------------------------------------------

export interface Cycle {
  /** The day the current cycle began. */
  start: string
  /** The day the next one begins. */
  next: string
  /** Days so far, today included (1 on the first day). */
  daysElapsed: number
  daysInCycle: number
}

/** The billing cycle `today` falls in, when cycles start on `cycleDay` of each
 *  month (Apify's runs the 9th to the 8th). */
export function billingCycle(today: string, cycleDay: number): Cycle {
  const [y, m, d] = parts(today)
  const thisMonth = iso(y, m, Math.min(cycleDay, daysInMonth(y, m)))
  const start = d >= Math.min(cycleDay, daysInMonth(y, m)) ? thisMonth : (() => {
    const prev = addMonths(iso(y, m, 1), -1)
    const [py, pm] = parts(prev)
    return iso(py, pm, Math.min(cycleDay, daysInMonth(py, pm)))
  })()
  const [sy, sm] = parts(start)
  const nextMonth = addMonths(iso(sy, sm, 1), 1)
  const [ny, nm] = parts(nextMonth)
  const next = iso(ny, nm, Math.min(cycleDay, daysInMonth(ny, nm)))
  return {
    start,
    next,
    daysElapsed: daysBetween(start, today) + 1,
    daysInCycle: daysBetween(start, next),
  }
}
