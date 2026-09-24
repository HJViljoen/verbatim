import { describe, it, expect } from 'vitest'
import {
  DEFAULT_HORIZON,
  HORIZONS,
  HORIZON_LABEL,
  HORIZON_PARAM,
  horizonDates,
  horizonWindow,
  parseHorizon,
  sinceStart,
} from './horizon'
import { SENTIMENT_BAND } from '../report-bands'

const NOW = '2026-09-15T10:00:00.000Z'

describe('parseHorizon', () => {
  it('reads every horizon the control offers', () => {
    for (const h of HORIZONS) expect(parseHorizon(h)).toBe(h)
  })

  it('falls back to the default rather than erroring — a stale link still opens', () => {
    expect(parseHorizon('last_6')).toBe(DEFAULT_HORIZON)
    expect(parseHorizon(undefined)).toBe(DEFAULT_HORIZON)
    expect(parseHorizon(null)).toBe(DEFAULT_HORIZON)
    expect(parseHorizon('')).toBe(DEFAULT_HORIZON)
  })

  it('names the parameter once', () => {
    expect(HORIZON_PARAM).toBe('horizon')
  })

  it('has client-facing words with no jargon in them', () => {
    const words = Object.values(HORIZON_LABEL).join(' ').toLowerCase()
    for (const jargon of ['window', 'range', 'basis', 'run', 'pass ']) expect(words).not.toContain(jargon)
    expect(HORIZON_LABEL.since_start).toBe('Since we started')
  })
})

describe('horizonWindow', () => {
  it('this month is the month in hand, against the month before it', () => {
    const w = horizonWindow('this_month', NOW)
    expect(w.months).toEqual(['2026-09-01'])
    expect(w.kind).toBe('month')
    expect(w.from).toBe('2026-09-01T00:00:00.000Z')
    expect(w.to).toBe('2026-10-01T00:00:00.000Z')
    expect(w.basis).toEqual({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
      months: ['2026-08-01'],
    })
  })

  it('last 3 ends on the month in hand and is compared with the equal window before', () => {
    const w = horizonWindow('last_3', NOW)
    expect(w.months).toEqual(['2026-07-01', '2026-08-01', '2026-09-01'])
    expect(w.kind).toBe('quarter')
    expect(w.basis!.months).toEqual(['2026-04-01', '2026-05-01', '2026-06-01'])
    expect(w.basis!.to).toBe('2026-07-01T00:00:00.000Z')
  })

  it('last 12 spans a year and crosses the year end cleanly', () => {
    const w = horizonWindow('last_12', NOW)
    expect(w.months).toHaveLength(12)
    expect(w.months[0]).toBe('2025-10-01')
    expect(w.months[11]).toBe('2026-09-01')
    // the window the refuter measured 62 distinct videos over
    expect(w.from).toBe('2025-10-01T00:00:00.000Z')
    expect(w.to).toBe('2026-10-01T00:00:00.000Z')
    expect(w.basis!.months[0]).toBe('2024-10-01')
    expect(w.basis!.months).toHaveLength(12)
  })

  it('never drops the month in hand for being still filling', () => {
    for (const h of HORIZONS) {
      expect(horizonWindow(h, NOW).months).toContain('2026-09-01')
    }
  })

  it('since we started runs from the first readable month to the month in hand', () => {
    const w = horizonWindow('since_start', NOW, '2026-06-01')
    expect(w.months).toEqual(['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'])
    expect(w.kind).toBe('since')
    expect(w.basis).toBeNull()
  })

  it('since we started is the month in hand when nothing can be read back yet', () => {
    expect(horizonWindow('since_start', NOW).months).toEqual(['2026-09-01'])
    expect(horizonWindow('since_start', NOW, null).months).toEqual(['2026-09-01'])
  })

  it('does not run backwards when the first readable month is in the future', () => {
    expect(horizonWindow('since_start', NOW, '2026-12-01').months).toEqual(['2026-09-01'])
  })

  it('takes the month `now` falls in, whatever the time of day', () => {
    expect(horizonWindow('this_month', '2026-09-01T00:00:00.000Z').months).toEqual(['2026-09-01'])
    expect(horizonWindow('this_month', '2026-09-30T23:59:59.000Z').months).toEqual(['2026-09-01'])
  })

  it('walks back over a January boundary', () => {
    const w = horizonWindow('last_3', '2026-01-10T00:00:00.000Z')
    expect(w.months).toEqual(['2025-11-01', '2025-12-01', '2026-01-01'])
    expect(w.basis!.months).toEqual(['2025-08-01', '2025-09-01', '2025-10-01'])
  })

  it('the basis is the same length as the window it is compared with', () => {
    for (const h of ['this_month', 'last_3', 'last_12'] as const) {
      const w = horizonWindow(h, NOW)
      expect(w.basis!.months).toHaveLength(w.months.length)
    }
  })
})

describe('sinceStart', () => {
  // Össur's category: months with a row from 2020-10, four of which clear 100.
  const ossur = [
    { month: '2020-10-01', videos: 3 },
    { month: '2022-09-01', videos: 12 },
    { month: '2026-06-01', videos: 182 },
    { month: '2026-07-01', videos: 118 },
    { month: '2026-08-01', videos: 628 },
    { month: '2026-09-01', videos: 388 },
  ]

  it('starts at the first month that cleared the floor, not the first stored month', () => {
    const s = sinceStart(ossur)
    expect(s.from).toBe('2026-06-01')
    expect(s.earliest).toBe('2020-10-01')
  })

  it('counts the months it left out and says so in one line', () => {
    const s = sinceStart(ossur)
    expect(s.earlier).toBe(2)
    expect(s.label).toBe('2 earlier months hold too little to read.')
  })

  it('says "month holds" for one', () => {
    const s = sinceStart([{ month: '2026-05-01', videos: 3 }, { month: '2026-06-01', videos: 182 }])
    expect(s.earlier).toBe(1)
    expect(s.label).toBe('1 earlier month holds too little to read.')
  })

  it('has no line when nothing was left out', () => {
    const s = sinceStart([{ month: '2026-06-01', videos: 182 }])
    expect(s.earlier).toBe(0)
    expect(s.label).toBeNull()
  })

  it('takes the FIRST clearing month even when a later one is bigger', () => {
    expect(sinceStart(ossur).from).toBe('2026-06-01')
  })

  it('answers null when no month has ever cleared the floor — every rival audience today', () => {
    const rival = [{ month: '2026-08-01', videos: 33 }, { month: '2026-09-01', videos: 27 }]
    const s = sinceStart(rival)
    expect(s.from).toBeNull()
    expect(s.earliest).toBe('2026-08-01')
    expect(s.label).toBeNull()
  })

  it('answers nothing at all for a tenant with no rows', () => {
    expect(sinceStart([])).toEqual({ from: null, earliest: null, earlier: 0, label: null })
  })

  it('counts one month once, however many audiences carried it', () => {
    const rows = [
      { month: '2026-05-01', videos: 3 },
      { month: '2026-05-01', videos: 7 },
      { month: '2026-06-01', videos: 182 },
    ]
    expect(sinceStart(rows).earlier).toBe(1)
  })

  it('takes another floor when a caller has one', () => {
    const rows = [{ month: '2026-05-01', videos: 120 }, { month: '2026-06-01', videos: 182 }]
    expect(sinceStart(rows, SENTIMENT_BAND).from).toBe('2026-05-01')
  })
})

describe('horizonDates', () => {
  it('names one month on its own', () => {
    expect(horizonDates(horizonWindow('this_month', NOW))).toBe('Sep 2026')
  })

  it('names both ends of a longer horizon', () => {
    expect(horizonDates(horizonWindow('last_3', NOW))).toBe('Jul 2026 to Sep 2026')
  })

  it('is empty when there is nothing to name', () => {
    expect(horizonDates({ months: [] })).toBe('')
  })
})
