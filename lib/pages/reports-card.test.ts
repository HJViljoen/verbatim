import { describe, expect, it } from 'vitest'

import { buildQuarterlyCard, countReadings, eraTo, firstComparisonLine, monthsBetween, quarterCaveat, quarterMonths, type QuarterlyCardInput } from './reports-card'
import { QUARTER_UNLOCKS_AT } from '../reading/bands'
import type { DenominatorPoint } from '../reading/series'
import type { WindowReading } from '../reading/read'
import type { SubjectWindowReading } from '../subjects/types'
import { previousQuarter, quarterFor } from '../reports/quarterly'
import { INDUSTRY_AUDIENCE } from '../rivals'
import { formingCardFixture, quarterlyCardFixture, unreadCardFixture } from '../../components/blocks/reports-card/fixture'

const QUARTER = quarterFor(2026, 3)
const PRIOR = previousQuarter(QUARTER)

const window = (videos: number): WindowReading => ({
  denominators: [{ audience: INDUSTRY_AUDIENCE, videos, comments: videos * 4, platform_mix: {}, dual_mention: 0, excluded_undated: 0 }],
  themes: [],
})

const subjectRows = (k: number): SubjectWindowReading[] => [
  { audience: INDUSTRY_AUDIENCE, subject_id: 's1', videos: k, comments: 0, platform_mix: {}, excluded_on_camera: 0, excluded_undated: 0 },
]

const input = (over: Partial<QuarterlyCardInput> = {}): QuarterlyCardInput => ({
  quarter: QUARTER,
  prior: PRIOR,
  subjects: [{ id: 's1', name: 'Durability' }],
  thisQuarter: window(1400),
  lastQuarter: window(1200),
  subjectsNow: subjectRows(420),
  subjectsBefore: subjectRows(300),
  monthsInQuarter: [
    { month: '2026-07-01', videos: 400, backRead: false },
    { month: '2026-08-01', videos: 500, backRead: false },
    { month: '2026-09-01', videos: 500, backRead: false },
  ],
  readings: 9,
  ...over,
})

describe('buildQuarterlyCard', () => {
  it('is null where no subject has been confirmed', () => {
    expect(buildQuarterlyCard(input({ subjects: [] }))).toBeNull()
  })

  it('bands one row per subject off the window pair, with both sides’ k and n', () => {
    const card = buildQuarterlyCard(input())
    expect(card?.rows).toHaveLength(1)
    const v = card!.rows[0].verdict
    expect(v.value).toEqual({ k: 420, n: 1400 })
    expect(v.baseline).toEqual({ k: 300, n: 1200 })
    expect(v.changePts).not.toBeNull()
    expect(v.bandPts).not.toBeNull()
    expect(v.window).toEqual({ kind: 'quarter', from: QUARTER.from, to: QUARTER.to })
  })

  it('reads every row as “not enough months yet” below six readings, and promises no date', () => {
    const card = buildQuarterlyCard(input({ readings: 3 }))
    expect(card?.readings).toBe(3)
    expect(card?.rows.every((r) => r.verdict.state === 'baseline_forming')).toBe(true)
    // A forming baseline draws no comparison at all: no change, no band.
    expect(card?.rows.every((r) => r.verdict.changePts === null && r.verdict.bandPts === null)).toBe(true)
    expect(card?.gate).toMatch(/six months/)
    expect(QUARTER_UNLOCKS_AT).toBe(6)
    expect(card?.ready).toBeNull()
    // D12: the scheduler fires on the first update of a new quarter, not on a
    // date. Nothing in the card's own words may read as one.
    const printed = [card?.gate, card?.note, card?.quarter.label, ...(card?.rows.map((r) => r.label) ?? [])].filter(Boolean).join(' ')
    expect(printed).not.toMatch(/\bready\b/i)
    expect(printed).not.toMatch(/\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/)
  })

  it('says the window reading is not recorded rather than summing months', () => {
    const card = buildQuarterlyCard(input({ thisQuarter: { denominators: null, themes: null } }))
    expect(card?.rows).toHaveLength(0)
    expect(card?.series).toHaveLength(0)
    expect(card?.note).toContain('not recorded')
  })

  it('draws bars off the same denominator the badge divides by', () => {
    const card = buildQuarterlyCard(input())
    expect(card?.series).toEqual([{ label: 'Durability', value: { k: 420, n: 1400 } }])
    expect(card?.series[0].value.n).toBe(card?.rows[0].verdict.value.n)
  })

  // A MISSING ROW ON A READ SIDE IS A ZERO. `window_subject_readings` emits no
  // row for a subject no video mentioned, so the first cut read "no row" as
  // "not read" and dropped the subject.
  it('reads a subject with no row on a read side as zero, not as absent', () => {
    const card = buildQuarterlyCard(input({ subjectsBefore: [] }))
    expect(card?.rows).toHaveLength(1)
    expect(card?.rows[0].verdict.baseline).toEqual({ k: 0, n: 1200 })
    expect(card?.note ?? '').not.toContain('No subject carried a reading on both sides')
  })

  // SEALAND IN PRODUCTION, 2026-09-24: Q2 2026 against a Q1 of seven category
  // videos, where only Price had a Q1 row — so the card drew Price alone.
  it('draws every active subject on Sealand’s shape, not just the one with a row on both sides', () => {
    const names = ['Comfort', 'Community & purpose', 'Durability', 'Looks & style', 'Price', 'Repair & warranty', 'Waterproofing']
    const subjects = names.map((name, i) => ({ id: `s${i}`, name }))
    const q2 = [4, 1, 2, 4, 1, 6, 2]
    const row = (id: string, videos: number): SubjectWindowReading =>
      ({ audience: INDUSTRY_AUDIENCE, subject_id: id, videos, comments: 0, platform_mix: {}, excluded_on_camera: 0, excluded_undated: 0 })
    const card = buildQuarterlyCard(input({
      subjects,
      thisQuarter: window(49),
      lastQuarter: window(7),
      subjectsNow: subjects.map((s, i) => row(s.id, q2[i])),
      subjectsBefore: [row('s4', 1)],
      readings: 4,
    }))
    expect(card?.rows.map((r) => r.label)).toEqual(names)
    expect(card?.series.find((s) => s.label === 'Comfort')?.value).toEqual({ k: 4, n: 49 })
    expect(card?.rows.every((r) => r.verdict.state === 'baseline_forming')).toBe(true)
  })

  it('draws no rows where a side has no denominator for the category', () => {
    const card = buildQuarterlyCard(input({ lastQuarter: { denominators: [], themes: [] } }))
    expect(card?.rows).toHaveLength(0)
    expect(card?.note).toContain('No subject carried a reading on both sides')
  })

  it('names the subject side as unread when M4 is not applied', () => {
    const card = buildQuarterlyCard(input({ subjectsNow: null, subjectsBefore: null }))
    expect(card?.note).toContain('not counted as one window')
  })
})

describe('quarterCaveat', () => {
  it('names a back-read month and a thin one, and is null when neither applies', () => {
    expect(
      quarterCaveat(
        [
          { month: '2026-04-01', videos: 900, backRead: true },
          { month: '2026-05-01', videos: 40, backRead: false },
          { month: '2026-06-01', videos: 800, backRead: false },
        ],
        false,
        false,
      ),
    ).toBe('April 2026 was read back at setup rather than gathered; May 2026 carried under 100 videos.')
    expect(quarterCaveat([{ month: '2026-07-01', videos: 800, backRead: false }], false, false)).toBeNull()
  })

  it('lists several months in one clause', () => {
    const line = quarterCaveat(
      [
        { month: '2026-04-01', videos: 10, backRead: true },
        { month: '2026-05-01', videos: 10, backRead: true },
        { month: '2026-06-01', videos: 10, backRead: true },
      ],
      false,
      false,
    )
    expect(line).toContain('April 2026, May 2026 and June 2026')
  })
})

describe('the gathered era', () => {
  const point = (month: string, origin: 'live' | 'back_read', videos = 400): DenominatorPoint => ({
    month,
    audience: INDUSTRY_AUDIENCE,
    videos,
    comments: 0,
    status: 'frozen',
    origin,
    read_at: '2026-09-18T00:00:00.000Z',
    run_id: null,
  })

  it('counts a month once however many audiences carried it', () => {
    const months = [point('2026-07-01', 'live'), { ...point('2026-07-01', 'live'), audience: 'client' }, point('2026-08-01', 'live')]
    expect(countReadings(months, '2026-07-01')).toBe(2)
  })

  it('counts only the gathered era', () => {
    expect(countReadings([point('2026-03-01', 'back_read'), point('2026-07-01', 'live')], '2026-07-01')).toBe(1)
  })

  it('reads the era to the month in hand, not to the end of the quarter under review', () => {
    // The quarter under review is the PREVIOUS one, so its `to` is up to three
    // months behind the reading. Bounding there put "you have 4" on the card
    // and "you have 7" on the artefact the card links to.
    expect(eraTo('2026-01-01', '2026-09-18T09:00:00.000Z')).toBe('2026-09-01')
    const months = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'].map((m) => point(m, 'live'))
    expect(countReadings(months, '2026-06-01')).toBe(4)
  })

  it('never reads the era backwards', () => {
    // A first update inside the month the card is read in is one month, not none.
    expect(eraTo('2026-09-01', '2026-09-18T09:00:00.000Z')).toBe('2026-09-01')
    expect(eraTo('2026-10-01', '2026-09-18T09:00:00.000Z')).toBe('2026-10-01')
  })

  it('takes back-read off the row, not off a date', () => {
    const rows = [point('2026-07-01', 'back_read', 900), point('2026-08-01', 'live', 500)]
    expect(quarterMonths(rows, QUARTER)).toEqual([
      { month: '2026-07-01', videos: 900, backRead: true },
      { month: '2026-08-01', videos: 500, backRead: false },
      // A month nobody read is not back-read; it is unread.
      { month: '2026-09-01', videos: null, backRead: false },
    ])
  })
})

describe('monthsBetween', () => {
  it('walks the quarter inclusively', () => {
    expect(monthsBetween(QUARTER.from, QUARTER.to)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01'])
  })
})

describe('the wave-2 fixtures', () => {
  it('give wave 2 all three states, each built by the real builder', () => {
    const full = quarterlyCardFixture()
    expect(full.rows).toHaveLength(3)
    expect(full.note).toBeNull()

    const forming = formingCardFixture()
    expect(forming.rows.every((r) => r.verdict.state === 'baseline_forming')).toBe(true)
    // Both halves of the mock's caveat, measured rather than written.
    expect(forming.note).toContain('read back at setup')
    expect(forming.note).toContain('under 100 videos')

    const unread = unreadCardFixture()
    expect(unread.rows).toHaveLength(0)
    expect(unread.note).toContain('not recorded')
  })

  it('promises no date in any state', () => {
    for (const card of [quarterlyCardFixture(), formingCardFixture(), unreadCardFixture()]) {
      expect(card.ready).toBeNull()
      expect([card.gate, card.note].filter(Boolean).join(' ')).not.toMatch(/\bready\b/i)
    }
  })
})

describe('firstComparisonLine', () => {
  it('names the reading month the sixth reading lands in, never a day', () => {
    expect(firstComparisonLine(4, '2026-09-01')).toBe(
      'The first quarter-on-quarter comparison arrives with the November 2026 reading: it needs six monthly readings and you have 4.',
    )
    expect(firstComparisonLine(4, '2026-09-01')).not.toMatch(/\b\d{1,2} (Nov|November)\b/)
  })

  it('is null once the gate is open, and says the count where no month is known', () => {
    expect(firstComparisonLine(QUARTER_UNLOCKS_AT, '2026-09-01')).toBeNull()
    expect(firstComparisonLine(3, null)).toBe(
      'The first quarter-on-quarter comparison arrives once six monthly readings stand behind it: you have 3.',
    )
  })

  it('rides on the built card below the gate and not above it', () => {
    expect(buildQuarterlyCard(input({ readings: 4, readingMonth: '2026-09-01' }))?.firstComparison).toContain('November 2026')
    expect(buildQuarterlyCard(input({ readings: 9, readingMonth: '2026-09-01' }))?.firstComparison).toBeNull()
  })
})
