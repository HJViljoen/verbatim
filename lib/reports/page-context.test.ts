import { describe, expect, it } from 'vitest'

import { activePreset, archivePresets, collapseMonth, lastDayOf, presetLine } from './page-context'
import type { UpdateInput } from '../readiness/types'

const run = (day: string, status = 'completed'): UpdateInput => ({
  id: day,
  status,
  startedAt: `${day}T06:00:00.000Z`,
  completedAt: `${day}T07:00:00.000Z`,
})

describe('lastDayOf', () => {
  it('is the month’s own last day, leap year included', () => {
    expect(lastDayOf('2026-09-01')).toBe('2026-09-30')
    expect(lastDayOf('2026-02-01')).toBe('2026-02-28')
    expect(lastDayOf('2024-02-01')).toBe('2024-02-29')
    expect(lastDayOf('2026-12-01')).toBe('2026-12-31')
  })
})

describe('archivePresets', () => {
  const updates = [
    run('2026-07-05'), run('2026-08-02'), run('2026-08-30'),
    run('2026-09-06'), run('2026-09-13'), run('2026-09-20'), run('2026-09-27'),
  ]

  it('is this month, the two before it, and all-time', () => {
    const p = archivePresets(updates, '2026-09-01')
    expect(p.map((x) => x.label)).toEqual(['September', 'August', 'July', 'Since we started'])
    expect(p.map((x) => x.updates)).toEqual([4, 2, 1, 7])
  })

  it('crosses a year boundary without naming the wrong months', () => {
    const p = archivePresets([], '2026-01-01')
    expect(p.map((x) => x.label)).toEqual(['January', 'December', 'November', 'Since we started'])
    expect(p[1].from).toBe('2025-12-01')
    expect(p[1].to).toBe('2025-12-31')
  })

  // AN UPDATE IS COUNTED WHEN IT SETTLED WELL. A failed run happened, and the
  // delivery record counts it as a failure; this line is about what was
  // DELIVERED in a month, which is what the chip beside it claims.
  it('counts what was delivered, not what was attempted', () => {
    const p = archivePresets([...updates, run('2026-09-28', 'failed')], '2026-09-01')
    expect(p[0].updates).toBe(4)
  })

  // The dated list reads oldest first, the way the artboard draws it.
  it('dates them oldest first', () => {
    const p = archivePresets(updates, '2026-09-01')
    expect(p[0].dates).toEqual(['6 Sep', '13 Sep', '20 Sep', '27 Sep'])
  })

  it('bounds each chip on the DAY, which is what the archive’s filter compares', () => {
    const p = archivePresets([], '2026-09-01')
    expect(p[0].from).toBe('2026-09-01')
    expect(p[0].to).toBe('2026-09-30')
    expect(p[3].from).toBeNull()
    expect(p[3].to).toBeNull()
  })
})

describe('presetLine', () => {
  const p = archivePresets(
    [run('2026-09-06'), run('2026-09-13'), run('2026-09-20'), run('2026-09-27')],
    '2026-09-01',
  )

  it('counts UPDATES and names their days', () => {
    expect(presetLine(p[0])).toBe('4 updates in September · 6, 13, 20, 27 Sep')
  })

  it('says nothing ran rather than printing a zero', () => {
    expect(presetLine(p[1])).toBe('No update in August.')
  })

  it('drops the dates where they are not a line', () => {
    const many = { ...p[0], key: 'all', label: 'Since we started', updates: 23, dates: Array(23).fill('6 Apr') }
    expect(presetLine(many)).toBe('23 updates on record')
  })
})

describe('collapseMonth', () => {
  it('names the month once where they are all in one', () => {
    expect(collapseMonth(['6 Sep', '13 Sep', '20 Sep', '27 Sep'])).toBe('6, 13, 20, 27 Sep')
  })

  // "6, 13, 20, 27 Sep" about two Septembers is two lies in one line.
  it('names every month where they are not', () => {
    expect(collapseMonth(['30 Aug', '6 Sep'])).toBe('30 Aug, 6 Sep')
  })

  it('leaves one date alone', () => {
    expect(collapseMonth(['6 Sep'])).toBe('6 Sep')
  })
})

describe('activePreset', () => {
  const p = archivePresets([], '2026-09-01')

  it('is the all-time chip where the reader has set no filter', () => {
    expect(activePreset(p, { from: null, to: null })).toBe('all')
  })

  it('is the month whose exact bounds the filter carries', () => {
    expect(activePreset(p, { from: '2026-08-01', to: '2026-08-31' })).toBe('2026-08-01')
  })

  // A hand-typed range is nobody's chip, and lighting one would tell a reader
  // the dates in the two inputs beside it are not what is being shown.
  it('is nothing for a range a reader typed', () => {
    expect(activePreset(p, { from: '2026-08-14', to: '2026-09-02' })).toBeNull()
  })
})
