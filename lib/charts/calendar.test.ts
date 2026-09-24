import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  axisLabels, CAL_PAD_L, CAL_PAD_R, CAL_PAPER_K,
  calendarGeometry, chartId, collapseRules, columnTitle, hoverTitle, lastReading,
  legendEveryMonth, legendMonths, legendStates, undrawnNote,
  lineSegments, monthColumns, niceMid, spanOf, spreadLabels, stateNote, valueScale,
  type CalendarPoint, type CalendarSeries,
} from './calendar'
import { monthAxis } from '../reading/series'

const p = (month: string, value: number | null, state: CalendarPoint['state'] = 'read', extra: Partial<CalendarPoint> = {}): CalendarPoint =>
  ({ month, value, state, ...extra })

describe('calendarGeometry', () => {
  it('reproduces the mock geometry exactly (880×210, baseline 180, gutter 186, labels 203)', () => {
    const axis = monthAxis('2026-04-01', '2026-09-01')
    const g = calendarGeometry({ axis })
    expect(axis).toHaveLength(6)
    expect(g.top).toBe(12)
    expect(g.baseline).toBe(180)
    expect(g.gutterY).toBe(186)
    expect(g.labelY).toBe(203)
    expect(g.x('2026-04-01')).toBe(56)
    expect(g.x('2026-09-01')).toBe(700)
    expect(g.x('2026-05-01')).toBeCloseTo(184.8, 1)
    expect(g.x('2026-08-01')).toBeCloseTo(571.2, 1)
  })

  it('places a month by its DATE, so a hollow month keeps its slot', () => {
    const g = calendarGeometry({ axis: monthAxis('2026-01-01', '2026-12-01') })
    // June is the sixth of twelve whether or not anything was said in it.
    expect(g.x('2026-06-01')).toBeCloseTo(56 + (5 / 11) * 644, 5)
  })

  it('accepts any day of a month as that month', () => {
    const g = calendarGeometry({ axis: monthAxis('2026-04-01', '2026-06-01') })
    expect(g.x('2026-05-17')).toBe(g.x('2026-05-01'))
  })

  it('returns null for a month that is not on the axis', () => {
    const g = calendarGeometry({ axis: monthAxis('2026-04-01', '2026-06-01') })
    expect(g.x('2026-03-01')).toBeNull()
    expect(g.x('2026-07-01')).toBeNull()
  })

  it('centres a one-month axis rather than dividing by zero', () => {
    const g = calendarGeometry({ axis: ['2026-09-01'] })
    expect(g.x('2026-09-01')).toBe(56 + 644 / 2)
    expect(g.slot).toBe(644)
  })

  it('has an empty axis with no x at all', () => {
    const g = calendarGeometry({ axis: [] })
    expect(g.x('2026-09-01')).toBeNull()
  })
})

describe('valueScale', () => {
  const series: CalendarSeries[] = [
    { label: 'You', color: 'a', points: [p('2026-08-01', 20), p('2026-09-01', 50)] },
  ]

  it('is zero-based, so a 29–31 series does not look like a cliff', () => {
    const s = valueScale(series)
    expect(s.lo).toBe(0)
    expect(s.y(0)).toBe(180)
  })

  it('takes the shipped 12% headroom so an end label has somewhere to sit', () => {
    expect(valueScale(series).hi).toBeCloseTo(56, 5)
  })

  it('scales a still-filling month against the "at this point last month" tick too', () => {
    const withTick: CalendarSeries[] = [
      { label: 'You', color: 'a', points: [p('2026-09-01', 10, 'filling', { atLastMonth: 90 })] },
    ]
    expect(valueScale(withTick).hi).toBeCloseTo(100.8, 5)
  })

  it('puts the midline on a number a reader can read', () => {
    // hi = 44 × 1.12 = 49.28, so the arithmetic midpoint is 24.64 — which is
    // what LineChart prints today. The line stays where it is; the label does not.
    const s = valueScale([{ label: 'You', color: 'a', points: [p('2026-09-01', 44)] }])
    expect(s.mid).toBe(25)
    expect(s.y(s.mid)).toBeCloseTo(94.75, 1)
  })

  it('survives a series with nothing plotted', () => {
    const s = valueScale([{ label: 'You', color: 'a', points: [p('2026-09-01', null, 'hollow')] }])
    expect(s.y(0)).toBe(180)
    expect(Number.isFinite(s.y(1))).toBe(true)
  })
})

describe('niceMid', () => {
  it('rounds to tens on a counts axis', () => {
    expect(niceMid(0, 220)).toBe(110)
    expect(niceMid(0, 461)).toBe(230)
  })

  it('rounds to fives in the ordinary share range', () => {
    expect(niceMid(0, 49.28)).toBe(25)
    expect(niceMid(0, 97)).toBe(50)
  })

  it('rounds to whole numbers on a narrow axis', () => {
    expect(niceMid(0, 13)).toBe(7)
    expect(niceMid(0, 7)).toBe(4)
  })

  it('keeps a decimal where whole numbers would collapse the axis', () => {
    expect(niceMid(0, 1.4)).toBe(0.7)
  })
})

describe('lineSegments', () => {
  it('breaks the path where a month has no reading', () => {
    const points = [p('2026-01-01', 1), p('2026-02-01', null, 'hollow'), p('2026-03-01', 3), p('2026-04-01', 4)]
    expect(lineSegments(points)).toEqual([[0], [2, 3]])
  })

  it('is one run when nothing is missing', () => {
    expect(lineSegments([p('2026-01-01', 1), p('2026-02-01', 2)])).toEqual([[0, 1]])
  })

  it('is no runs at all when nothing is plottable', () => {
    expect(lineSegments([p('2026-01-01', null, 'hollow'), p('2026-02-01', null, 'below_floor')])).toEqual([])
  })

  it('does not close a leading or trailing gap', () => {
    const points = [p('2026-01-01', null, 'hollow'), p('2026-02-01', 2), p('2026-03-01', null, 'hollow')]
    expect(lineSegments(points)).toEqual([[1]])
  })
})

describe('spanOf', () => {
  const axis = monthAxis('2026-04-01', '2026-09-01')

  it('is the first and last axis positions the months touch', () => {
    expect(spanOf(axis, ['2026-05-01', '2026-07-01'])).toEqual({ from: 1, to: 3 })
  })

  it('ignores months that are off the axis', () => {
    expect(spanOf(axis, ['2025-01-01', '2026-06-01'])).toEqual({ from: 2, to: 2 })
  })

  it('is null when a change moved only months nobody is looking at', () => {
    expect(spanOf(axis, ['2024-01-01', '2024-02-01'])).toBeNull()
    expect(spanOf(axis, [])).toBeNull()
  })
})

describe('collapseRules', () => {
  const axis = monthAxis('2026-01-01', '2026-06-01')

  it('collapses a run of identical breaks into one rule with the run as its band', () => {
    const rules = ['2026-01-01', '2026-02-01', '2026-03-01'].map((month) => ({
      month, label: 'themes were re-grouped', kind: 'clustering_changed' as const,
    }))
    const out = collapseRules(axis, rules)
    expect(out).toHaveLength(1)
    expect(out[0].month).toBe('2026-01-01')
    expect(out[0].affects).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
  })

  it('keeps two different changes in two months as two rules', () => {
    const out = collapseRules(axis, [
      { month: '2026-02-01', label: 'Poler added', kind: 'tracking_change' },
      { month: '2026-03-01', label: 'themes were re-grouped', kind: 'clustering_changed' },
    ])
    expect(out).toHaveLength(2)
  })

  it('keeps the same label in two NON-adjacent months as two rules', () => {
    const out = collapseRules(axis, [
      { month: '2026-01-01', label: 'themes were re-grouped', kind: 'clustering_changed' },
      { month: '2026-04-01', label: 'themes were re-grouped', kind: 'clustering_changed' },
    ])
    expect(out.map((r) => r.month)).toEqual(['2026-01-01', '2026-04-01'])
  })

  it('leaves a lone rule with no band exactly as it came', () => {
    const one = { month: '2026-02-01', label: 'Poler added', kind: 'tracking_change' as const }
    expect(collapseRules(axis, [one])).toEqual([one])
  })

  it('leaves a lone rule\'s own band alone — the band is what the change MOVED', () => {
    // decision U: `affects_months` is rarely the month the change was made in.
    // Unioning the rule's own month in shaded every month between.
    const one = { month: '2026-04-01', label: 'Poler added', kind: 'tracking_change' as const, affects: ['2026-01-01', '2026-02-01'] }
    expect(collapseRules(axis, [one])).toEqual([one])
    expect(spanOf(axis, collapseRules(axis, [one])[0].affects!)).toEqual({ from: 0, to: 1 })
  })

  it('unions the affected months of a collapsed run', () => {
    const out = collapseRules(axis, [
      { month: '2026-02-01', label: 'corpus re-tagged', kind: 'tracking_change', affects: ['2026-01-01'] },
      { month: '2026-03-01', label: 'corpus re-tagged', kind: 'tracking_change', affects: ['2026-05-01'] },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].affects).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-05-01'])
  })

  it('drops a rule dated off the axis', () => {
    expect(collapseRules(axis, [{ month: '2025-06-01', label: 'x', kind: 'tracking_change' }])).toEqual([])
  })
})

describe('axisLabels', () => {
  it('prints every month on a short axis', () => {
    expect(axisLabels(monthAxis('2026-04-01', '2026-09-01'))).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('thins a 68-month axis and always keeps the last month', () => {
    const axis = monthAxis('2021-02-01', '2026-09-01')
    expect(axis).toHaveLength(68)
    const out = axisLabels(axis)
    expect(out.length).toBeLessThanOrEqual(12)
    expect(out[out.length - 1]).toBe(67)
    expect([...out].sort((a, b) => a - b)).toEqual(out)
  })

  it('has nothing to label on an empty axis', () => {
    expect(axisLabels([])).toEqual([])
  })
})

describe('hoverTitle', () => {
  it('names the series, the value, the month and k of n', () => {
    expect(hoverTitle({ label: 'Sealand' }, p('2026-08-01', 31, 'read', { k: 26, n: 84 }), (v) => `${v}%`))
      .toBe('Sealand 31% · Aug 2026 · 26 of 84 videos')
  })

  it('says what a hollow month is instead of showing a value', () => {
    expect(hoverTitle({ label: 'Freitag' }, p('2026-05-01', null, 'hollow')))
      .toBe('Freitag · May 2026 · no videos this month')
  })

  it('prints the denominator of a below-floor month and refuses the reading', () => {
    expect(hoverTitle({ label: 'Sealand' }, p('2026-04-01', null, 'below_floor', { n: 22 })))
      .toBe('Sealand · Apr 2026 · 22 videos · too few videos this month to read against')
  })

  it("carries the caller's own caveat last", () => {
    expect(hoverTitle({ label: 'You' }, p('2026-09-01', 12, 'filling', { k: 4, n: 33, note: 'settles on 31 October 2026' })))
      .toBe('You 12 · Sep 2026 · 4 of 33 videos · still filling · settles on 31 October 2026')
  })
})

describe('spreadLabels', () => {
  it('leaves labels that already clear each other alone', () => {
    expect(spreadLabels([30, 60, 100])).toEqual([30, 60, 100])
  })

  it('pushes a colliding pair apart by the gap, keeping the order they came in', () => {
    expect(spreadLabels([40, 42], { gap: 13 })).toEqual([40, 53])
  })

  it('nudges by y order, not by series order', () => {
    expect(spreadLabels([42, 40], { gap: 13 })).toEqual([53, 40])
  })

  it('lifts the stack rather than running a label out of the box', () => {
    const out = spreadLabels([170, 172, 174], { gap: 13, min: 16, max: 180 })
    expect(Math.max(...(out as number[]))).toBeLessThanOrEqual(180)
    expect(Math.min(...(out as number[]))).toBeGreaterThanOrEqual(16)
  })

  it('keeps a line with no end label in its place', () => {
    expect(spreadLabels([40, null, 42], { gap: 13 })).toEqual([40, null, 53])
  })
})

describe('lastReading', () => {
  it('takes the last month with a value, not the last month on the axis', () => {
    const points = [p('2026-07-01', 21), p('2026-08-01', null, 'below_floor'), p('2026-09-01', null, 'hollow')]
    expect(lastReading(points)?.month).toBe('2026-07-01')
  })

  it('has nothing to point at when nothing is plotted', () => {
    expect(lastReading([p('2026-07-01', null, 'hollow')])).toBeNull()
  })
})

describe('monthColumns / columnTitle', () => {
  const a: CalendarSeries = { label: 'Sealand', color: 'var(--you)', points: [p('2026-08-01', 28, 'read', { k: 23, n: 82 }), p('2026-09-01', 31, 'read', { k: 26, n: 84 })] }
  const b: CalendarSeries = { label: 'Freitag', color: 'var(--comp)', points: [p('2026-08-01', null, 'hollow'), p('2026-09-01', 44, 'read', { k: 62, n: 142 })] }

  it('gives one column per axis month, whatever the series were handed in', () => {
    const cols = monthColumns(['2026-08-01', '2026-09-01'], [a, b])
    expect(cols.map((c) => c.month)).toEqual(['2026-08-01', '2026-09-01'])
    expect(cols[0].entries.map((e) => e.series.label)).toEqual(['Sealand', 'Freitag'])
  })

  it('leaves a month out of a series that has no point for it, rather than inventing one', () => {
    const short: CalendarSeries = { ...b, points: [p('2026-09-01', 44, 'read')] }
    expect(monthColumns(['2026-08-01', '2026-09-01'], [a, short])[0].entries).toHaveLength(1)
  })

  it('heads the tooltip with the month and then answers for every line, once', () => {
    const cols = monthColumns(['2026-08-01', '2026-09-01'], [a, b])
    expect(columnTitle(cols[0], (v) => `${v}%`))
      .toBe('Aug 2026\nSealand 28% · 23 of 82 videos\nFreitag · no videos this month')
  })
})

describe('stateNote', () => {
  it('says nothing about a reading — a reading explains itself', () => {
    expect(stateNote('read')).toBeNull()
  })

  it('has exactly one wording for each of the other four', () => {
    const words = (['below_floor', 'below_numerator', 'hollow', 'filling'] as const).map(stateNote)
    expect(words.every((w) => typeof w === 'string' && w.length > 0)).toBe(true)
    expect(new Set(words).size).toBe(4)
  })
})

describe('legendStates', () => {
  it('names only the tokens actually on the chart', () => {
    const series: CalendarSeries[] = [{
      label: 'You', color: 'a',
      points: [p('2026-04-01', null, 'below_floor'), p('2026-05-01', 3), p('2026-09-01', 4, 'filling')],
    }]
    expect(legendStates(series)).toEqual(['below_floor', 'filling'])
  })

  it('is empty when every month is an ordinary reading', () => {
    expect(legendStates([{ label: 'You', color: 'a', points: [p('2026-05-01', 3)] }])).toEqual([])
  })
})

describe('a series that never reaches the plot', () => {
  const axis = ['2026-04-01', '2026-05-01', '2026-06-01']
  const allBelow: CalendarSeries = {
    label: 'Sealand', color: 'var(--you)',
    points: axis.map((m) => p(m, null, 'below_floor')),
  }

  // The token is right one month at a time; the COMPOSITION at 100% coverage
  // is not. Six hollow rings on the 0% rule read as a flat series plotted at
  // zero, under a key promising a line.
  it('says in the key that this ink draws no line, and why', () => {
    expect(undrawnNote(allBelow)).toBe('no line: every month is below the floor')
  })

  it('says nothing about a line with a hole in it — a hole is still a line', () => {
    expect(undrawnNote({ ...allBelow, points: [p(axis[0], null, 'below_floor'), p(axis[1], 3), p(axis[2], null, 'below_floor')] })).toBeNull()
  })

  it('names the reason it actually has when the months disagree', () => {
    expect(undrawnNote({ ...allBelow, points: [p(axis[0], null, 'below_floor'), p(axis[1], null, 'hollow'), p(axis[2], null, 'below_floor')] }))
      .toBe('no line: no month could be read')
  })

  // `legendMonths` caps naming at two months, so the one case a reader most
  // needs told — the token marks EVERY month — was the case it went silent on.
  it('answers "every month" where naming them would be a list', () => {
    expect(legendMonths([allBelow], 'below_floor')).toEqual([])
    expect(legendEveryMonth([allBelow], 'below_floor', axis)).toBe(true)
  })

  it('does not claim every month where one of them was read', () => {
    const some = { ...allBelow, points: [p(axis[0], null, 'below_floor'), p(axis[1], 3), p(axis[2], null, 'below_floor')] }
    expect(legendEveryMonth([some], 'below_floor', axis)).toBe(false)
  })
})

describe('chartId', () => {
  it('is stable for the same chart', () => {
    expect(chartId(['You', 'Freitag'])).toBe(chartId(['You', 'Freitag']))
  })

  it('differs for two charts on one page', () => {
    expect(chartId(['You'])).not.toBe(chartId(['Freitag']))
  })

  it('does not collide on a re-split of the same characters', () => {
    expect(chartId(['ab', 'c'])).not.toBe(chartId(['a', 'bc']))
  })

  it('is a usable SVG id', () => {
    expect(chartId(['You — 31%'])).toMatch(/^cal[0-9a-z]+$/)
  })
})

// ── the paper factor's two halves ───────────────────────────────────────────
//
// `CAL_PAPER_K` and `--cal-p` are one correction written in two languages —
// the gutters in TypeScript (components/blocks/calendar.tsx, which scales
// `padL` and `padR` on the print arm) and the type in CSS (app/globals.css,
// inside `.vb-slide-body`). Type lifted without its gutter is type growing off
// the edge of the sheet, which is what the first attempt photographed. Two
// halves of one number in two files is exactly the pair that drifts, so the
// stylesheet is read and compared.
describe('CAL_PAPER_K', () => {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

  it('is the number app/globals.css sets --cal-p to inside .vb-slide-body', () => {
    const rule = css.match(/\.vb-slide-body \.vb-cal svg \{[^}]*--cal-p:\s*([0-9.]+)/)
    expect(rule).not.toBeNull()
    expect(Number(rule![1])).toBe(CAL_PAPER_K)
  })

  it('lifts the drawing’s smallest tier over the 8pt floor a brief sheet prints at', () => {
    // 1123px IS 297mm, so a point is 1123 / (297 / 25.4 * 72) px; the slide
    // body is zoomed by --vb-zoom, and the smallest tier in `CalendarLine` is
    // `ts(9)` — the month and date ticks.
    const pt = 1123 / ((297 / 25.4) * 72)
    const zoom = Number(css.match(/--vb-zoom:\s*([0-9.]+)/)![1])
    expect(9 * CAL_PAPER_K * zoom / pt).toBeGreaterThanOrEqual(8)
    // And it is not more than the floor needs: at one tier lower it would be
    // growing the drawing for its own sake.
    expect(9 * (CAL_PAPER_K - 0.1) * zoom / pt).toBeLessThan(8)
  })

  it('keeps the geometry defaults the gutters are scaled from', () => {
    expect(calendarGeometry({ axis: monthAxis('2026-04-01', '2026-09-01') }).padL).toBe(CAL_PAD_L)
    expect(CAL_PAD_R).toBe(180)
  })
})
