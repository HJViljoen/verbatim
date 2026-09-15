import { describe, it, expect } from 'vitest'
import {
  BASELINE_MONTHS,
  FAMILY_ALPHA,
  KIND_SET,
  MAX_FLAGS,
  TOP_THEMES,
  baselineLabel,
  baselineStateOf,
  holmRejections,
  standardErrorPts,
  topThemesByBaseline,
  twoSidedP,
  weekVsBaseline,
  type DenominatorSeries,
  type PreRegisteredObject,
} from './anomaly'
import { SHARE_BAND, proportionDelta } from '../report-bands'

// The anomaly check's whole rule is here: the floors, the correction for the
// size of the pre-registered set, the cap, and the sentence it prints while the
// baseline is still forming. Nothing in this file touches a database or a clock.

const MONTHS = ['2026-06-01', '2026-07-01', '2026-08-01']

/** A denominator big enough to clear every floor: 3 × 400 videos behind,
 *  400 this week. */
const wideSeries = (over: Partial<DenominatorSeries> = {}): DenominatorSeries => ({
  name: 'industry-other',
  weekVideos: 400,
  months: MONTHS.map((month) => ({ month, videos: 400 })),
  ...over,
})

/** An object holding a flat `share` of the denominator in every month, and
 *  `weekVideos` this week. */
const flatObject = (
  id: string,
  args: { weekVideos: number; monthVideos: number; denominator?: string; kind?: PreRegisteredObject['kind'] },
): PreRegisteredObject => ({
  kind: args.kind ?? 'theme',
  id,
  label: id,
  denominator: args.denominator ?? 'industry-other',
  weekVideos: args.weekVideos,
  months: MONTHS.map((month) => ({ month, videos: args.monthVideos })),
})

describe('the pre-registered set', () => {
  it('counts the ten kinds the pipeline actually writes, not the design\'s six', () => {
    expect(KIND_SET).toHaveLength(10)
    expect(KIND_SET).toContain('switching_signal')
    expect(KIND_SET).toContain('buying_trigger')
  })

  it('takes the twenty largest themes in the baseline, ties broken by id', () => {
    const themes = Array.from({ length: 30 }, (_, i) => ({ id: `t${String(i).padStart(2, '0')}`, baselineVideos: i }))
    const top = topThemesByBaseline(themes)
    expect(top).toHaveLength(TOP_THEMES)
    expect(top[0].id).toBe('t29')
    expect(top.at(-1)?.id).toBe('t10')
  })

  it('breaks a tie on id so a replay is reproducible', () => {
    const tied = [
      { id: 'b', baselineVideos: 5 },
      { id: 'a', baselineVideos: 5 },
    ]
    expect(topThemesByBaseline(tied, 1)[0].id).toBe('a')
  })
})

describe('the baseline state', () => {
  it('reads the design\'s sentence while it is forming', () => {
    expect(baselineLabel(0)).toBe('baseline forming — 0 of 3 months')
    expect(baselineLabel(2)).toBe('baseline forming — 2 of 3 months')
    expect(baselineLabel(3)).toBe('baseline ready')
  })

  it('counts a month only when it clears the floor', () => {
    // Össur's category audience at the July 2026 line: Apr 41, May 13, Jun 182.
    const state = baselineStateOf({
      name: 'industry-other',
      weekVideos: 23,
      months: [
        { month: '2026-04-01', videos: 41 },
        { month: '2026-05-01', videos: 13 },
        { month: '2026-06-01', videos: 182 },
      ],
    })
    expect(state.monthsClearing).toBe(1)
    expect(state.ready).toBe(false)
    expect(state.label).toBe('baseline forming — 1 of 3 months')
    expect(state.required).toBe(BASELINE_MONTHS)
  })

  it('is ready when all three months clear', () => {
    const state = baselineStateOf(wideSeries())
    expect(state).toMatchObject({ monthsClearing: 3, ready: true, label: 'baseline ready' })
  })
})

describe('the arithmetic', () => {
  it('computes the same standard error the band does', () => {
    const sides = { nowPct: 24, nowN: 271, prevPct: 18, prevN: 1089 }
    const band = proportionDelta({ ...sides, nowK: 65, prevK: 196 }, SHARE_BAND).band
    expect(Math.round(2 * standardErrorPts(sides) * 10) / 10).toBe(band)
  })

  it('has no standard error when a side is empty', () => {
    expect(standardErrorPts({ nowPct: 10, nowN: 0, prevPct: 10, prevN: 100 })).toBe(Infinity)
  })

  it('reads the normal tail at the points everyone knows', () => {
    expect(twoSidedP(0)).toBeCloseTo(1, 6)
    expect(twoSidedP(1.959964)).toBeCloseTo(0.05, 4)
    expect(twoSidedP(2.575829)).toBeCloseTo(0.01, 4)
    expect(twoSidedP(-1.959964)).toBeCloseTo(0.05, 4)
    expect(twoSidedP(Infinity)).toBe(0)
    expect(twoSidedP(NaN)).toBe(1)
  })
})

describe('Holm over the size of the pre-registered set', () => {
  it('at a set of one is the uncorrected band', () => {
    expect(holmRejections([0.04], 1)).toEqual([{ threshold: FAMILY_ALPHA, rejected: true }])
    expect(holmRejections([0.06], 1)).toEqual([{ threshold: FAMILY_ALPHA, rejected: false }])
  })

  it('at a set of ten needs 0.005 for the smallest, then relaxes one step at a time', () => {
    const out = holmRejections([0.004, 0.005, 0.006], 10)
    expect(out[0]).toEqual({ threshold: 0.005, rejected: true })
    expect(out[1].threshold).toBeCloseTo(0.05 / 9, 12) // 0.00556
    expect(out[1].rejected).toBe(true)
    expect(out[2].threshold).toBeCloseTo(0.05 / 8, 12) // 0.00625
    expect(out[2].rejected).toBe(true)
    // One step tighter and the third fails its own threshold.
    expect(holmRejections([0.004, 0.005, 0.0064], 11).map((o) => o.rejected)).toEqual([true, true, false])
  })

  it('at a set of forty needs 0.00125 for the smallest', () => {
    const out = holmRejections([0.0012, 0.002], 40)
    expect(out[0]).toEqual({ threshold: 0.05 / 40, rejected: true })
    expect(out[1].rejected).toBe(false)
  })

  it('stops at the first failure — a later, smaller-than-its-threshold p is not rejected', () => {
    // 0.02 fails 0.05/10; 0.0111 would clear 0.05/8 on its own but comes after it.
    const out = holmRejections([0.001, 0.02, 0.0111], 10)
    expect(out.map((o) => o.rejected)) .toEqual([true, false, false])
  })

  it('never corrects for fewer tests than it was given', () => {
    expect(holmRejections([0.01, 0.02, 0.03], 1)[0].threshold).toBeCloseTo(0.05 / 3, 12)
  })
})

describe('the week against the baseline', () => {
  it('flags nothing at all while the baseline is forming, however large the move', () => {
    const series = wideSeries({ months: [
      { month: '2026-06-01', videos: 400 },
      { month: '2026-07-01', videos: 40 },
      { month: '2026-08-01', videos: 400 },
    ] })
    const reading = weekVsBaseline({
      week: '2026-W37',
      denominators: [series],
      set: [flatObject('runaway', { weekVideos: 380, monthVideos: 10 })],
    })
    expect(reading.baselines[0].label).toBe('baseline forming — 2 of 3 months')
    expect(reading.rows[0].state).toBe('baseline_forming')
    expect(reading.rows[0].verdict).toBeNull()
    expect(reading.tested).toBe(0)
    expect(reading.flags).toEqual([])
  })

  it('refuses a comparison the product\'s own floors refuse', () => {
    const thinWeek = wideSeries({ weekVideos: 80 }) // under SHARE_BAND.minN
    const thinObject = wideSeries({ name: 'thin-object' })
    const reading = weekVsBaseline({
      week: '2026-W37',
      denominators: [thinWeek, thinObject],
      set: [
        flatObject('week-too-small', { weekVideos: 40, monthVideos: 200 }),
        // n is fine on both sides; the object's own count is 9, under minK = 10.
        flatObject('object-too-small', { weekVideos: 9, monthVideos: 200, denominator: 'thin-object' }),
      ],
    })
    expect(reading.rows.map((r) => r.state)).toEqual(['too_little_data', 'too_little_data'])
    expect(reading.rows.every((r) => r.verdict?.state === 'too_little_data')).toBe(true)
    expect(reading.tested).toBe(0)
    expect(reading.flags).toEqual([])
  })

  it('flags a real move, and reports the figures a reader is shown', () => {
    const reading = weekVsBaseline({
      week: '2026-W37',
      denominators: [wideSeries()],
      // 5% of the baseline, 20% this week, on a set of one.
      set: [flatObject('surge', { weekVideos: 80, monthVideos: 20 })],
    })
    const row = reading.rows[0]
    expect(row.weekPct).toBeCloseTo(20, 6)
    expect(row.baselinePct).toBeCloseTo(5, 6)
    expect(row.baselineVideos).toBe(60)
    expect(row.baselineTotal).toBe(1200)
    expect(row.verdict?.state).toBe('moved')
    expect(row.p).toBeLessThan(0.0001)
    expect(row.state).toBe('flagged')
    expect(reading.flags).toHaveLength(1)
  })

  it('a move that clears the band but not the correction is not a flag', () => {
    const alone = weekVsBaseline({
      week: '2026-W37',
      denominators: [wideSeries()],
      set: [flatObject('borderline', { weekVideos: 62, monthVideos: 40 })],
    })
    expect(alone.rows[0].verdict?.state).toBe('moved')
    expect(alone.rows[0].state).toBe('flagged')

    // The same object, in a set of forty: the threshold is 40× tighter.
    const crowd = weekVsBaseline({
      week: '2026-W37',
      denominators: [wideSeries()],
      set: [
        flatObject('borderline', { weekVideos: 62, monthVideos: 40 }),
        ...Array.from({ length: 39 }, (_, i) => flatObject(`quiet-${i}`, { weekVideos: 40, monthVideos: 40 })),
      ],
    })
    const borderline = crowd.rows.find((r) => r.id === 'borderline')!
    expect(crowd.setSize).toBe(40)
    expect(borderline.verdict?.state).toBe('moved')
    expect(borderline.holmThreshold).toBeCloseTo(0.05 / 40, 12)
    expect(borderline.state).toBe('no_clear_change')
    expect(crowd.flags).toEqual([])
  })

  it('shows at most three flags, largest first, and says how many cleared', () => {
    const set = [
      flatObject('up-a-lot', { weekVideos: 160, monthVideos: 40 }),
      flatObject('up-more', { weekVideos: 200, monthVideos: 40 }),
      flatObject('down-most', { weekVideos: 12, monthVideos: 200 }),
      flatObject('up-a-little', { weekVideos: 120, monthVideos: 40 }),
    ]
    const reading = weekVsBaseline({ week: '2026-W37', denominators: [wideSeries()], set })
    expect(reading.flaggedCount).toBe(4)
    expect(reading.flags).toHaveLength(MAX_FLAGS)
    expect(reading.flags.map((f) => f.id)).toEqual(['down-most', 'up-more', 'up-a-lot'])
    const sizes = reading.flags.map((f) => Math.abs(f.verdict!.change))
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a))
  })

  it('counts every pre-registered object in the correction, including the ones no floor let through', () => {
    const set = [
      flatObject('surge', { weekVideos: 80, monthVideos: 20 }),
      ...Array.from({ length: 30 }, (_, i) => flatObject(`tiny-${i}`, { weekVideos: 1, monthVideos: 1 })),
    ]
    const reading = weekVsBaseline({ week: '2026-W37', denominators: [wideSeries()], set })
    expect(reading.setSize).toBe(31)
    expect(reading.tested).toBe(1)
    expect(reading.rows.find((r) => r.id === 'surge')?.holmThreshold).toBeCloseTo(0.05 / 31, 12)
  })

  it('measures each object against the denominator it names', () => {
    const slice: DenominatorSeries = {
      name: 'ALL',
      weekVideos: 205,
      months: [
        { month: '2026-06-01', videos: 232 },
        { month: '2026-07-01', videos: 136 },
        { month: '2026-08-01', videos: 721 },
      ],
    }
    const audience: DenominatorSeries = {
      name: 'industry-other',
      weekVideos: 180,
      months: [
        { month: '2026-06-01', videos: 182 },
        { month: '2026-07-01', videos: 118 },
        { month: '2026-08-01', videos: 628 },
      ],
    }
    const reading = weekVsBaseline({
      week: '2026-W37',
      denominators: [slice, audience],
      set: [
        {
          kind: 'rival', id: 'Ottobock', label: 'Ottobock', denominator: 'ALL', weekVideos: 12,
          months: [
            { month: '2026-06-01', videos: 34 },
            { month: '2026-07-01', videos: 10 },
            { month: '2026-08-01', videos: 73 },
          ],
        },
      ],
    })
    const row = reading.rows[0]
    expect(row.weekTotal).toBe(205)
    expect(row.baselineTotal).toBe(1089)
    expect(row.baselineVideos).toBe(117)
    expect(row.weekPct).toBeCloseTo(5.854, 3)
    expect(row.baselinePct).toBeCloseTo(10.744, 3)
    expect(row.verdict?.state).toBe('moved')
    // One rival in a set of one clears; in the real set of 31 it does not.
    expect(row.state).toBe('flagged')
  })

  it('ignores an object month the baseline does not cover', () => {
    const reading = weekVsBaseline({
      week: '2026-W37',
      denominators: [wideSeries()],
      set: [{
        kind: 'kind', id: 'praise', label: 'Praise', denominator: 'industry-other', weekVideos: 100,
        months: [
          { month: '2026-05-01', videos: 999 },
          ...MONTHS.map((month) => ({ month, videos: 40 })),
        ],
      }],
    })
    expect(reading.rows[0].baselineVideos).toBe(120)
  })

  it('will not silently measure an object against a denominator nobody passed', () => {
    expect(() =>
      weekVsBaseline({
        week: '2026-W37',
        denominators: [wideSeries()],
        set: [flatObject('orphan', { weekVideos: 10, monthVideos: 10, denominator: 'client' })],
      }),
    ).toThrow(/no denominator "client"/)
  })
})

describe('the measurement knob', () => {
  it('can be told to draw the band anyway, and says so on the row', () => {
    const series: DenominatorSeries = {
      name: 'industry-other',
      weekVideos: 400,
      months: [
        { month: '2026-06-01', videos: 40 }, // under the floor
        { month: '2026-07-01', videos: 400 },
        { month: '2026-08-01', videos: 400 },
      ],
    }
    const set = [flatObject('surge', { weekVideos: 80, monthVideos: 20 })]
    const asShipped = weekVsBaseline({ week: '2026-W37', denominators: [series], set })
    expect(asShipped.rows[0].state).toBe('baseline_forming')
    expect(asShipped.flags).toEqual([])

    const waived = weekVsBaseline({ week: '2026-W37', denominators: [series], set, options: { requireBaselineMonths: 0 } })
    expect(waived.rows[0].state).toBe('flagged')
    // The band's own floors are untouched, and the baseline state still tells
    // the truth about how many months cleared.
    expect(waived.baselines[0].label).toBe('baseline forming — 2 of 3 months')
    expect(waived.rows[0].baselineMonthsClearing).toBe(2)
  })

  it('leaves the band\'s own floors in place when the month gate is waived', () => {
    const series: DenominatorSeries = {
      name: 'industry-other',
      weekVideos: 400,
      months: [
        { month: '2026-06-01', videos: 20 },
        { month: '2026-07-01', videos: 20 },
        { month: '2026-08-01', videos: 20 },
      ],
    }
    const waived = weekVsBaseline({
      week: '2026-W37',
      denominators: [series],
      set: [flatObject('surge', { weekVideos: 80, monthVideos: 5 })],
      options: { requireBaselineMonths: 0 },
    })
    // 60 videos behind it: under SHARE_BAND.minN, so no comparison is drawn.
    expect(waived.rows[0].state).toBe('too_little_data')
  })
})
