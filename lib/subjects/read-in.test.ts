import { describe, expect, it } from 'vitest'
import { INDUSTRY_AUDIENCE, rivalKey } from '../rivals'
import type { MonthSeries } from '../reading/series'
import { monthsWrittenAt, subjectBackRead, subjectCountedFrom, subjectReadIn, NO_READING_YET, unreadWords, withoutUnreadMonths } from './read-in'

// Staging (zfmxrrugaihxpubunleu, read 26 Sep): Sealand's 24 Sep update wrote
// August and September at 12:15:41.468 UTC. Six subjects were created 23 Sep at
// 17:40 and confirmed in the change log on 24 Sep at 11:46; Community &
// purpose was created and confirmed on 24 Sep at 12:41, and has no row in
// `month_subject_readings` in any month.
const WRITTEN = '2026-09-24T12:15:41.468Z'
const confirmed = (id: string, at: string, status = 'active') => ({ changed_at: at, surface: 'subjects', after: { id, name: id, status } })
const changes = [
  confirmed('looks', '2026-09-24T11:46:16.982Z'),
  confirmed('community', '2026-09-24T12:41:06.517Z'),
]
const looks = { id: 'looks', named_at: '2026-09-23', created_at: '2026-09-23T17:40:18.020Z' }
const community = { id: 'community', named_at: '2026-09-24', created_at: '2026-09-24T12:41:06.517Z' }

describe('subjectCountedFrom', () => {
  it('is the later of the confirmation and the creation', () => {
    expect(subjectCountedFrom(looks, changes)).toBe(Date.parse('2026-09-24T11:46:16.982Z'))
    expect(subjectCountedFrom(community, changes)).toBe(Date.parse('2026-09-24T12:41:06.517Z'))
  })

  it('a subject named before an update and confirmed after it counts from the confirmation', () => {
    const proposed = { id: 'p', named_at: '2026-09-20', created_at: '2026-09-20T09:00:00.000Z' }
    expect(subjectCountedFrom(proposed, [confirmed('p', '2026-09-25T08:00:00.000Z')])).toBe(Date.parse('2026-09-25T08:00:00.000Z'))
  })

  it('reads a change row whose after is stored as a string, and ignores other subjects and other states', () => {
    const asString = { changed_at: '2026-09-24T11:46:16.982Z', surface: 'subjects', after: JSON.stringify({ id: 'x', status: 'active' }) }
    const other = [confirmed('y', '2026-09-30T00:00:00.000Z'), confirmed('x', '2026-09-30T00:00:00.000Z', 'retired')]
    expect(subjectCountedFrom({ id: 'x', named_at: '2026-09-01' }, [asString, ...other])).toBe(Date.parse('2026-09-24T11:46:16.982Z'))
  })

  it('with nothing but a naming date, counts from the end of that day: a date cannot say which side of that day\'s update it fell on', () => {
    expect(subjectCountedFrom({ id: 'z', named_at: '2026-09-24' }, [])).toBe(Date.parse('2026-09-25T00:00:00.000Z'))
  })
})

describe('monthsWrittenAt', () => {
  it('takes each month\'s latest read_at, over the audiences asked for', () => {
    const rows = [
      { month: '2026-09-01', audience: INDUSTRY_AUDIENCE, read_at: WRITTEN },
      { month: '2026-09-01', audience: rivalKey('Cotopaxi'), read_at: '2026-09-20T10:00:00.000Z' },
      { month: '2026-07-01', audience: INDUSTRY_AUDIENCE, read_at: '2026-09-15T07:20:13.202Z' },
      { month: '2026-09-01', audience: 'client', read_at: '2026-09-30T00:00:00.000Z' },
    ]
    const out = monthsWrittenAt(rows, new Set([INDUSTRY_AUDIENCE, rivalKey('Cotopaxi')]))
    expect(out.get('2026-09-01')).toBe(Date.parse(WRITTEN))
    expect(out.get('2026-07-01')).toBe(Date.parse('2026-09-15T07:20:13.202Z'))
  })
})

describe('subjectReadIn', () => {
  const writtenAt = Date.parse(WRITTEN)

  it('Community & purpose, confirmed after September was written and cited nowhere, was not read in September', () => {
    expect(subjectReadIn({ countedFrom: subjectCountedFrom(community, changes), writtenAt, cited: false })).toBe('unread')
  })

  it('a subject counted before the month was written was read, and its zero is a zero', () => {
    expect(subjectReadIn({ countedFrom: subjectCountedFrom(looks, changes), writtenAt, cited: false })).toBe('read')
  })

  it('a subject with a row in the month was read, whatever the clocks say', () => {
    expect(subjectReadIn({ countedFrom: subjectCountedFrom(community, changes), writtenAt, cited: true })).toBe('read')
  })

  it('a month with no denominator row was read for nobody', () => {
    expect(subjectReadIn({ countedFrom: 0, writtenAt: undefined, cited: false })).toBe('no_month')
  })
})

describe('subjectBackRead (the one-shot back-read, decision K)', () => {
  // Staging: months to July were frozen and written on 15 Sep; the six
  // subjects' rows in them (Looks & style in 2021-08, 2025-09, 2026-06 …) were
  // written on 24 Sep, after they were counted.
  const writtenAt = new Map([
    ['2021-08-01', Date.parse('2026-09-15T07:20:13.202Z')],
    ['2025-10-01', Date.parse('2026-09-15T07:20:13.202Z')],
    ['2026-09-01', Date.parse(WRITTEN)],
  ])
  const looksFrom = subjectCountedFrom(looks, changes)

  it('a subject cited in a month written before it was counted took part in the back-read', () => {
    expect(subjectBackRead(looksFrom, ['2021-08-01', '2026-09-01'], writtenAt)).toBe(true)
  })

  it('so its zeros in the closed months it was not cited in are zeros, not gaps', () => {
    const backRead = subjectBackRead(looksFrom, ['2021-08-01'], writtenAt)
    expect(subjectReadIn({ countedFrom: looksFrom, writtenAt: writtenAt.get('2025-10-01'), cited: false, backRead })).toBe('read')
  })

  it('a subject cited only in months written after it was counted was not back-read', () => {
    // Confirmed 5 Oct and read in September until it froze: August, frozen on
    // 1 Oct before it was counted, was never read for it.
    const from = Date.parse('2026-10-05T08:00:00.000Z')
    const at = new Map([['2026-08-01', Date.parse('2026-10-01T05:00:00.000Z')], ['2026-09-01', Date.parse('2026-11-01T05:00:00.000Z')]])
    expect(subjectBackRead(from, ['2026-09-01'], at)).toBe(false)
    expect(subjectReadIn({ countedFrom: from, writtenAt: at.get('2026-08-01'), cited: false, backRead: false })).toBe('unread')
  })

  it('Community & purpose, cited nowhere, was not back-read', () => {
    expect(subjectBackRead(subjectCountedFrom(community, changes), [], writtenAt)).toBe(false)
  })
})

describe('unreadWords', () => {
  it('says "no reading yet" while the month is still read by the updates to come, and promises no date (default M-a)', () => {
    expect(unreadWords({ month: '2026-09-01', filling: true, nextUpdate: '2026-09-27T04:00:00.000Z' })).toBe('no reading yet')
    expect(unreadWords({ month: '2026-09-01', filling: true, nextUpdate: '2026-09-27T04:00:00.000Z' })).toBe(NO_READING_YET)
  })

  it('says the month was not read once it has frozen, or while no update is scheduled', () => {
    expect(unreadWords({ month: '2026-09-01', filling: false, nextUpdate: '2026-11-08T05:00:00.000Z' })).toBe('not read in September')
    expect(unreadWords({ month: '2026-09-01', filling: true, nextUpdate: null })).toBe('not read in September')
  })
})

describe('withoutUnreadMonths', () => {
  const point = (month: string, k: number | null) => ({
    month, state: 'filling' as const, videos: 625, comments: 0, k, kComments: k, pct: k == null ? null : 0,
    audience: INDUSTRY_AUDIENCE, status: null, origin: null, readAt: null, runId: null, frozenAt: null, clusteringKey: null, labels: [],
  })
  const series = {
    audience: INDUSTRY_AUDIENCE, names: [INDUSTRY_AUDIENCE], objectId: 'community', objectLabel: 'Community & purpose',
    points: [point('2026-08-01', 0), point('2026-09-01', 0)], notes: [], firstReadable: null, substrate: 'seeded' as const,
  } as MonthSeries

  it('turns the filled zeros of an unread month into no reading, and keeps the denominator', () => {
    const out = withoutUnreadMonths(series, (m) => m === '2026-09-01')
    expect(out.points.map((p) => p.k)).toEqual([0, null])
    expect(out.points[1].videos).toBe(625)
    expect(out.points[1].pct).toBeNull()
  })

  it('returns a line that loses nothing as it came', () => {
    expect(withoutUnreadMonths(series, () => false)).toBe(series)
  })
})
