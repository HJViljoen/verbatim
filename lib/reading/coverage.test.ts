import { describe, it, expect } from 'vitest'
import { SLICE, coverage, perAudience, shapeCoverage, sliceMonths } from './coverage'
import type { DenominatorReading } from './types'

// The coverage table's arithmetic. The rows come from a SQL function no test
// here can reach; what is asserted is which rows exist, which months count, and
// that an audience nobody talked about still gets a line.

const FLOOR = 100

const row = (month: string, audience: string, videos: number, comments: number): DenominatorReading => ({
  month,
  audience,
  videos,
  comments,
  platform_mix: {},
  dual_mention: 0,
  excluded_undated: 0,
})

// Össur's four thick months, rounded to the shape of the real reading.
const OSSUR: DenominatorReading[] = [
  row('2026-06-01', 'client', 16, 120),
  row('2026-07-01', 'client', 8, 40),
  row('2026-08-01', 'client', 20, 237),
  row('2026-06-01', 'competitor:Ottobock', 34, 300),
  row('2026-08-01', 'competitor:Ottobock', 73, 1264),
  row('2026-06-01', 'industry-other', 182, 4000),
  row('2026-07-01', 'industry-other', 118, 2000),
  row('2026-08-01', 'industry-other', 628, 23542),
]

describe('shapeCoverage — one audience, both units', () => {
  it('counts the months clearing each floor separately', () => {
    const shaped = shapeCoverage('industry-other', OSSUR.filter((r) => r.audience === 'industry-other'), FLOOR)
    expect(shaped.monthsWithAny).toBe(3)
    expect(shaped.monthsVideos).toBe(3)
    expect(shaped.monthsComments).toBe(3)
    expect(shaped.biggestVideos).toBe(628)
    expect(shaped.biggestComments).toBe(23542)
    expect(shaped.firstMonth).toBe('2026-06')
    expect(shaped.lastMonth).toBe('2026-08')
  })

  it('reads thin in videos and fat in comments — the reason both columns exist', () => {
    const shaped = shapeCoverage('client', OSSUR.filter((r) => r.audience === 'client'), FLOOR)
    expect(shaped.monthsVideos).toBe(0)
    expect(shaped.monthsComments).toBe(2)
  })

  it('survives an audience with no month at all rather than printing -Infinity', () => {
    const shaped = shapeCoverage('competitor:Rareform', [], FLOOR)
    expect(shaped).toEqual({
      audience: 'competitor:Rareform',
      monthsWithAny: 0,
      monthsVideos: 0,
      monthsComments: 0,
      firstMonth: null,
      lastMonth: null,
      biggestVideos: 0,
      biggestComments: 0,
    })
  })

  it('orders the span by month, not by the order the rows arrived', () => {
    const shaped = shapeCoverage(
      'industry-other',
      [row('2026-08-01', 'industry-other', 1, 1), row('2025-12-01', 'industry-other', 1, 1)],
      FLOOR,
    )
    expect(shaped.firstMonth).toBe('2025-12')
    expect(shaped.lastMonth).toBe('2026-08')
  })
})

describe('sliceMonths — every audience together', () => {
  it('pools the audiences month by month', () => {
    const pooled = sliceMonths(OSSUR)
    expect(pooled.get('2026-06-01')).toEqual({ videos: 16 + 34 + 182, comments: 120 + 300 + 4000 })
    expect(pooled.get('2026-07-01')).toEqual({ videos: 8 + 118, comments: 40 + 2000 })
    expect(pooled.get('2026-08-01')).toEqual({ videos: 20 + 73 + 628, comments: 237 + 1264 + 23542 })
  })

  it('keys on the month, however the caller spelled it', () => {
    const pooled = sliceMonths([
      row('2026-08-01T00:00:00.000Z', 'client', 2, 3),
      row('2026-08-14', 'industry-other', 5, 7),
    ])
    expect([...pooled.keys()]).toEqual(['2026-08-01'])
    expect(pooled.get('2026-08-01')).toEqual({ videos: 7, comments: 10 })
  })
})

describe('perAudience — the same pooling, grouped the other way', () => {
  it('sums a set of months per audience', () => {
    const per = perAudience(OSSUR)
    expect(per.get('client')).toEqual({ videos: 44, comments: 397 })
    expect(per.get('competitor:Ottobock')).toEqual({ videos: 107, comments: 1564 })
    expect(per.size).toBe(3)
  })

  it('is empty for a window nobody spoke in', () => {
    expect(perAudience([]).size).toBe(0)
  })
})

describe('coverage — the table', () => {
  it('puts the pooled slice last, after every audience', () => {
    const table = coverage(OSSUR, FLOOR)
    expect(table.map((r) => r.audience)).toEqual(['client', 'competitor:Ottobock', 'industry-other', SLICE])
    const pooled = table.at(-1)!
    expect(pooled.monthsWithAny).toBe(3)
    expect(pooled.biggestVideos).toBe(721)
    expect(pooled.biggestComments).toBe(25043)
    // June 232 and August 721 clear 100 videos; July's 126 does too.
    expect(pooled.monthsVideos).toBe(3)
  })

  it('gives a tracked rival with no conversation a row of its own', () => {
    const table = coverage(OSSUR, FLOOR, ['competitor:Ottobock', 'competitor:Rareform'])
    const rareform = table.find((r) => r.audience === 'competitor:Rareform')
    expect(rareform?.monthsWithAny).toBe(0)
    expect(rareform?.firstMonth).toBeNull()
    // And the rival that DOES have months is not emptied by being named too.
    expect(table.find((r) => r.audience === 'competitor:Ottobock')?.monthsWithAny).toBe(2)
    expect(table.map((r) => r.audience)).toEqual([
      'client', 'competitor:Ottobock', 'competitor:Rareform', 'industry-other', SLICE,
    ])
  })

  it('still prints the slice row when there is nothing to pool', () => {
    const table = coverage([], FLOOR, ['competitor:Rareform'])
    expect(table.map((r) => r.audience)).toEqual(['competitor:Rareform', SLICE])
    expect(table.every((r) => r.monthsWithAny === 0)).toBe(true)
  })

  it('counts a month once per audience, never once per row', () => {
    // Two platforms, one month, one audience is still one month.
    const table = coverage([row('2026-08-01', 'industry-other', 628, 23542)], FLOOR)
    expect(table[0].monthsWithAny).toBe(1)
    expect(table.at(-1)!.monthsWithAny).toBe(1)
  })
})
