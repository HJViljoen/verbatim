import { describe, expect, it } from 'vitest'
import { isTestRun, monthKey, quarterKey, reportTargets, scheduleDue } from './due'

const run = '2026-09-06T04:05:00Z' // Sunday 06:05 SAST

describe('scheduleDue', () => {
  it('an inactive schedule never fires', () => {
    expect(scheduleDue({ cadence: 'every_update', active: false }, null, run)).toBe(false)
    expect(scheduleDue({ cadence: 'monthly', active: false }, null, run)).toBe(false)
  })
  it('every update: fires whenever the update did', () => {
    expect(scheduleDue({ cadence: 'every_update', active: true }, null, run)).toBe(true)
    expect(scheduleDue({ cadence: 'every_update', active: true }, '2026-09-05T04:05:00Z', run)).toBe(true)
  })
  it('monthly: the first update of a month fires, the second does not', () => {
    const s = { cadence: 'monthly' as const, active: true }
    expect(scheduleDue(s, null, run)).toBe(true)
    expect(scheduleDue(s, '2026-08-30T05:10:00Z', run)).toBe(true) // last month
    expect(scheduleDue(s, '2026-09-06T05:10:00Z', '2026-09-13T04:05:00Z')).toBe(false) // same month
  })
  it('months are read in SAST, not UTC', () => {
    // 23:30 UTC on 31 Aug is 01:30 SAST on 1 Sep
    expect(monthKey('2026-08-31T23:30:00Z', 'Africa/Johannesburg')).toBe('2026-09')
    expect(monthKey('2026-08-31T23:30:00Z', 'UTC')).toBe('2026-08')
    expect(scheduleDue({ cadence: 'monthly', active: true }, '2026-08-30T05:10:00Z', '2026-08-31T23:30:00Z')).toBe(true)
  })
})

describe('quarterly (Phase 1 WP16)', () => {
  const q = { cadence: 'quarterly' as const, active: true }

  it('fires on the first update of a quarter and not again inside it', () => {
    expect(scheduleDue(q, null, '2026-07-05T06:00:00Z')).toBe(true)
    expect(scheduleDue(q, '2026-07-05T06:00:00Z', '2026-08-02T06:00:00Z')).toBe(false)
    expect(scheduleDue(q, '2026-07-05T06:00:00Z', '2026-09-28T06:00:00Z')).toBe(false)
    expect(scheduleDue(q, '2026-07-05T06:00:00Z', '2026-10-04T06:00:00Z')).toBe(true)
  })

  it('crosses a year the way the calendar does', () => {
    expect(quarterKey('2026-12-31T22:30:00Z', 'Africa/Johannesburg')).toBe('2027-Q1')
    expect(scheduleDue(q, '2026-11-01T06:00:00Z', '2027-01-03T06:00:00Z')).toBe(true)
  })

  it('never fires while the schedule is off', () => {
    expect(scheduleDue({ cadence: 'quarterly', active: false }, null, '2026-07-05T06:00:00Z')).toBe(false)
  })
})

describe('reportTargets: which schedules an update fires (5 Oct)', () => {
  const sched = (over: Record<string, unknown>) => ({
    id: 'x', name: 'x', cadence: 'every_update' as const, active: true, last_sent_at: null, starter_key: null, artefact: null, ...over,
  })
  // Össur today: the legacy digest (a template, review on, nobody on it) and
  // the weekly read (review on, nobody on it).
  const digest = sched({ id: 'dg', name: 'Weekly digest', last_sent_at: '2026-09-13T06:28:00Z' })
  const read = sched({ id: 'wr', name: 'This week in your market', starter_key: 'weekly_read', artefact: 'weekly_read' })
  // Sealand's retired weekly report, switched off.
  const off = sched({ id: 'wk', name: 'Weekly digest', starter_key: 'weekly_report', artefact: 'weekly', active: false })

  it('a scheduled update fires every due schedule as before, each free to email', () => {
    expect(reportTargets([digest, read, off], run)).toEqual([{ id: 'dg', name: 'Weekly digest' }, { id: 'wr', name: 'This week in your market' }])
  })

  it('a manual update fires the active weekly read alone, emailing nobody: no digest, no monthly, no brief', () => {
    const monthly = sched({ id: 'mo', name: 'Monthly', cadence: 'monthly', starter_key: 'monthly_report', artefact: 'monthly' })
    const brief = sched({ id: 'br', name: 'Sales brief', artefact: 'brief:sales' })
    expect(reportTargets([digest, read, off, monthly, brief], run, { manual: true })).toEqual([{ id: 'wr', name: 'This week in your market', noEmail: true }])
  })

  it('a weekly read that is not due still builds on a scheduled update, emailing nobody', () => {
    const monthlyRead = sched({ id: 'wr', name: 'This week in your market', cadence: 'monthly', starter_key: 'weekly_read', artefact: 'weekly_read', last_sent_at: '2026-09-01T06:00:00Z' })
    expect(reportTargets([monthlyRead], '2026-09-13T04:05:00Z')).toEqual([{ id: 'wr', name: 'This week in your market', noEmail: true }])
    // Due again in October: free to email.
    expect(reportTargets([monthlyRead], '2026-10-04T04:05:00Z')).toEqual([{ id: 'wr', name: 'This week in your market' }])
  })

  it('a weekly read that is switched off fires on no update', () => {
    const paused = { ...read, active: false }
    expect(reportTargets([paused], run)).toEqual([])
    expect(reportTargets([paused], run, { manual: true })).toEqual([])
  })

  it('the weekly read is named by its starter key where the artefact column is absent', () => {
    const legacy = sched({ id: 'wr', name: 'This week in your market', starter_key: 'weekly_read', artefact: undefined })
    expect(reportTargets([legacy], run, { manual: true })).toEqual([{ id: 'wr', name: 'This week in your market', noEmail: true }])
  })
})

describe('isTestRun: a test run never publishes (the lead\'s call, 5 Oct)', () => {
  it('a real manual run is not one: a full gather (Össur\'s 4 Oct run, options {}), or a resume of its own row', () => {
    expect(isTestRun({ id: '555af400', options: {} })).toBe(false)
    expect(isTestRun({ id: '555af400', options: null })).toBe(false)
    expect(isTestRun({ id: 'r1', options: { runId: 'r1', skipGather: true } })).toBe(false)
    expect(isTestRun({ id: 'r1', options: { publish: true } })).toBe(false)
  })
  it('a rehearsal that gathered nothing, a capped run, publish:false, or a run row not read, is one', () => {
    expect(isTestRun({ id: 'e80e9347', options: { skipGather: true } })).toBe(true)
    expect(isTestRun({ id: 'r1', options: { videoLimit: 5 } })).toBe(true)
    expect(isTestRun({ id: 'r1', options: { maxVideos: 20 } })).toBe(true)
    expect(isTestRun({ id: 'r1', options: { publish: false } })).toBe(true)
    expect(isTestRun(null)).toBe(true)
  })
  it('a manual test run fires nothing; a scheduled run is never dropped for it', () => {
    const read = { id: 'wr', name: 'This week in your market', cadence: 'every_update' as const, active: true, last_sent_at: null, starter_key: 'weekly_read', artefact: 'weekly_read' }
    expect(reportTargets([read], run, { manual: true, testRun: true })).toEqual([])
    expect(reportTargets([read], run, { manual: true, testRun: false })).toEqual([{ id: 'wr', name: 'This week in your market', noEmail: true }])
    expect(reportTargets([read], run, { testRun: true })).toEqual([{ id: 'wr', name: 'This week in your market' }])
  })
})
