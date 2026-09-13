import { describe, it, expect } from 'vitest'
import { dayFloor, pickBaselines, type RunSummaryRow } from './report-delta'

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

// 2026-09-13: the Össur digest reported "+12.2 pt share of voice" and "−2,152
// comments" against the 6 Sep run — a manual `skipGather: true` catch-up
// (pipeline_runs.options = {"runId":…,"skipGather":true}) that scraped no
// videos and re-attributed old comments, so its period columns were not a week
// of anything. Period metrics must step over it; cumulative ones need not.
describe('pickBaselines — which update a delta is measured against', () => {
  const row = (runId: string, runDate: string): RunSummaryRow =>
    ({ run_id: runId, run_date: runDate } as RunSummaryRow)
  // Newest first, as the query returns them: a full run, the catch-up, a full run.
  const priors = [row('sep06', '2026-09-06T12:39:36Z'), row('aug30', '2026-08-30T09:35:54Z')]

  it('period metrics skip a skipGather catch-up; cumulative ones keep the previous run', () => {
    const picked = pickBaselines(priors, new Set(['sep06']))!
    expect(picked.prev.run_id).toBe('sep06')
    expect(picked.periodPrev.run_id).toBe('aug30')
  })

  it('uses the immediate previous run when it gathered', () => {
    const picked = pickBaselines(priors, new Set())!
    expect(picked.prev.run_id).toBe('sep06')
    expect(picked.periodPrev.run_id).toBe('sep06')
  })

  it('steps over a run of catch-ups to the last run that gathered', () => {
    const three = [row('sep13', '2026-09-13T06:00:00Z'), ...priors]
    const picked = pickBaselines(three, new Set(['sep13', 'sep06']))!
    expect(picked.prev.run_id).toBe('sep13')
    expect(picked.periodPrev.run_id).toBe('aug30')
  })

  it('falls back to the previous run when every prior one skipped gather, and is null with no history', () => {
    const picked = pickBaselines(priors, new Set(['sep06', 'aug30']))!
    expect(picked.periodPrev.run_id).toBe('sep06')
    expect(pickBaselines([], new Set())).toBeNull()
  })
})
