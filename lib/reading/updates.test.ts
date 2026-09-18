import { describe, it, expect } from 'vitest'
import { directionRe } from '../test/copy-contract'
import {
  buildUpdateSeries,
  clipToMonth,
  monthsOfWindow,
  updateBand,
  updateSeriesLine,
  windowDayCount,
  UPDATE_SERIES_POINTS,
  type UpdatePoint,
} from './updates'

// The update series (Block D, D5) — the thirteen-point chart, built at the one
// cadence that is real, dated and counted.
//
// Every test here is about a rule the shape exists to enforce: the window comes
// off the run row (a run without one is excluded and NAMED), every point
// restates its contribution to the month it falls in, a crossing window carries
// both months, the band is a count band drawn on the points BEHIND the newest,
// and nothing anywhere says which way anything is going.

const run = (runId: string, from: string, to: string) => ({ runId, window: { from, to } })

/** Thirteen weekly updates, ending 13 Sep — Össur's own cadence. */
function weeklyRuns(videos: readonly number[]) {
  const runs: { runId: string; window: { from: string; to: string } }[] = []
  const videosByRun = new Map<string, number>()
  // Oldest first, seven days each, ending on the 13th.
  const end = Date.UTC(2026, 8, 13, 4, 0, 0)
  for (let i = videos.length - 1; i >= 0; i -= 1) {
    const to = new Date(end - i * 7 * 86_400_000).toISOString()
    const from = new Date(end - (i + 1) * 7 * 86_400_000).toISOString()
    const id = `run-${videos.length - i}`
    runs.push(run(id, from, to))
    videosByRun.set(id, videos[videos.length - 1 - i])
  }
  return { runs, videosByRun }
}

describe('windowDayCount', () => {
  it('counts whole days and never goes below one', () => {
    expect(windowDayCount('2026-09-06T04:06:38.483Z', '2026-09-13T04:06:38.483Z')).toBe(7)
    expect(windowDayCount('2026-08-11T07:02:10.201Z', '2026-09-10T07:02:10.201Z')).toBe(30)
    // A run that opened and closed inside an hour still covered the day it ran.
    expect(windowDayCount('2026-09-13T04:00:00.000Z', '2026-09-13T04:40:00.000Z')).toBe(1)
  })
})

describe('monthsOfWindow', () => {
  it('names one month for a window inside one month', () => {
    expect(monthsOfWindow('2026-09-06T04:06:38.483Z', '2026-09-13T04:06:38.483Z')).toEqual(['2026-09-01'])
  })

  it('names both months for a window that crosses', () => {
    expect(monthsOfWindow('2026-08-11T07:02:10.201Z', '2026-09-10T07:02:10.201Z'))
      .toEqual(['2026-08-01', '2026-09-01'])
  })

  it('does not claim a month the window ends exactly on', () => {
    // `to` is exclusive: this update read no day of September, so a September
    // contribution of zero must never be printed against September's real
    // denominator.
    expect(monthsOfWindow('2026-08-20T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).toEqual(['2026-08-01'])
  })

  it('names three months for a window that spans one whole month', () => {
    expect(monthsOfWindow('2026-07-20T00:00:00.000Z', '2026-09-05T00:00:00.000Z'))
      .toEqual(['2026-07-01', '2026-08-01', '2026-09-01'])
  })

  it('terminates on a window end no month start can sort below', () => {
    // The comparison is lexicographic against a string taken off the run row.
    // `window_end` is `timestamptz`, so this is not reachable from the schema —
    // but the loop is on a page-load path and an unbounded one there is a
    // hang, not a wrong number.
    const months = monthsOfWindow('2026-09-06T04:06:38.483Z', 'zzzz')
    expect(months.length).toBeLessThanOrEqual(120)
    expect(months[0]).toBe('2026-09-01')
  })
})

describe('clipToMonth', () => {
  const window = { from: '2026-08-11T07:02:10.201Z', to: '2026-09-10T07:02:10.201Z' }

  it('clips at the month boundary on each side', () => {
    expect(clipToMonth(window, '2026-08-01')).toEqual({ from: window.from, to: '2026-09-01T00:00:00.000Z' })
    expect(clipToMonth(window, '2026-09-01')).toEqual({ from: '2026-09-01T00:00:00.000Z', to: window.to })
  })

  it('answers null for a month the window never reached', () => {
    expect(clipToMonth(window, '2026-07-01')).toBeNull()
    expect(clipToMonth(window, '2026-10-01')).toBeNull()
  })
})

describe('updateBand', () => {
  const points = (videos: readonly number[]): UpdatePoint[] =>
    videos.map((v, i) => ({
      runId: `r${i}`,
      window: { from: '2026-09-01T00:00:00.000Z', to: '2026-09-08T00:00:00.000Z' },
      days: 7,
      videos: v,
      comments: null,
      months: ['2026-09-01'],
      contribution: [],
    }))

  it('reads the band and the median off the points BEHIND the newest', () => {
    // The newest is 38 and is deliberately outside the band it is compared
    // with: a median that contained the number being compared would move with
    // it.
    const { median, band, counted, quiet } = updateBand(points([9, 10, 11, 12, 12, 13, 14, 15, 11, 12, 13, 12, 38]))
    expect(band).toEqual({ low: 9, high: 15 })
    expect(median).toBe(12)
    expect(counted).toBe(12)
    expect(quiet).toBe(0)
  })

  it('takes the mean of the two middle values on an even count', () => {
    const { median } = updateBand(points([10, 11, 12, 13, 99]))
    expect(median).toBe(11.5)
  })

  it('leaves an update that found nothing OUT of the band and counts it', () => {
    // Össur's real thirteen, oldest first: three of the twelve behind the
    // newest found nothing at all (measured on production 2026-09-18). "What
    // an update of this workspace usually brings in" is not a question about
    // the updates that brought in nothing — but they are still drawn, so the
    // count is named rather than the points quietly dropped.
    const { median, band, counted, quiet } = updateBand(points([0, 94, 0, 1, 462, 0, 488, 456, 473, 376, 466, 559, 618]))
    expect(quiet).toBe(3)
    expect(counted).toBe(9)
    expect(band).toEqual({ low: 1, high: 559 })
    expect(median).toBe(462)
  })

  it('refuses a band below three points', () => {
    expect(updateBand(points([12, 38])).band).toBeNull()
    expect(updateBand(points([38])).band).toBeNull()
    expect(updateBand([]).band).toBeNull()
  })

  it('refuses a band where fewer than two of the points behind found anything', () => {
    const { median, band } = updateBand(points([0, 0, 12, 38]))
    expect(band).toBeNull()
    expect(median).toBeNull()
  })
})

describe('buildUpdateSeries', () => {
  it('draws thirteen points with the median, the band and every contribution', () => {
    const counts = [9, 10, 11, 12, 12, 13, 14, 15, 11, 12, 13, 12, 38]
    const { runs, videosByRun } = weeklyRuns(counts)
    expect(runs).toHaveLength(UPDATE_SERIES_POINTS)

    const spans = new Map<string, { videos: number; comments: number }>()
    runs.forEach((r, i) => {
      const months = monthsOfWindow(r.window.from, r.window.to)
      for (const m of months) spans.set(`${r.runId}::${m}`, { videos: counts[i], comments: (counts[i] * 40) / months.length })
    })
    const monthOf = new Map([['2026-06-01', 380], ['2026-07-01', 400], ['2026-08-01', 420], ['2026-09-01', 449]])

    const series = buildUpdateSeries({
      runs, videosByRun, spans, monthOf, windowless: 0, requested: 13, windowRead: 'read',
    })

    expect(series.points).toHaveLength(13)
    expect(series.points[0].videos).toBe(9)
    expect(series.points[12].videos).toBe(38)
    expect(series.median).toBe(12)
    expect(series.band).toEqual({ low: 9, high: 15 })
    expect(series.basis).toBe('the last 13 updates · what each one brought in')
    expect(series.note).toBeNull()
    // EVERY point restates its month, not just the newest — that restatement is
    // what stops thirteen windows reading as thirteen periods.
    for (const p of series.points) {
      expect(p.contribution.length).toBe(p.months.length)
      for (const c of p.contribution) expect(c.of).toBeGreaterThan(0)
    }
    expect(series.points[12].contribution[0]).toEqual({ month: '2026-09-01', videos: 38, of: 449 })
    expect(series.points[12].comments).toBe(38 * 40)
  })

  it('carries both months, and both contributions, for a window that crosses', () => {
    const runs = [run('r1', '2026-08-11T07:02:10.201Z', '2026-09-10T07:02:10.201Z')]
    const series = buildUpdateSeries({
      runs,
      videosByRun: new Map([['r1', 253]]),
      spans: new Map([
        ['r1::2026-08-01', { videos: 260, comments: 6000 }],
        ['r1::2026-09-01', { videos: 394, comments: 3331 }],
      ]),
      monthOf: new Map([['2026-08-01', 512], ['2026-09-01', 475]]),
      windowless: 0,
      requested: 13,
      windowRead: 'read',
    })

    const point = series.points[0]
    expect(point.months).toEqual(['2026-08-01', '2026-09-01'])
    expect(point.contribution).toEqual([
      { month: '2026-08-01', videos: 260, of: 512 },
      { month: '2026-09-01', videos: 394, of: 475 },
    ])
    // COMMENTS SUM ACROSS DISJOINT SPANS. Videos do not, and are never added:
    // 260 + 394 is not the window's distinct videos, and the point's own
    // `videos` is the head count of what the update analysed.
    expect(point.comments).toBe(9331)
    expect(point.videos).toBe(253)
    expect(point.days).toBe(30)
  })

  it('excludes a run with no window and names it', () => {
    const { runs, videosByRun } = weeklyRuns([11, 12, 13])
    const series = buildUpdateSeries({
      runs, videosByRun, spans: new Map(), monthOf: new Map(),
      windowless: 2, requested: 13, windowRead: 'read',
    })
    expect(series.points).toHaveLength(3)
    expect(series.note).toContain('2 delivered updates carry no window')
    expect(series.note).toContain('not 13')
  })

  it('refuses the band below three updates and says THAT, not that they found nothing', () => {
    // Both of these updates found videos. The note used to say "fewer than
    // three updates found anything", which is a false claim about our reading —
    // and it is the note every new workspace sees on the first page it opens.
    const { runs, videosByRun } = weeklyRuns([11, 12])
    const series = buildUpdateSeries({
      runs, videosByRun, spans: new Map(), monthOf: new Map(),
      windowless: 0, requested: 13, windowRead: 'read',
    })
    expect(series.band).toBeNull()
    expect(series.median).toBeNull()
    expect(series.note).toContain('Fewer than 3 updates of this workspace carry a window')
    expect(series.note).not.toContain('found anything')
  })

  it('refuses the band when the updates behind this one found nothing, and says THAT', () => {
    // Three updates, and the two behind the newest both found nothing: the
    // other refusal, and the one the old single sentence was written for.
    const { runs, videosByRun } = weeklyRuns([0, 0, 12])
    const series = buildUpdateSeries({
      runs, videosByRun, spans: new Map(), monthOf: new Map(),
      windowless: 0, requested: 13, windowRead: 'read',
    })
    expect(series.band).toBeNull()
    expect(series.note).toContain('Fewer than 2 of the updates behind this one found anything')
    expect(series.note).not.toContain('carry a window,')
  })

  it('says the windowed reading is missing rather than printing a contribution of zero', () => {
    const { runs, videosByRun } = weeklyRuns([11, 12, 13])
    const series = buildUpdateSeries({
      runs, videosByRun, spans: new Map(), monthOf: new Map(),
      windowless: 0, requested: 3, windowRead: 'absent',
    })
    expect(series.points.every((p) => p.contribution.length === 0)).toBe(true)
    expect(series.points.every((p) => p.comments === null)).toBe(true)
    expect(series.note).toContain('windowed reading is not installed')
  })

  it('tells a read that FAILED apart from a reading that is not installed', () => {
    // One blinked read is a fact about one call. Saying "not installed for this
    // workspace" from it is a claim about our deployment, on the one surface
    // whose discipline is that a stated fact is checkable.
    const { runs, videosByRun } = weeklyRuns([11, 12, 13])
    const series = buildUpdateSeries({
      runs, videosByRun, spans: new Map(), monthOf: new Map(),
      windowless: 0, requested: 3, windowRead: 'failed',
    })
    expect(series.points.every((p) => p.contribution.length === 0)).toBe(true)
    expect(series.note).toContain('could not be read just now')
    expect(series.note).not.toContain('not installed')
  })

  it('is an empty series with a reason when no update carries a window', () => {
    const series = buildUpdateSeries({
      runs: [], videosByRun: new Map(), spans: new Map(), monthOf: new Map(),
      windowless: 4, requested: 13, windowRead: 'read',
    })
    expect(series.points).toEqual([])
    expect(series.band).toBeNull()
    expect(series.note).toContain('4 delivered updates carry no window')
    expect(updateSeriesLine(series)).toContain('nothing to draw')
  })
})

describe('updateSeriesLine', () => {
  const seriesOf = (counts: readonly number[]) => {
    const { runs, videosByRun } = weeklyRuns(counts)
    return buildUpdateSeries({
      runs, videosByRun, spans: new Map(), monthOf: new Map(),
      windowless: 0, requested: counts.length, windowRead: 'read',
    })
  }

  it('names the count band in videos, so it is never read as the points band', () => {
    const line = updateSeriesLine(seriesOf([9, 10, 11, 12, 12, 13, 14, 15, 11, 12, 13, 12, 38]))
    expect(line).toBe('38 videos this update found · the 12 updates before it found 9–15 videos, typical 12')
  })

  it('says how many of the updates behind it the band was drawn on', () => {
    // Össur's real thirteen. A legend saying "the 12 before it" while counting
    // 9 would be the page and the picture disagreeing.
    const line = updateSeriesLine(seriesOf([0, 94, 0, 1, 462, 0, 488, 456, 473, 376, 466, 559, 618]))
    expect(line).toBe('618 videos this update found · of the 12 updates before it, the 9 that found anything ran 1–559 videos, typical 462')
  })

  it('says there is no typical yet rather than inventing one', () => {
    expect(updateSeriesLine(seriesOf([12, 38]))).toBe('38 videos this update found · too few updates behind it to say what is typical')
  })

  it('prints no direction word', () => {
    // The mock's "3.1× its usual rate" has no honest form: thirteen readings of
    // our own cadence earn no direction, and no reader flag is on for one.
    const line = updateSeriesLine(seriesOf([9, 10, 11, 12, 12, 13, 14, 15, 11, 12, 13, 12, 38]))
    // Whole-word, the way the copy contract matches — "updates" carries "up".
    expect(directionRe().test(line)).toBe(false)
    expect(line).not.toContain('×')
  })
})
