import { describe, expect, it } from 'vitest'
import {
  addDays, addMonths, advanceDate, anchorDayOf, billingCycle, daysBetween, fmtDay, fmtWeekday, jhbDayStart,
  todayJhb, upcomingCharges,
} from './dates'
import type { Bill } from './types'

const bill = (over: Partial<Bill>): Bill => ({
  id: over.name ?? 'b',
  slug: null,
  name: 'Bill',
  what: null,
  category: null,
  amount: 10,
  currency: 'USD',
  cadence: 'monthly',
  nextChargeOn: null,
  anchorDay: null,
  status: 'active',
  overdueAmount: 0,
  paymentMethod: null,
  notes: null,
  isEstimate: false,
  shared: false,
  usageTracked: false,
  manageUrl: null,
  lastPaidOn: null,
  ...over,
})

describe('Johannesburg days', () => {
  it('turns the day at 22:00 UTC', () => {
    expect(todayJhb(new Date('2026-10-08T21:59:00Z'))).toBe('2026-10-08')
    expect(todayJhb(new Date('2026-10-08T22:00:00Z'))).toBe('2026-10-09')
    expect(jhbDayStart('2026-10-09')).toBe('2026-10-09T00:00:00+02:00')
  })

  it('formats a day without the clock', () => {
    expect(fmtDay('2026-10-09')).toBe('9 Oct 2026')
    expect(fmtWeekday('2026-10-09')).toBe('Fri 9 Oct')
  })
})

describe('calendar arithmetic', () => {
  it('adds months, holding the day where the month has it and clamping where it does not', () => {
    expect(addMonths('2026-10-16', 1)).toBe('2026-11-16')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
  })

  it('lands on an anchor day where the month has it', () => {
    expect(addMonths('2026-11-30', 1, 31)).toBe('2026-12-31')
    expect(addMonths('2027-02-28', 1, 31)).toBe('2027-03-31')
    expect(addMonths('2026-10-31', 4, 31)).toBe('2027-02-28')
  })

  it('counts days across a month end', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(daysBetween('2026-10-09', '2026-11-09')).toBe(31)
    expect(daysBetween('2026-10-09', '2026-10-01')).toBe(-8)
  })

  it('moves a paid charge one cycle on', () => {
    expect(advanceDate('2026-10-14', 'monthly')).toBe('2026-11-14')
    expect(advanceDate('2027-06-02', 'yearly')).toBe('2028-06-02')
    expect(advanceDate('2028-06-30', 'two_yearly')).toBe('2030-06-30')
    expect(advanceDate('2026-10-31', 'usage')).toBe('2026-11-30')
  })

  it('moves a bill on the 31st back to the 31st after a short month, not the 30th for good', () => {
    // Mark paid twice from 31 Oct: the first lands on 30 Nov and keeps 31 as
    // the anchor, so the second lands on 31 Dec.
    const nov = advanceDate('2026-10-31', 'monthly')
    expect(nov).toBe('2026-11-30')
    expect(anchorDayOf('2026-10-31', null)).toBe(31)
    expect(advanceDate(nov, 'monthly', 31)).toBe('2026-12-31')
    expect(advanceDate('2027-01-31', 'monthly', 31)).toBe('2027-02-28')
    expect(advanceDate('2027-02-28', 'monthly', 31)).toBe('2027-03-31')
    expect(advanceDate('2028-02-29', 'yearly', 29)).toBe('2029-02-28')
    expect(advanceDate('2029-02-28', 'yearly', 29)).toBe('2030-02-28')
    expect(advanceDate('2031-02-28', 'yearly', 29)).toBe('2032-02-29')
  })
})

describe('a bill\'s anchor day', () => {
  it('is the date\'s own day when none is stored', () => {
    expect(anchorDayOf('2026-10-16', null)).toBe(16)
  })

  it('is the stored day while a short month clamps the date to it', () => {
    expect(anchorDayOf('2026-11-30', 31)).toBe(31)
    expect(anchorDayOf('2027-02-28', 30)).toBe(30)
    expect(anchorDayOf('2026-10-31', 31)).toBe(31)
  })

  it('follows the date when it was moved to another day, or the stored day is not a day', () => {
    expect(anchorDayOf('2026-11-15', 31)).toBe(15)
    expect(anchorDayOf('2026-10-30', 31)).toBe(30)
    expect(anchorDayOf('2026-11-30', 0)).toBe(30)
    expect(anchorDayOf('2026-11-30', 32)).toBe(30)
  })
})

describe('what is coming up in sixty days', () => {
  const today = '2026-10-09'

  it('projects each cycle inside the window and stops at its edge', () => {
    const c = upcomingCharges([bill({ name: 'Supabase Pro', nextChargeOn: '2026-10-16' })], today)
    expect(c.map((x) => x.date)).toEqual(['2026-10-16', '2026-11-16'])
    expect(c.every((x) => !x.late)).toBe(true)
  })

  it('projects each cycle from the anchor day, not from the clamped date before it', () => {
    const fromOct = upcomingCharges([bill({ nextChargeOn: '2026-10-31' })], '2026-10-09', 90)
    expect(fromOct.map((x) => x.date)).toEqual(['2026-10-31', '2026-11-30', '2026-12-31'])
    // after Mark paid on 31 Oct: 30 Nov shown, 31 kept
    const fromNov = upcomingCharges([bill({ nextChargeOn: '2026-11-30', anchorDay: 31 })], '2026-11-01', 120)
    expect(fromNov.map((x) => x.date)).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28'])
  })

  it('shows a charge that falls today', () => {
    expect(upcomingCharges([bill({ nextChargeOn: today })], today).map((x) => x.date)).toEqual(['2026-10-09', '2026-11-09'])
  })

  it('shows a missed date once, as late, and projects nothing after it', () => {
    const c = upcomingCharges([bill({ name: 'Late', nextChargeOn: '2026-10-01' })], today)
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ date: '2026-10-01', late: true })
  })

  it('leaves out ended and paused bills, bills with no date, and dates past the window', () => {
    expect(upcomingCharges([
      bill({ status: 'ended', nextChargeOn: '2026-10-20' }),
      bill({ status: 'paused', nextChargeOn: '2026-10-20' }),
      bill({ nextChargeOn: null }),
      bill({ name: 'verbatimintel.com', cadence: 'two_yearly', nextChargeOn: '2028-06-30' }),
    ], today)).toEqual([])
  })

  it('shows a usage bill\'s date once and a failing bill like any other', () => {
    const c = upcomingCharges([
      bill({ name: 'Usage', cadence: 'usage', nextChargeOn: '2026-10-20' }),
      bill({ name: 'Apify Starter', status: 'failing', nextChargeOn: '2026-11-09' }),
    ], today)
    expect(c.map((x) => `${x.date} ${x.name}`)).toEqual(['2026-10-20 Usage', '2026-11-09 Apify Starter'])
  })

  it('orders by date, then name', () => {
    const c = upcomingCharges([
      bill({ name: 'Zeta', nextChargeOn: '2026-10-14' }),
      bill({ name: 'Alpha', nextChargeOn: '2026-10-14' }),
      bill({ name: 'Early', nextChargeOn: '2026-10-10' }),
    ], today)
    expect(c.slice(0, 3).map((x) => x.name)).toEqual(['Early', 'Alpha', 'Zeta'])
  })
})

describe('a billing cycle that starts on the 9th', () => {
  it('starts today on the 9th', () => {
    expect(billingCycle('2026-10-09', 9)).toEqual({ start: '2026-10-09', next: '2026-11-09', daysElapsed: 1, daysInCycle: 31 })
  })

  it('belongs to last month\'s cycle until the 9th', () => {
    expect(billingCycle('2026-10-08', 9)).toEqual({ start: '2026-09-09', next: '2026-10-09', daysElapsed: 30, daysInCycle: 30 })
  })

  it('crosses the year', () => {
    expect(billingCycle('2027-01-03', 9)).toMatchObject({ start: '2026-12-09', next: '2027-01-09' })
  })
})
