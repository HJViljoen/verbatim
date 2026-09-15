import { describe, expect, it } from 'vitest'
import { monthRuns } from './month-key'

// monthStartOf and nextMonth are covered in monthly.test.ts, which still reads
// them through monthly.ts's re-export.

describe('monthRuns', () => {
  it('makes one run of an unbroken stretch', () => {
    expect(monthRuns(['2026-01-01', '2026-02-01', '2026-03-01'])).toEqual([['2026-01-01', '2026-02-01', '2026-03-01']])
  })

  it('splits where the calendar skips a month', () => {
    expect(monthRuns(['2026-01-01', '2026-02-01', '2026-04-01']))
      .toEqual([['2026-01-01', '2026-02-01'], ['2026-04-01']])
  })

  it('sorts, de-duplicates and normalises whatever it is handed', () => {
    expect(monthRuns(['2026-02-14T09:00:00.000Z', '2026-01-01', '2026-02-01']))
      .toEqual([['2026-01-01', '2026-02-01']])
  })

  it('crosses a year boundary without breaking the run', () => {
    expect(monthRuns(['2025-12-01', '2026-01-01'])).toEqual([['2025-12-01', '2026-01-01']])
  })

  it('has no runs at all in an empty list', () => {
    expect(monthRuns([])).toEqual([])
  })
})
