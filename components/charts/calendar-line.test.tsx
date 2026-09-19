import { describe, expect, it } from 'vitest'
import { CalendarLine, niceTop } from './calendar-line'
import { Sparkline } from './sparkline'
import { render, markupText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { monthAxis } from '@/lib/reading/series'
import type { CalendarPoint, CalendarSeries } from '@/lib/charts/calendar'

const AXIS = monthAxis('2026-04-01', '2026-09-01')

const p = (month: string, value: number | null, state: CalendarPoint['state'] = 'read', extra: Partial<CalendarPoint> = {}): CalendarPoint =>
  ({ month, value, state, ...extra })

/** Sealand's own line as the mock draws it: April below the floor, May onward
 *  read, September still filling. */
const you: CalendarSeries = {
  label: 'Sealand',
  color: 'var(--you)',
  endNote: 'of 84',
  points: [
    p('2026-04-01', null, 'below_floor', { n: 22 }),
    p('2026-05-01', 19, 'read', { k: 12, n: 63 }),
    p('2026-06-01', 22, 'read', { k: 17, n: 77 }),
    p('2026-07-01', 24, 'read', { k: 19, n: 79 }),
    p('2026-08-01', 28, 'read', { k: 23, n: 82 }),
    p('2026-09-01', 31, 'filling', { k: 26, n: 84, atLastMonth: 27 }),
  ],
}

/** A rival read only from August — a gap that must stay a gap. */
const rival: CalendarSeries = {
  label: 'Freitag',
  color: 'var(--comp)',
  excludes: 'excludes Reddit',
  points: [
    p('2026-04-01', null, 'hollow'),
    p('2026-05-01', null, 'hollow'),
    p('2026-06-01', null, 'below_numerator', { k: 2, n: 140 }),
    p('2026-07-01', null, 'hollow'),
    p('2026-08-01', 41, 'read', { k: 57, n: 139 }),
    p('2026-09-01', 44, 'read', { k: 62, n: 142 }),
  ],
}

const chart = (extra: Partial<Parameters<typeof CalendarLine>[0]> = {}) =>
  CalendarLine({
    axis: AXIS,
    series: [you, rival],
    rules: [
      { month: '2026-09-01', label: 'Poler added to what we track', kind: 'tracking_change', at: '2026-09-03', affects: ['2026-09-01'] },
      { month: '2026-06-01', label: 'we did not record how themes were grouped', kind: 'reconstructed' },
    ],
    bands: [{ months: ['2026-04-01', '2026-05-01', '2026-06-01'], label: 'Read back at setup' }],
    format: (v) => `${v}%`,
    caption: 'April is below the floor for your audience — drawn hollow on the axis, with no reading.',
    ...extra,
  })

describe('CalendarLine', () => {
  it('renders without a React error and keeps the copy contract', () => {
    const markup = render(chart())
    expect(markup).toContain('<svg')
    assertCopyContract(markup)
  })

  it('draws every month of the axis, hollow ones included', () => {
    const markup = render(chart())
    for (const label of ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']) expect(markup).toContain(`>${label}<`)
  })

  it('breaks the rival line rather than drawing through four missing months', () => {
    const markup = render(CalendarLine({ axis: AXIS, series: [rival] }))
    const polylines = markup.match(/<polyline/g) ?? []
    // One run: August and September. April–July are a gap, not a line.
    expect(polylines).toHaveLength(1)
    expect(markup).not.toContain('56.0,')
  })

  it('puts the below-floor month in the gutter under the baseline, never on the line', () => {
    const markup = render(CalendarLine({ axis: AXIS, series: [you] }))
    // The mock's April token: r=3.5, surface fill, ringed in the entity
    // colour. It sat at baseline + 6 = 186, which at print scale is ON the
    // baseline; Block D wave 3 (SH14) moved it to baseline + 11 and gave it a
    // dashed track of its own, so "off the scale" is visible before any word.
    expect(markup).toContain('cy="191"')
    expect(markup).toContain('r="3.5"')
    expect(markup).toContain('stroke-dasharray="1 3"')
    expect(markup).toContain('too few videos this month to read against')
  })

  it('gives the below-numerator month its own token, not the below-floor one', () => {
    const markup = render(CalendarLine({ axis: AXIS, series: [rival] }))
    expect(markup).toContain('<rect x="310.6" y="188" width="6" height="6" fill="var(--tile)" stroke="var(--comp)"')
    expect(markup).toContain('too few of this one to read')
  })

  it('names a series that has no line, on the plot and not only in the key (SH14)', () => {
    // On the marketing sheet a wholly below-floor series read as six months
    // at zero: its only explanation was a 9.5px legend note three inches away,
    // and where a caller turns the legend off there was none at all.
    const floored: CalendarSeries = {
      label: 'Sealand',
      color: 'var(--you)',
      points: AXIS.map((m) => p(m, null, 'below_floor', { n: 22 })),
    }
    const markup = render(CalendarLine({ axis: AXIS, series: [floored], legend: false }))
    expect(markup).toContain('>Sealand<')
  })

  it('hovers with k of n on every read month, one column answering for every line', () => {
    const markup = render(chart())
    expect(markup).toContain('Aug 2026\nSealand 28% · 23 of 82 videos\nFreitag 41% · 57 of 139 videos')
  })

  it('says what a hollow month is when the reader asks', () => {
    expect(render(chart())).toContain('Jul 2026\nSealand 24% · 19 of 79 videos\nFreitag · no videos this month')
  })

  it('gives a month ONE hover target, so no series can answer for another', () => {
    const markup = render(chart())
    // One transparent rect per axis month and not one per series per month:
    // SVG has no z-index, so a second layer of full-column targets would cover
    // the first line's points and answer with the wrong line (WP10 review).
    const targets = markup.match(/fill="transparent"/g) ?? []
    expect(targets).toHaveLength(AXIS.length)
  })

  it('draws the still-filling month as a part-height bar with last month beside it', () => {
    const markup = render(chart())
    expect(markup).toContain('Still filling — this month is still taking comments')
    expect(markup).toContain('At this point last month: 27%')
    expect(markupText(markup)).toContain('at this point last month')
  })

  it('dates a tracking change at its own month and shades the months it moved', () => {
    const markup = render(chart())
    expect(markup).toContain('Poler added to what we track — affects Sep 2026')
    expect(markup).toContain('>3 Sep<')
    expect(markup).toContain('stroke-dasharray="2 3"')
  })

  it('draws a reconstructed row in a second token', () => {
    const markup = render(chart())
    expect(markup).toContain('stroke-dasharray="1 4"')
  })

  it('hatches the months that were read back at setup', () => {
    const markup = render(chart())
    expect(markup).toContain('<pattern')
    expect(markup).toContain('Read back at setup')
  })

  it('gives two charts on one page two pattern ids', () => {
    const a = render(CalendarLine({ axis: AXIS, series: [you], bands: [{ months: AXIS, label: 'x' }] }))
    const b = render(CalendarLine({ axis: AXIS, series: [rival], bands: [{ months: AXIS, label: 'x' }] }))
    const idOf = (m: string) => /<pattern id="([^"]+)"/.exec(m)?.[1]
    expect(idOf(a)).toBeTruthy()
    expect(idOf(a)).not.toBe(idOf(b))
  })

  it('draws a legend for two series, and names the Reddit exclusion on the one that has it', () => {
    const words = markupText(render(chart()))
    expect(words).toContain('Sealand')
    expect(words).toContain('Freitag — excludes Reddit')
    expect(words).toContain('below the floor')
  })

  it('draws its gutter swatches in the colour the chart draws the tokens in', () => {
    const markup = render(CalendarLine({ axis: AXIS, series: [you] }))
    // The mock rings the below-floor token in the entity's own colour.
    expect(markup).toContain('inset 0 0 0 1.5px var(--you)')
  })

  // THE STILL-FILLING MONTH IS FURNITURE, NOT A SERIES. It was painted in the
  // entity's colour, so on a chart where a rival held the only visible point
  // the newest month was a solid peach column the full height of the plot —
  // the loudest coloured shape on the page, encoding "incomplete". Two series
  // filling in one month drew two overlapping colours for one fact.
  it('paints the still-filling month in the neutral token, never in the entity’s ink', () => {
    const markup = render(CalendarLine({ axis: AXIS, series: [you] }))
    expect(markup).toContain('fill="var(--muted-foreground)" opacity="0.1"')
    expect(markup).not.toContain('fill="var(--you)" opacity')
    expect(markup).toContain('background:var(--muted-foreground);opacity:0.35')
  })

  it('draws no legend for one ordinary series with nothing to explain', () => {
    const one: CalendarSeries = { label: 'Category', color: 'var(--cat)', points: [p('2026-08-01', 20), p('2026-09-01', 22)] }
    const markup = render(CalendarLine({ axis: monthAxis('2026-08-01', '2026-09-01'), series: [one] }))
    const words = markupText(markup)
    // The legend's own words, not the utility class it happens to be styled
    // with: a restyled legend would pass a class assertion while drawing one.
    for (const word of ['below the floor', 'too few to read', 'still filling']) expect(words).not.toContain(word)
    // And nothing at all is printed above the chart, which is where it goes.
    expect(markupText(markup.slice(0, markup.indexOf('<svg'))).trim()).toBe('')
  })

  it('scales uniformly, so the round gutter token cannot become an ellipse', () => {
    // below_floor is a circle and below_numerator a square of the same size:
    // the pair is distinguished by SHAPE, so a non-uniform scale converges them.
    const markup = render(chart())
    expect(markup).not.toContain('preserveAspectRatio="none"')
    expect(markup).toContain('viewBox="0 0 880 210"')
  })

  it('keeps two end labels off each other when two lines end together', () => {
    const close: CalendarSeries = { ...rival, label: 'Poler', points: rival.points.map((q) => (q.value == null ? q : { ...q, value: 31.5 })) }
    const markup = render(CalendarLine({ axis: AXIS, series: [you, close], format: (v) => `${v}%` }))
    const ys = [...markup.matchAll(/<text x="710" y="([\d.]+)"/g)].map((m) => Number(m[1]))
    expect(ys).toHaveLength(2)
    expect(Math.abs(ys[0] - ys[1])).toBeGreaterThanOrEqual(13)
  })

  it('thins the labels on a 68-month axis instead of printing 68 of them', () => {
    const long = monthAxis('2021-02-01', '2026-09-01')
    const markup = render(CalendarLine({
      axis: long,
      series: [{ label: 'Category', color: 'var(--cat)', points: long.map((m, i) => p(m, i % 5 === 0 ? null : 20 + i, i % 5 === 0 ? 'hollow' : 'read')) }],
    }))
    const labels = markup.match(/text-anchor="middle"/g) ?? []
    expect(labels.length).toBeLessThanOrEqual(12)
  })

  it('sizes its type against the container, not against the viewBox (SH1)', () => {
    // Every font-size is a viewBox unit, so a 880-unit drawing in a 352px
    // column would print its 10-unit axis label at 4.0px. The correction is
    // `--cal-k`, set by a container query in app/globals.css against the
    // intrinsic width the chart publishes here.
    const markup = render(chart())
    expect(markup).toMatch(/--cal-w:\s*880/)
    expect(markup).toContain('vb-cal')
    // No raw font-size attribute survives: one that did would be the one label
    // still shrinking with the box.
    expect(markup).not.toMatch(/font-size="[0-9]/)
    expect(markup).toMatch(/font-size:\s*calc\(10px \* var\(--cal-k, 1\)\)/)
    // The end label carries a caller's string in a fixed gutter and is capped
    // on its own variable rather than on --cal-k.
    expect(markup).toMatch(/font-size:\s*calc\(11px \* var\(--cal-ke, 1\)\)/)
  })

  it('publishes the caller\'s own width as the correction base', () => {
    const markup = render(chart({ width: 420 }))
    expect(markup).toMatch(/--cal-w:\s*420/)
  })

  it('puts a round mark ABOVE the data, not two marks under it (SH13)', () => {
    // Ask's finding 1: 5.1 / 6.8 / 9.4, so the axis read 0% and 5% while the
    // line ended at 9.4% — both printed marks under the whole series, on the
    // surface whose promise is a figure you can check.
    const ask: CalendarSeries = {
      label: 'Fit',
      color: 'var(--you)',
      points: [p('2026-07-01', 5.1), p('2026-08-01', 6.8), p('2026-09-01', 9.4)],
    }
    const markup = render(CalendarLine({ axis: monthAxis('2026-07-01', '2026-09-01'), series: [ask], format: (v) => `${v}%` }))
    expect(markup).toContain('>10%<')
  })

  it('picks the top by the round numbers, never by max x 1.12', () => {
    // The objection the two-label rule was written against: 49.3% on a 44%
    // series. 44 x 1.12 = 49.28, and 45 is what fits inside it.
    expect(niceTop(44, 49.28)).toBe(45)
    expect(niceTop(9.4, 10.528)).toBe(10)
    expect(niceTop(14, 15.68)).toBe(15)
    // Nothing round fits: the chart keeps the two labels it had.
    expect(niceTop(9.99, 9.995)).toBeNull()
    expect(niceTop(0, 1)).toBeNull()
    expect(niceTop(Number.NaN, 10)).toBeNull()
  })

  it('paints the filling month ONCE, however many series are filling (SH21)', () => {
    // It was drawn inside SeriesMarks, so two filling series painted September
    // twice below the lower point and once above — a false horizontal step
    // landing on one series' end point, inside a shape whose only meaning is
    // "this month is not finished".
    const alsoFilling: CalendarSeries = {
      label: 'Freitag',
      color: 'var(--comp)',
      points: AXIS.map((m, i) => p(m, 20 + i, m === '2026-09-01' ? 'filling' : 'read')),
    }
    const markup = render(CalendarLine({ axis: AXIS, series: [you, alsoFilling] }))
    expect(markup.match(/Still filling/g) ?? []).toHaveLength(1)
  })

  it('keeps the filling bar inside the plot rather than half off its edge', () => {
    // The filling month is by construction the last one, whose x IS the plot's
    // right edge — on Voice, with the legend off, that read as a clipped band.
    const markup = render(CalendarLine({ axis: AXIS, series: [you], legend: false }))
    const bar = markup.match(/<rect x="([0-9.]+)" y="[0-9.]+" width="([0-9.]+)"[^>]*opacity="0.1"/)
    expect(bar).not.toBeNull()
    const [x, w] = [Number((bar as RegExpMatchArray)[1]), Number((bar as RegExpMatchArray)[2])]
    // padR in viewBox terms is width - padR = 880 - 180 = 700.
    expect(x + w).toBeLessThanOrEqual(700)
  })

  it('renders nothing rather than an empty box when there is no axis or no series', () => {
    expect(CalendarLine({ axis: [], series: [you] })).toBeNull()
    expect(CalendarLine({ axis: AXIS, series: [] })).toBeNull()
  })

  it('survives a series in which no month has a reading at all', () => {
    const empty: CalendarSeries = { label: 'Rareform', color: 'var(--cat)', points: AXIS.map((m) => p(m, null, 'hollow')) }
    const markup = render(CalendarLine({ axis: AXIS, series: [empty] }))
    expect(markup).toContain('<svg')
    expect(markup).not.toContain('<polyline')
    assertCopyContract(markup)
  })
})

describe('Sparkline with gaps', () => {
  it('breaks the line where a month has no reading', () => {
    const markup = render(Sparkline({ values: [3, 4, null, 6, 7], animate: false }))
    expect((markup.match(/<polyline/g) ?? [])).toHaveLength(2)
  })

  it("keeps the missing month's slot, so the points after it do not move", () => {
    const withGap = render(Sparkline({ values: [3, 4, null, 6, 7], animate: false }))
    const without = render(Sparkline({ values: [3, 4, 5, 6, 7], animate: false }))
    // Same five slots, so the last point sits at the same x in both.
    expect(withGap).toContain('cx="88"')
    expect(without).toContain('cx="88"')
  })

  it('draws a lone reading between two gaps as a dot, not as an invisible line', () => {
    const markup = render(Sparkline({ values: [null, 5, null], animate: false }))
    expect(markup).not.toContain('<polyline')
    expect((markup.match(/<circle/g) ?? []).length).toBeGreaterThanOrEqual(1)
  })

  it('refuses the fill under a broken line — a filled area would claim the gap', () => {
    expect(render(Sparkline({ values: [3, null, 5], fill: true, animate: false }))).not.toContain('<polygon')
    expect(render(Sparkline({ values: [3, 4, 5], fill: true, animate: false }))).toContain('<polygon')
  })

  it('renders nothing at all when every slot is empty', () => {
    expect(Sparkline({ values: [null, null] })).toBeNull()
  })

  it('draws the end dot on the last READING, not on the last slot', () => {
    const markup = render(Sparkline({ values: [3, 9, null], animate: false }))
    expect(markup).toContain('r="2.6"')
    expect(markup).toContain('cx="45"')
  })

  it('still behaves exactly as before for a plain number[]', () => {
    const markup = render(Sparkline({ values: [120, 180, 210, 260, 330, 412], animate: false }))
    expect((markup.match(/<polyline/g) ?? [])).toHaveLength(1)
  })
})
