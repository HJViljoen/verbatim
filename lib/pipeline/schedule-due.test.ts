import { describe, it, expect } from 'vitest'
import { localDate, isWeeklyDue, isMonthlyDue, lastExpectedSlot } from './schedule-due'

// SAST is UTC+2 all year (South Africa has never observed DST), so every
// expectation below is the UTC instant two hours before the local wall clock.

describe('localDate', () => {
  it('reads the weekday in Africa/Johannesburg, not UTC', () => {
    // Saturday 23:30 UTC is already Sunday 01:30 in Johannesburg — the edge that
    // decides whether a Sunday client is due today.
    const local = localDate(new Date('2026-09-12T23:30:00Z'))
    expect(local.weekday).toBe('sunday')
    expect(local.dayOfMonth).toBe(13)
    expect(local.hour).toBe(1)
  })

  it('reads the day of month in local time across a month boundary', () => {
    const local = localDate(new Date('2026-08-31T22:15:00Z'))
    expect(local.dayOfMonth).toBe(1)
    expect(local.month).toBe(9)
  })
})

describe('isWeeklyDue / isMonthlyDue', () => {
  it('fires a weekly client on its report_day only', () => {
    const cfg = { report_period: 'weekly', report_day: 'sunday' }
    expect(isWeeklyDue(cfg, { weekday: 'sunday' })).toBe(true)
    expect(isWeeklyDue(cfg, { weekday: 'monday' })).toBe(false)
  })

  it('fires a monthly client on the 1st only', () => {
    const cfg = { report_period: 'monthly', report_day: 'monday' }
    expect(isMonthlyDue(cfg, { dayOfMonth: 1 })).toBe(true)
    expect(isMonthlyDue(cfg, { dayOfMonth: 2 })).toBe(false)
  })

  it('never fires a paused client', () => {
    // report_period is not constrained to an enum; 'paused' is live in prod.
    const cfg = { report_period: 'paused', report_day: 'sunday' }
    expect(isWeeklyDue(cfg, { weekday: 'sunday' })).toBe(false)
    expect(isMonthlyDue(cfg, { dayOfMonth: 1 })).toBe(false)
  })
})

describe('lastExpectedSlot', () => {
  const sunday = { report_period: 'weekly', report_day: 'sunday' }

  it('gives last Sunday 06:00 SAST for a Sunday client looked at on a Wednesday', () => {
    const slot = lastExpectedSlot(sunday, new Date('2026-09-16T12:00:00Z'))
    expect(slot?.toISOString()).toBe('2026-09-13T04:00:00.000Z')
  })

  it('gives today 06:00 SAST once the slot has passed', () => {
    // Sunday 07:00 SAST.
    const slot = lastExpectedSlot(sunday, new Date('2026-09-13T05:00:00Z'))
    expect(slot?.toISOString()).toBe('2026-09-13T04:00:00.000Z')
  })

  it('gives the PREVIOUS Sunday before today 06:00 SAST has arrived', () => {
    // Sunday 01:30 SAST — locally it is the report day, but the slot is hours away.
    const slot = lastExpectedSlot(sunday, new Date('2026-09-12T23:30:00Z'))
    expect(slot?.toISOString()).toBe('2026-09-06T04:00:00.000Z')
  })

  it('gives the 1st at 06:00 SAST for a monthly client on the 3rd', () => {
    const slot = lastExpectedSlot({ report_period: 'monthly', report_day: null }, new Date('2026-09-03T09:00:00Z'))
    expect(slot?.toISOString()).toBe('2026-09-01T04:00:00.000Z')
  })

  it('falls back to last month for a monthly client before 06:00 on the 1st', () => {
    // 05:00 SAST on 1 September.
    const slot = lastExpectedSlot({ report_period: 'monthly', report_day: null }, new Date('2026-09-01T03:00:00Z'))
    expect(slot?.toISOString()).toBe('2026-08-01T04:00:00.000Z')
  })

  it('has no expected slot for a paused or unknown cadence', () => {
    expect(lastExpectedSlot({ report_period: 'paused', report_day: 'sunday' }, new Date())).toBeNull()
    expect(lastExpectedSlot({ report_period: 'weekly', report_day: 'someday' }, new Date())).toBeNull()
    expect(lastExpectedSlot({ report_period: null, report_day: null }, new Date())).toBeNull()
  })
})
