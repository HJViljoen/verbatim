import { describe, expect, it } from 'vitest'
import { monthlyMonthOf } from './monthly'

// The monthly's loader is glue (the front page's loader on an ended month);
// what is pure is which month it reads (plan WP2.1: `MonthlyData.month` is
// always an ended month; decision A: the monthly reads the month that has
// just ended).

describe('the month the monthly reads', () => {
  const closed = '2026-09'

  it('is the latest ended month with a row where none is named', () => {
    expect(monthlyMonthOf('2026-10-12T06:00:00.000Z', null, closed)).toBe('2026-09')
    expect(monthlyMonthOf('2026-10-12T06:00:00.000Z', undefined, '2026-09-01')).toBe('2026-09')
  })

  it('is a named month that has ended', () => {
    expect(monthlyMonthOf('2026-10-12T06:00:00.000Z', '2026-08', closed)).toBe('2026-08')
    expect(monthlyMonthOf('2026-10-12T06:00:00.000Z', '2026-09-01', closed)).toBe('2026-09')
  })

  it('never a month still running, whatever the caller names', () => {
    // "October in your market" over twelve days of October is not a monthly.
    expect(monthlyMonthOf('2026-10-12T06:00:00.000Z', '2026-10', closed)).toBe('2026-09')
    expect(monthlyMonthOf('2026-10-12T06:00:00.000Z', '2026-11', closed)).toBe('2026-09')
  })

  it('ignores a name that is not a month', () => {
    expect(monthlyMonthOf('2026-10-12T06:00:00.000Z', 'september', closed)).toBe('2026-09')
    expect(monthlyMonthOf('2026-10-12T06:00:00.000Z', '2026-13', closed)).toBe('2026-09')
  })
})
