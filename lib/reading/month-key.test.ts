import { describe, expect, it } from 'vitest'
import { longMonth, monthStartOf, nextMonth, prevMonth } from './month-key'

// The month key's arithmetic. `monthStartOf` and `nextMonth` shipped with WP10
// untested here (they are exercised through the chart); `prevMonth` and
// `longMonth` arrive with WP17, which needs "at this point in August" from
// September, and they cross a year boundary in the one direction nothing else
// in the codebase does.

describe('prevMonth', () => {
  it('steps back one month', () => {
    expect(prevMonth('2026-09-01')).toBe('2026-08-01')
  })

  it('crosses a year boundary backwards', () => {
    expect(prevMonth('2026-01-01')).toBe('2025-12-01')
  })

  it('normalises a mid-month date first', () => {
    expect(prevMonth('2026-03-31')).toBe('2026-02-01')
  })

  it('is the inverse of nextMonth', () => {
    for (const m of ['2026-01-01', '2026-02-01', '2026-12-01', '2024-02-01']) {
      expect(nextMonth(prevMonth(m))).toBe(monthStartOf(m))
    }
  })
})

describe('longMonth', () => {
  it('is the long form, in UTC', () => {
    expect(longMonth('2026-09-01')).toBe('September')
    expect(longMonth('2026-01-31')).toBe('January')
  })
})
