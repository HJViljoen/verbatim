import { describe, expect, it } from 'vitest'
import { calendarBandsFor, calendarRulesFor, seriesToCalendar } from './from-series'
import type { MonthLabel, MonthPoint, MonthSeries } from '../reading/series'

const point = (month: string, over: Partial<MonthPoint> = {}): MonthPoint => ({
  month,
  state: 'frozen',
  videos: 140,
  comments: 1680,
  k: 51,
  kComments: 459,
  pct: 36.4,
  audience: 'competitor:Freitag',
  status: 'frozen',
  origin: 'live',
  readAt: '2026-09-15T00:00:00Z',
  runId: 'c1',
  frozenAt: null,
  clusteringKey: 'c1',
  labels: [],
  ...over,
})

const series = (points: MonthPoint[], over: Partial<MonthSeries> = {}): MonthSeries => ({
  audience: 'competitor:Freitag',
  names: ['competitor:Freitag'],
  objectId: 'r1',
  objectLabel: 'Durability',
  points,
  notes: [],
  firstReadable: points[0]?.month ?? null,
  substrate: 'seeded',
  ...over,
})

describe('seriesToCalendar states', () => {
  it('draws all three kinds of absence the same way, because it draws nothing for all three', () => {
    const s = series([
      point('2026-01-01', { state: 'hollow', videos: null, comments: null, k: null, pct: null }),
      point('2026-02-01', { state: 'missing', videos: null, comments: null, k: null, pct: null }),
      point('2026-03-01', { state: 'not_seeded', videos: null, comments: null, k: null, pct: null }),
    ])
    expect(seriesToCalendar(s, { color: 'c' }).points.map((p) => p.state)).toEqual(['hollow', 'hollow', 'hollow'])
  })

  it('puts a below-floor month in the gutter with its real denominator', () => {
    const s = series([point('2026-06-01', { state: 'below_floor', videos: 41, k: 12, pct: 29.3 })])
    const p = seriesToCalendar(s, { color: 'c' }).points[0]
    expect(p.state).toBe('below_floor')
    expect(p.value).toBeNull()
    expect(p.n).toBe(41)
  })

  it('refuses a month whose own k is under the numerator floor', () => {
    const s = series([point('2026-07-01', { videos: 400, k: 4, pct: 1 })])
    const p = seriesToCalendar(s, { color: 'c' }).points[0]
    expect(p.state).toBe('below_numerator')
    expect(p.value).toBeNull()
  })

  it('reads unreadable as outranking unfinished, and keeps "still filling" in the hover', () => {
    const s = series([point('2026-09-01', { state: 'filling', videos: 400, k: 4, pct: 1 })])
    const p = seriesToCalendar(s, { color: 'c' }).points[0]
    expect(p.state).toBe('below_numerator')
    expect(p.note).toContain('Still filling')
  })

  it('turns the numerator check off where there is no numerator to be below', () => {
    const s = series([point('2026-07-01', { videos: 400, k: 4, pct: 1 })])
    const p = seriesToCalendar(s, { color: 'c', measure: 'videos', floor: null }).points[0]
    expect(p.state).toBe('read')
    expect(p.value).toBe(400)
  })

  it('plots what the measure asks for', () => {
    const s = series([point('2026-07-01')])
    expect(seriesToCalendar(s, { color: 'c' }).points[0].value).toBe(36.4)
    expect(seriesToCalendar(s, { color: 'c', measure: 'videos', floor: null }).points[0].value).toBe(140)
    expect(seriesToCalendar(s, { color: 'c', measure: 'comments', floor: null }).points[0].value).toBe(1680)
  })

  it('carries the "at this point last month" tick only onto a filling month', () => {
    const s = series([point('2026-08-01'), point('2026-09-01', { state: 'filling' })])
    const points = seriesToCalendar(s, { color: 'c', atLastMonth: 27 }).points
    expect(points[0].atLastMonth).toBeUndefined()
    expect(points[1].atLastMonth).toBe(27)
  })

  it('carries the caveats a hover should answer, and leaves the rest to the rules', () => {
    const labels: MonthLabel[] = [
      { kind: 'thin', text: 'Thin month — far fewer videos than usual.' },
      { kind: 'tracking_change', text: 'Poler was added.' },
    ]
    const p = seriesToCalendar(series([point('2026-07-01', { labels })]), { color: 'c' }).points[0]
    expect(p.note).toContain('Thin month')
    expect(p.note).not.toContain('Poler')
  })
})

describe('seriesToCalendar labelling', () => {
  it('names itself after the object it is about', () => {
    expect(seriesToCalendar(series([point('2026-07-01')]), { color: 'c' }).label).toBe('Durability')
  })

  it('falls back to the audience key when the series is about an audience', () => {
    const s = series([point('2026-07-01')], { objectLabel: null })
    expect(seriesToCalendar(s, { color: 'c' }).label).toBe('competitor:Freitag')
  })

  it('ends with the denominator of the month the end label is drawn at', () => {
    expect(seriesToCalendar(series([point('2026-07-01', { videos: 1388 })]), { color: 'c' }).endNote).toBe('of 1,388')
  })

  it('does NOT take the last axis month when that month carries no point', () => {
    // The normal case on today's corpus: a tenant's last month is below the
    // floor, so the end label belongs to an earlier month and so does its "of N".
    const s = series([
      point('2026-07-01', { videos: 1388, k: 401 }),
      point('2026-08-01', { state: 'below_floor', videos: 3, k: 1, pct: 33.3 }),
    ])
    expect(seriesToCalendar(s, { color: 'c' }).endNote).toBe('of 1,388')
  })

  it('offers no automatic "of N" for a counted measure — n is videos whatever is plotted', () => {
    // "388 of 388" is what production printed: on a `videos` line the automatic
    // denominator is the plotted number itself, and on a `comments` line it is
    // a comment count over a video denominator.
    const s = series([point('2026-07-01', { videos: 388, k: 388 })])
    expect(seriesToCalendar(s, { color: 'c', measure: 'videos', floor: null }).endNote).toBeUndefined()
    expect(seriesToCalendar(s, { color: 'c', measure: 'comments', floor: null }).endNote).toBeUndefined()
    expect(seriesToCalendar(s, { color: 'c', measure: 'videos', floor: null, endNote: 'of 3 platforms' }).endNote).toBe('of 3 platforms')
  })

  it('carries no "of N" at all for a line with nothing plotted', () => {
    const s = series([point('2026-08-01', { state: 'hollow', videos: null, k: null, pct: null })])
    expect(seriesToCalendar(s, { color: 'c' }).endNote).toBeUndefined()
  })

  it('takes a caller\'s endNote over its own', () => {
    expect(seriesToCalendar(series([point('2026-07-01')]), { color: 'c', endNote: 'of 84' }).endNote).toBe('of 84')
  })

  it('names an exclusion when it is told one, and never infers it', () => {
    expect(seriesToCalendar(series([point('2026-07-01')]), { color: 'c' }).excludes).toBeUndefined()
    expect(seriesToCalendar(series([point('2026-07-01')]), { color: 'c', excludes: 'excludes Reddit' }).excludes).toBe('excludes Reddit')
  })
})

describe('calendarRulesFor', () => {
  it('draws one rule for a break twenty lines all carry', () => {
    const labels: MonthLabel[] = [{ kind: 'clustering_changed', text: 'Themes were re-grouped from this month.' }]
    const twenty = Array.from({ length: 20 }, () => series([point('2026-08-01', { labels })]))
    expect(calendarRulesFor(twenty)).toHaveLength(1)
  })

  it('keeps two different breaks in one month apart', () => {
    const s = series([point('2026-08-01', {
      labels: [
        { kind: 'renamed', text: 'Freitag became Freitag Bags.' },
        { kind: 'tracking_change', text: 'Poler was added.' },
      ],
    })])
    expect(calendarRulesFor([s]).map((r) => r.kind)).toEqual(['renamed', 'tracking_change'])
  })

  it('carries the months a change moved through to the band', () => {
    const s = series([point('2026-09-01', {
      labels: [{ kind: 'tracking_change', text: 'The corpus was re-tagged.', months: ['2026-07-01', '2026-08-01'] }],
    })])
    expect(calendarRulesFor([s])[0].affects).toEqual(['2026-07-01', '2026-08-01'])
  })

  it('ignores the labels that are not breaks', () => {
    const s = series([point('2026-08-01', { labels: [{ kind: 'thin', text: 'Thin month.' }, { kind: 'still_filling', text: 'Still filling.' }] })])
    expect(calendarRulesFor([s])).toEqual([])
  })

  it('sorts by month, so the same chart draws the same rules twice', () => {
    const a = series([
      point('2026-09-01', { labels: [{ kind: 'tracking_change', text: 'b' }] }),
      point('2026-07-01', { labels: [{ kind: 'tracking_change', text: 'a' }] }),
    ])
    expect(calendarRulesFor([a]).map((r) => r.month)).toEqual(['2026-07-01', '2026-09-01'])
  })
})

describe('calendarBandsFor', () => {
  it('says "read back at setup" once, over the stretch it covers', () => {
    const back: MonthLabel = { kind: 'read_back_at_setup', text: 'Read back at setup — this month had already closed when we started.' }
    const s = series([
      point('2026-04-01', { labels: [back] }),
      point('2026-05-01', { labels: [back] }),
      point('2026-06-01'),
    ])
    const bands = calendarBandsFor([s])
    expect(bands).toHaveLength(1)
    expect(bands[0].months).toEqual(['2026-04-01', '2026-05-01'])
    expect(bands[0].label).toContain('Read back at setup')
  })

  it('unions the back-read of several lines', () => {
    const back: MonthLabel = { kind: 'read_back_at_setup', text: 'Read back at setup.' }
    const a = series([point('2026-04-01', { labels: [back] })])
    const b = series([point('2026-05-01', { labels: [back] })])
    expect(calendarBandsFor([a, b])[0].months).toEqual(['2026-04-01', '2026-05-01'])
  })

  it('draws nothing for a tenant with no back-read', () => {
    expect(calendarBandsFor([series([point('2026-07-01')])])).toEqual([])
  })
})
