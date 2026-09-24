import { describe, it, expect } from 'vitest'
import {
  buildSeries,
  mergeNotes,
  mergeSeriesNotes,
  rankObjects,
  isReadable,
  monthAxis,
  pointsByMonth,
  type DenominatorPoint,
  type MonthLabelKind,
  type NumeratorPoint,
} from './series'

const den = (month: string, videos: number, over: Partial<DenominatorPoint> = {}): DenominatorPoint => ({
  month,
  audience: 'industry-other',
  videos,
  comments: videos * 10,
  status: 'frozen',
  origin: 'live',
  read_at: '2026-09-15T00:00:00.000Z',
  run_id: 'd346b0f7-5b2b-4b46-a60c-db0c83ecfda7',
  frozen_at: '2026-09-15T00:00:00.000Z',
  clustering_key: 'a=v4;c=0.58',
  ...over,
})

const num = (month: string, videos: number, over: Partial<NumeratorPoint> = {}): NumeratorPoint => ({
  month,
  audience: 'industry-other',
  videos,
  comments: videos * 2,
  clustering_key: 'a=v4;c=0.58',
  ...over,
})

const kinds = (labels: readonly { kind: MonthLabelKind }[]): MonthLabelKind[] => labels.map((l) => l.kind)

describe('monthAxis', () => {
  it('generates every month from one to the other, inclusive', () => {
    expect(monthAxis('2026-06-01', '2026-09-01')).toEqual(['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'])
  })

  it('takes any day in a month and returns month starts', () => {
    expect(monthAxis('2026-06-17T09:00:00Z', '2026-08-02')).toEqual(['2026-06-01', '2026-07-01', '2026-08-01'])
  })

  it('is one month when both ends are the same month', () => {
    expect(monthAxis('2026-09-01', '2026-09-30')).toEqual(['2026-09-01'])
  })

  it('crosses a year end', () => {
    expect(monthAxis('2025-11-01', '2026-02-01')).toEqual(['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01'])
  })

  it('is empty when the end is before the start rather than wrapping', () => {
    expect(monthAxis('2026-09-01', '2026-06-01')).toEqual([])
  })
})

describe('buildSeries · the six month states', () => {
  const axis = monthAxis('2026-06-01', '2026-09-01')

  it('frozen and filling come off the ROW, not the clock', () => {
    const s = buildSeries({
      axis,
      audience: 'industry-other',
      denominators: [
        den('2026-06-01', 182),
        den('2026-07-01', 118),
        den('2026-08-01', 628),
        // Past its 30-day line and still stored filling: the next visit is what
        // freezes it, and until then the row is what the word means.
        den('2026-09-01', 388, { status: 'filling', frozen_at: null }),
      ],
    })
    expect(s.points.map((p) => p.state)).toEqual(['frozen', 'frozen', 'frozen', 'filling'])
    expect(s.points[3].status).toBe('filling')
  })

  it('a month with a row under the floor is below_floor, not hollow', () => {
    const s = buildSeries({ axis, audience: 'client', denominators: [den('2026-08-01', 20, { audience: 'client' })] })
    const by = pointsByMonth(s)
    expect(by.get('2026-08-01')!.state).toBe('below_floor')
    expect(by.get('2026-08-01')!.videos).toBe(20)
    expect(by.get('2026-07-01')!.state).toBe('hollow')
  })

  it('a hollow month keeps its slot and its nulls — never a zero', () => {
    const s = buildSeries({ axis, audience: 'industry-other', denominators: [den('2026-08-01', 628)] })
    expect(s.points).toHaveLength(4)
    const july = pointsByMonth(s).get('2026-07-01')!
    expect(july.state).toBe('hollow')
    expect(july.videos).toBeNull()
    expect(july.comments).toBeNull()
    expect(july.pct).toBeNull()
  })

  it('an unapplied migration is `missing` on every month, not zero', () => {
    const s = buildSeries({ axis, audience: 'industry-other', denominators: [], substrate: 'missing' })
    expect(s.points.every((p) => p.state === 'missing')).toBe(true)
    expect(s.points.every((p) => p.videos === null)).toBe(true)
  })

  it('an unseeded tenant is `not_seeded`, told apart from a genuine zero', () => {
    const s = buildSeries({ axis, audience: 'industry-other', denominators: [], substrate: 'not_seeded' })
    expect(s.points.every((p) => p.state === 'not_seeded')).toBe(true)
    const seeded = buildSeries({ axis, audience: 'industry-other', denominators: [den('2026-06-01', 182)] })
    expect(seeded.points[1].state).toBe('hollow')
  })

  it('missing and not_seeded suppress the change-log note, which would be a claim about nothing', () => {
    expect(buildSeries({ axis, audience: 'x', denominators: [], substrate: 'missing' }).notes).toEqual([])
    expect(buildSeries({ axis, audience: 'x', denominators: [], substrate: 'not_seeded' }).notes).toEqual([])
  })

  it('isReadable is true only for the two states a comparison may be drawn on', () => {
    const s = buildSeries({
      axis,
      audience: 'industry-other',
      denominators: [den('2026-06-01', 182), den('2026-07-01', 20)],
    })
    expect(s.points.map(isReadable)).toEqual([true, false, false, false])
  })
})

describe('buildSeries · the numerator', () => {
  const axis = monthAxis('2026-06-01', '2026-09-01')
  const denominators = [den('2026-06-01', 182), den('2026-07-01', 118), den('2026-08-01', 628), den('2026-09-01', 388)]

  it('reproduces the pinned production reading 28 · 9 · 102 · 44', () => {
    const s = buildSeries({
      axis,
      audience: 'industry-other',
      objectId: '29837c1a-ad02-452c-acaf-0da46efcffbd',
      objectLabel: 'Audience identities and amputation types',
      denominators,
      readings: [num('2026-06-01', 28), num('2026-07-01', 9), num('2026-08-01', 102), num('2026-09-01', 44)],
    })
    expect(s.points.map((p) => p.k)).toEqual([28, 9, 102, 44])
    expect(s.points.map((p) => p.pct)).toEqual([15.4, 7.6, 16.2, 11.3])
    expect(s.objectLabel).toBe('Audience identities and amputation types')
  })

  it('a month the object is absent from is zero, and a month the AUDIENCE is absent from is null', () => {
    const s = buildSeries({
      axis,
      audience: 'industry-other',
      objectId: 't',
      denominators: [den('2026-06-01', 182), den('2026-08-01', 628)],
      readings: [num('2026-06-01', 28)],
    })
    const by = pointsByMonth(s)
    expect(by.get('2026-08-01')!.k).toBe(0)
    expect(by.get('2026-08-01')!.pct).toBe(0)
    expect(by.get('2026-07-01')!.k).toBeNull()
  })

  it('a denominator-only series has no k at all — not a zero', () => {
    const s = buildSeries({ axis, audience: 'industry-other', denominators })
    expect(s.points.every((p) => p.k === null && p.pct === null)).toBe(true)
  })

  it('ignores numerator rows filed under another audience', () => {
    const s = buildSeries({
      axis,
      audience: 'industry-other',
      objectId: 't',
      denominators,
      readings: [num('2026-08-01', 102), num('2026-08-01', 7, { audience: 'client' })],
    })
    expect(pointsByMonth(s).get('2026-08-01')!.k).toBe(102)
  })

  it('drops rows outside the axis rather than widening it', () => {
    const s = buildSeries({
      axis,
      audience: 'industry-other',
      denominators: [...denominators, den('2026-02-01', 500)],
    })
    expect(s.points).toHaveLength(4)
    expect(s.points[0].month).toBe('2026-06-01')
  })

  it('names the first month a comparison could start from', () => {
    const s = buildSeries({
      axis,
      audience: 'industry-other',
      denominators: [den('2026-06-01', 20), den('2026-07-01', 118), den('2026-08-01', 628)],
    })
    expect(s.firstReadable).toBe('2026-07-01')
    expect(buildSeries({ axis, audience: 'x', denominators: [] }).firstReadable).toBeNull()
  })
})

describe('buildSeries · labels', () => {
  const axis = monthAxis('2026-06-01', '2026-09-01')

  it('labels a back-read month as read back at setup', () => {
    const s = buildSeries({
      axis,
      audience: 'industry-other',
      denominators: [den('2026-06-01', 182, { origin: 'back_read' }), den('2026-07-01', 118)],
    })
    expect(kinds(s.points[0].labels)).toContain('read_back_at_setup')
    expect(kinds(s.points[1].labels)).not.toContain('read_back_at_setup')
  })

  it('prints the date a still-filling month settles on', () => {
    const s = buildSeries({
      axis,
      audience: 'industry-other',
      denominators: [den('2026-09-01', 388, { status: 'filling', frozen_at: null })],
    })
    const label = s.points[3].labels.find((l) => l.kind === 'still_filling')!
    expect(label.text).toContain('31 Oct 2026')
  })

  it('draws a clustering rule at the first month under the new key, and nowhere else', () => {
    const s = buildSeries({
      axis,
      audience: 'industry-other',
      objectId: 't',
      denominators: [den('2026-06-01', 182), den('2026-07-01', 118), den('2026-08-01', 628), den('2026-09-01', 388)],
      readings: [
        num('2026-06-01', 28),
        num('2026-07-01', 9),
        num('2026-08-01', 102, { clustering_key: 'a=v5;c=0.58' }),
        num('2026-09-01', 44, { clustering_key: 'a=v5;c=0.58' }),
      ],
    })
    expect(s.points.map((p) => kinds(p.labels).includes('clustering_changed'))).toEqual([false, false, true, false])
  })

  it('collapses a run of unrecorded groupings into ONE note instead of a rule per month', () => {
    // Every month frozen before the fingerprint shipped carries no key, and two
    // unknowns are deliberately not one regime.
    const s = buildSeries({
      axis,
      audience: 'industry-other',
      objectId: 't',
      denominators: [den('2026-06-01', 182), den('2026-07-01', 118), den('2026-08-01', 628), den('2026-09-01', 388)],
      readings: [
        num('2026-06-01', 28, { clustering_key: null }),
        num('2026-07-01', 9, { clustering_key: null }),
        num('2026-08-01', 102, { clustering_key: null }),
        num('2026-09-01', 44, { clustering_key: null }),
      ],
    })
    expect(s.points.every((p) => !kinds(p.labels).includes('clustering_changed'))).toBe(true)
    const collapsed = s.notes.filter((n) => n.kind === 'clustering_changed')
    expect(collapsed).toHaveLength(1)
    expect(collapsed[0].text).toContain('Jul 2026')
    expect(collapsed[0].text).toContain('Sep 2026')
  })

  // ONE MONTH IS NOT "THOSE MONTHS". Rendered on Ossur's Overview and Voice
  // today: "We did not record how themes were grouped for Sep 2026, so those
  // months are not strictly comparable with the ones after them" - one month,
  // "those months", and "the ones after them" about the month currently
  // filling, which has none after it.
  it('words a single unrecorded month in the singular', () => {
    const s = buildSeries({
      axis,
      audience: 'industry-other',
      objectId: 't',
      denominators: [den('2026-08-01', 628), den('2026-09-01', 388)],
      readings: [
        num('2026-08-01', 102, { clustering_key: 'k1' }),
        num('2026-09-01', 44, { clustering_key: null }),
      ],
    })
    const note = s.notes.find((n) => n.kind === 'clustering_changed')
    expect(note?.months).toHaveLength(1)
    expect(note?.text).toBe('We did not record how themes were grouped for Sep 2026, so it is not strictly comparable with the months around it.')
  })

  // A SUBJECT'S MONTHS HAVE NO CLUSTERING TO BE UNRECORDED ABOUT.
  // `month_subject_readings` carries no `clustering_key` column, so every row
  // arrives with null and `clusteringBoundaries` marked every month but the
  // first `unknown` — and the series came back with "We did not record how
  // themes were grouped for Jun 2026 to Sep 2026", which is off-topic for a
  // subject and false, since a subject's months ARE comparable across a
  // re-clustering. `loadMonthSeries` now passes `regimes: []` for any numerator
  // kind whose table has no clustering; this is that state.
  it('says nothing about grouping for a series that has no clustering', () => {
    const s = buildSeries({
      axis,
      audience: 'industry-other',
      objectId: 's',
      regimes: [],
      denominators: [den('2026-06-01', 182), den('2026-07-01', 118), den('2026-08-01', 628), den('2026-09-01', 388)],
      readings: [
        num('2026-06-01', 28, { clustering_key: null }),
        num('2026-07-01', 9, { clustering_key: null }),
        num('2026-08-01', 102, { clustering_key: null }),
        num('2026-09-01', 44, { clustering_key: null }),
      ],
    })
    expect(s.notes.filter((n) => n.kind === 'clustering_changed')).toEqual([])
    expect(s.points.every((p) => !kinds(p.labels).includes('clustering_changed'))).toBe(true)
  })

  it('draws a faint band over the months a tracking change MOVED, not the month it was made in', () => {
    const s = buildSeries({
      axis,
      audience: 'industry-other',
      denominators: [den('2026-06-01', 182), den('2026-07-01', 118), den('2026-08-01', 628), den('2026-09-01', 388)],
      changes: [
        {
          changed_at: '2026-09-12T00:00:00.000Z',
          surface: 'terms',
          note: 'Two search terms were added.',
          months: '[2026-06-01,2026-08-01)',
        },
      ],
    })
    expect(s.points.map((p) => kinds(p.labels).includes('tracking_change'))).toEqual([true, true, false, false])
    expect(s.points[0].labels.find((l) => l.kind === 'tracking_change')!.text).toBe('Two search terms were added.')
  })

  it('says one sentence per thing said, not one per covering change', () => {
    const s = buildSeries({
      axis,
      audience: 'industry-other',
      denominators: [den('2026-06-01', 182)],
      changes: [
        { changed_at: '2026-06-02T00:00:00.000Z', surface: 'terms', note: null, months: '[2026-06-01,2026-07-01)' },
        { changed_at: '2026-06-03T00:00:00.000Z', surface: 'rivals', note: null, months: '[2026-06-01,2026-07-01)' },
        { changed_at: '2026-06-04T00:00:00.000Z', surface: 'handles', note: 'A rival was renamed.', months: '[2026-06-01,2026-07-01)' },
      ],
    })
    const said = s.points[0].labels.filter((l) => l.kind === 'tracking_change').map((l) => l.text)
    expect(said).toEqual([
      'What this workspace tracks changed, and it moved this month.',
      'A rival was renamed.',
    ])
  })

  it('a change with no months band marks nothing — a band nobody can parse is no record', () => {
    const s = buildSeries({
      axis,
      audience: 'industry-other',
      denominators: [den('2026-08-01', 628)],
      changes: [{ changed_at: '2026-08-04T00:00:00.000Z', surface: 'rivals', note: 'x', months: null }],
    })
    expect(s.points.every((p) => !kinds(p.labels).includes('tracking_change'))).toBe(true)
  })

  it('carries the change-log boundary as a series note, in the calibrated wording', () => {
    const none = buildSeries({ axis, audience: 'x', denominators: [] })
    expect(none.notes[0].kind).toBe('no_change_record_before')
    expect(none.notes[0].text).toContain('No configuration change has been recorded yet')
    const some = buildSeries({ axis, audience: 'x', denominators: [], changeLogFrom: '2026-09-15T08:00:00.000Z' })
    // RC6: the boundary dates itself in the reader's form, never the store's.
    expect(some.notes[0].text).toContain('15 Sep 2026')
  })

  it('marks a thin month against its own trailing median, and leaves a normal one alone', () => {
    const wide = monthAxis('2025-10-01', '2026-09-01')
    const s = buildSeries({
      axis: wide,
      audience: 'industry-other',
      denominators: [
        ...wide.slice(0, 11).map((m) => den(m, 600)),
        den('2026-09-01', 150),
      ],
    })
    expect(kinds(s.points[s.points.length - 1].labels)).toContain('thin')
    expect(kinds(s.points[5].labels)).not.toContain('thin')
  })

  it('applies the no-updates arm only from the tenant\'s first run, so the back-read is not thin by construction', () => {
    // Össur's first run is 2026-04-06; 51 of its 55 category months have zero
    // updates by construction, and a literal rule would empty the back-read.
    const wide = monthAxis('2025-10-01', '2026-09-01')
    const s = buildSeries({
      axis: wide,
      audience: 'industry-other',
      denominators: wide.map((m) => den(m, 600, { origin: 'back_read' })),
      updatesByMonth: Object.fromEntries(wide.map((m) => [m, 0])),
      firstRunMonth: '2026-04-01',
    })
    const thin = s.points.filter((p) => kinds(p.labels).includes('thin')).map((p) => p.month)
    expect(thin).toEqual(['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'])
  })

  it('keeps one row per month and says so when a second one exists', () => {
    // A renamed rival's months arrive from all its keys. A bare Map.set kept
    // whichever came last and dropped the other with no signal, so the month
    // drew a fraction of itself as fact. Summing overstates — videos are
    // distinct and the two sets overlap — so the first row wins and the month
    // carries a caveat.
    const axis2 = monthAxis('2026-06-01', '2026-07-01')
    const renames = [{ from: 'competitor:Topo', to: 'competitor:Topo Designs', at: '2026-06-15T00:00:00.000Z' }]
    const s = buildSeries({
      axis: axis2,
      audience: 'competitor:Topo Designs',
      renames,
      denominators: [
        den('2026-06-01', 182, { audience: 'competitor:Topo' }),
        den('2026-06-01', 40, { audience: 'competitor:Topo Designs' }),
        den('2026-07-01', 200, { audience: 'competitor:Topo Designs' }),
      ],
    })
    const june = s.points[0]
    expect(june.videos).toBe(182)
    expect(kinds(june.labels)).toContain('split_keys')
    expect(kinds(s.points[1].labels)).not.toContain('split_keys')
  })

  it('names the unit the thin rule actually measures', () => {
    const wide = monthAxis('2025-10-01', '2026-09-01')
    const s = buildSeries({
      axis: wide,
      audience: 'industry-other',
      denominators: [...wide.slice(0, 11).map((m) => den(m, 600)), den('2026-09-01', 150)],
    })
    const thin = s.points[s.points.length - 1].labels.find((l) => l.kind === 'thin')
    // thinMonth compares videos against the trailing median of videos; nothing
    // in the computation touches a comment count.
    expect(thin?.text).toContain('far fewer videos than usual')
    expect(thin?.text).not.toContain('conversations')
  })

  it('reads a run-era month with NO key as zero updates, not as uncounted', () => {
    // loadUpdates keys byMonth only for months that have a delivered run, so a
    // month the pipeline did not run in arrived as null and could never be
    // thin — the exact case decision M's first arm exists for. Here August has
    // no key and every month is the same size, so the median arm cannot be
    // what marks it.
    const wide = monthAxis('2026-05-01', '2026-09-01')
    const s = buildSeries({
      axis: wide,
      audience: 'industry-other',
      denominators: wide.map((m) => den(m, 600)),
      updatesByMonth: { '2026-05-01': 4, '2026-06-01': 4, '2026-07-01': 4, '2026-09-01': 4 },
      firstRunMonth: '2026-04-01',
    })
    const thin = s.points.filter((p) => kinds(p.labels).includes('thin')).map((p) => p.month)
    expect(thin).toEqual(['2026-08-01'])
  })

  it('leaves a month BEFORE the first run uncounted rather than zero', () => {
    const wide = monthAxis('2026-01-01', '2026-03-01')
    const s = buildSeries({
      axis: wide,
      audience: 'industry-other',
      denominators: wide.map((m) => den(m, 600, { origin: 'back_read' })),
      updatesByMonth: {},
      firstRunMonth: '2026-04-01',
    })
    expect(s.points.filter((p) => kinds(p.labels).includes('thin'))).toEqual([])
  })
})

describe('buildSeries · a renamed rival is one line with the break marked', () => {
  const axis = monthAxis('2026-06-01', '2026-09-01')
  const renames = [{ from: 'competitor:Topo', to: 'competitor:Topo Designs', at: '2026-08-04T00:00:00.000Z' }]
  const rows = [
    den('2026-06-01', 182, { audience: 'competitor:Topo' }),
    den('2026-07-01', 118, { audience: 'competitor:Topo' }),
    den('2026-08-01', 628, { audience: 'competitor:Topo Designs' }),
    den('2026-09-01', 388, { audience: 'competitor:Topo Designs' }),
  ]

  it('draws one line under the newest name and keeps both in the legend', () => {
    const s = buildSeries({ axis, audience: 'competitor:Topo Designs', denominators: rows, renames })
    expect(s.audience).toBe('competitor:Topo Designs')
    expect(s.names).toEqual(['competitor:Topo', 'competitor:Topo Designs'])
    expect(s.points.map((p) => p.videos)).toEqual([182, 118, 628, 388])
  })

  it('is found by the OLD key too, so a link that predates the rename still resolves', () => {
    const s = buildSeries({ axis, audience: 'competitor:Topo', denominators: rows, renames })
    expect(s.audience).toBe('competitor:Topo Designs')
    expect(s.points.map((p) => p.videos)).toEqual([182, 118, 628, 388])
  })

  it('marks the break at the month the key changes, and says both names', () => {
    const s = buildSeries({ axis, audience: 'competitor:Topo Designs', denominators: rows, renames })
    expect(s.points.map((p) => kinds(p.labels).includes('renamed'))).toEqual([false, false, true, false])
    expect(s.points[2].labels.find((l) => l.kind === 'renamed')!.text).toContain('Topo')
  })

  it('keeps each month filed under the name it was read as', () => {
    const s = buildSeries({ axis, audience: 'competitor:Topo Designs', denominators: rows, renames })
    expect(s.points.map((p) => p.audience)).toEqual([
      'competitor:Topo',
      'competitor:Topo',
      'competitor:Topo Designs',
      'competitor:Topo Designs',
    ])
  })

  it('an audience nothing was renamed to or from comes back untouched', () => {
    const s = buildSeries({ axis, audience: 'industry-other', denominators: [den('2026-08-01', 628)], renames })
    expect(s.names).toEqual(['industry-other'])
    expect(s.audience).toBe('industry-other')
  })

  it('an audience with no rows at all is still a line of hollow months', () => {
    const s = buildSeries({ axis, audience: 'competitor:Rareform', denominators: [den('2026-08-01', 628)] })
    expect(s.audience).toBe('competitor:Rareform')
    expect(s.points.every((p) => p.state === 'hollow')).toBe(true)
  })
})

describe('the labels a client actually reads carry no ISO dates', () => {
  // horizon.test.ts asserts HORIZON_LABEL has no jargon in it; nothing asserted
  // anything about the MonthLabel texts, which are the strings printed on a
  // chart. "settles on 2026-10-31" and "for 2026-07 to 2026-09" both shipped.
  const axis = monthAxis('2026-06-01', '2026-09-01')
  const rows = [
    den('2026-06-01', 400, { status: 'frozen', clustering_key: null }),
    den('2026-07-01', 400, { status: 'frozen', clustering_key: null }),
    den('2026-08-01', 400, { status: 'frozen', clustering_key: 'a=v4;c=0.58' }),
    den('2026-09-01', 400, { status: 'filling' }),
  ]
  const series = buildSeries({ axis, audience: 'industry-other', denominators: rows })
  const texts = [...series.points.flatMap((p) => p.labels), ...series.notes].map((l) => l.text)

  it('prints a settle date as a date, not as a slice', () => {
    const filling = series.points.find((p) => p.labels.some((l) => l.kind === 'still_filling'))
    expect(filling?.labels.find((l) => l.kind === 'still_filling')?.text).toContain('settles on 31 Oct 2026')
  })

  it('names a stretch of months in months', () => {
    const note = series.notes.find((n) => n.kind === 'clustering_changed')
    expect(note?.text).toContain('Jul 2026 to Aug 2026')
  })

  it('has no YYYY-MM or YYYY-MM-DD anywhere in what it prints', () => {
    for (const text of texts) expect(text).not.toMatch(/\d{4}-\d{2}/)
  })
})

describe('mergeSeriesNotes — a set of series says its caveats once', () => {
  const axis = monthAxis('2026-06-01', '2026-08-01')
  const rows = [
    den('2026-06-01', 400, { clustering_key: null }),
    den('2026-07-01', 400, { clustering_key: null }),
    den('2026-08-01', 400, { clustering_key: null }),
  ]
  const one = (objectId: string) =>
    buildSeries({ axis, audience: 'industry-other', denominators: rows, objectId })

  it('collapses the same sentence across twenty series into one', () => {
    const series = Array.from({ length: 20 }, (_, i) => one(`t${i}`))
    expect(series[0].notes.length).toBeGreaterThan(0)
    expect(mergeSeriesNotes(series)).toEqual(series[0].notes)
  })

  it('keeps two DIFFERENT notes, first occurrence first', () => {
    const other = buildSeries({
      axis,
      audience: 'client',
      denominators: [den('2026-06-01', 400, { audience: 'client', clustering_key: 'a=v5' })],
      changeLogFrom: '2026-09-15T07:22:47.000Z',
    })
    const merged = mergeSeriesNotes([one('t1'), other])
    expect(merged.length).toBeGreaterThan(one('t1').notes.length)
    expect(merged.slice(0, one('t1').notes.length)).toEqual(one('t1').notes)
  })

  it('says ONE unrecorded-grouping sentence for series covering different months', () => {
    // Each theme's stretch is computed off the months that theme has rows in,
    // so the sentences differ in wording and de-duplicating on text cannot
    // collapse them. Twenty themes across three audiences used to mean many
    // sentences; the convention is one per run of months, never one per bar.
    const wide = monthAxis('2026-06-01', '2026-09-01')
    const early = buildSeries({
      axis: wide, audience: 'industry-other', objectId: 't1',
      denominators: [den('2026-06-01', 400, { clustering_key: null }), den('2026-07-01', 400, { clustering_key: null })],
    })
    const late = buildSeries({
      axis: wide, audience: 'industry-other', objectId: 't2',
      denominators: [den('2026-08-01', 400, { clustering_key: null }), den('2026-09-01', 400, { clustering_key: null })],
    })
    expect(early.notes.filter((n) => n.kind === 'clustering_changed')[0].text)
      .not.toBe(late.notes.filter((n) => n.kind === 'clustering_changed')[0].text)
    const merged = mergeSeriesNotes([early, late])
    const caveats = merged.filter((n) => n.kind === 'clustering_changed')
    expect(caveats).toHaveLength(1)
    expect(caveats[0].text).toContain('Jul 2026 and Sep 2026')
  })

  it('answers an empty set with no notes', () => {
    expect(mergeSeriesNotes([])).toEqual([])
  })

  // The monthly artefact holds two already-merged lists — the page's themes
  // and its own movers' series — and must still say one caveat across them.
  it('merges lists that have already been merged once', () => {
    const wide = monthAxis('2026-06-01', '2026-09-01')
    const early = buildSeries({
      axis: wide, audience: 'industry-other', objectId: 't1',
      denominators: [den('2026-06-01', 400, { clustering_key: null }), den('2026-07-01', 400, { clustering_key: null })],
    })
    const late = buildSeries({
      axis: wide, audience: 'industry-other', objectId: 't2',
      denominators: [den('2026-08-01', 400, { clustering_key: null }), den('2026-09-01', 400, { clustering_key: null })],
    })
    const merged = mergeNotes([mergeSeriesNotes([early]), mergeSeriesNotes([late])])
    expect(merged.filter((n) => n.kind === 'clustering_changed')).toHaveLength(1)
    expect(merged).toEqual(mergeSeriesNotes([early, late]))
  })
})

describe('rankObjects — which objects are worth drawing', () => {
  const w = (audience: string, objectId: string, comments: number, months = 3) => ({
    audience, objectId, comments, months,
  })

  it('ranks each audience on its own, largest first', () => {
    const ranked = rankObjects(
      [w('industry-other', 't1', 308), w('industry-other', 't2', 900), w('client', 't3', 40)],
      2,
    )
    expect(ranked.map((r) => `${r.audience}/${r.objectId}`)).toEqual([
      'client/t3', 'industry-other/t2', 'industry-other/t1',
    ])
  })

  it('takes the limit per audience, not across the set', () => {
    const rows = ['a', 'b', 'c'].flatMap((aud) => [w(aud, 'x', 10), w(aud, 'y', 5)])
    expect(rankObjects(rows, 1)).toHaveLength(3)
  })

  it('breaks a tie on the id, so the same corpus ranks the same way twice', () => {
    const rows = [w('client', 'zzz', 10), w('client', 'aaa', 10)]
    expect(rankObjects(rows, 2).map((r) => r.objectId)).toEqual(['aaa', 'zzz'])
    expect(rankObjects([...rows].reverse(), 2).map((r) => r.objectId)).toEqual(['aaa', 'zzz'])
  })

  it('answers nothing for a limit of zero or an empty set', () => {
    expect(rankObjects([w('client', 't1', 10)], 0)).toEqual([])
    expect(rankObjects([], 5)).toEqual([])
  })
})
