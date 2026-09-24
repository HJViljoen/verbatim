import { describe, expect, it } from 'vitest'
import { monthStartOf, nextMonth, prevMonth } from './month-key'

// The month key's arithmetic. `monthStartOf` and `nextMonth` shipped with WP10
// untested here (they are exercised through the chart); `prevMonth` arrives
// with WP17, which needs "at this point in August" from September, and it
// crosses a year boundary in the one direction nothing else in the codebase
// does. `longMonth` was written here too and lives in lib/format.ts, where its
// test is (see the note at its old place in month-key.ts).

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
