import { describe, it, expect } from 'vitest'
import { dayFloor } from './report-delta'

// "Previous update" has to mean a previous DAY. run_date is a timestamptz, so
// an `.lt(run_date)` filter also matches a rerun from earlier the same
// morning — and a report whose every delta is measured against three hours ago
// says "nothing moved" about a week in which plenty did.
describe('dayFloor — the previous-update cut', () => {
  it('cuts at the calendar day, not the instant', () => {
    expect(dayFloor('2026-09-13T06:00:00.000Z')).toBe('2026-09-13')
  })

  it('excludes a rerun from earlier the same day', () => {
    const current = '2026-09-13T18:30:00.000Z'
    const sameDayRerun = '2026-09-13T06:00:00.000Z'
    expect(sameDayRerun < dayFloor(current)).toBe(false)
  })

  it('still finds the previous day', () => {
    const current = '2026-09-13T06:00:00.000Z'
    const lastWeek = '2026-09-06T06:00:00.000Z'
    expect(lastWeek < dayFloor(current)).toBe(true)
  })

  it('handles a date-only run_date', () => {
    expect(dayFloor('2026-09-13')).toBe('2026-09-13')
  })
})
