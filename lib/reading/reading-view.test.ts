import { describe, expect, it } from 'vitest'

import { barLine, monthWords } from './reading-month'
import { readingViewFrom, updateInstant, type DeliveredRun, type ReadingDenominator } from './reading-view'

// ---- Fixtures: Sealand's real rows ------------------------------------------------
//
// THE RUNS are the research's (DR F21), as in reading-month.test.ts: completed
// runs on 28 Jun, 9 Jul, 17 Aug, 9 and 10 Sep, a partial run on 20 Sep and the
// 24 Sep update the plan's bar names. The research gives days, not finish
// times, so each is stamped 12:00 UTC; from 27 Sep the schedule's Sunday
// 06:00 SAST updates, finished about 4.5 h later (08:30 UTC).
const run = (id: string, day: string, finished = `${day}T12:00:00.000Z`): DeliveredRun => ({
  id,
  started_at: `${day}T04:00:00.000Z`,
  completed_at: finished,
})
const SEALAND_RUNS: DeliveredRun[] = [
  run('r1', '2026-06-28'),
  run('r2', '2026-07-09'),
  run('r3', '2026-08-17'),
  run('r4', '2026-09-09'),
  run('r5', '2026-09-10'),
  run('r6', '2026-09-20'),
  run('r7', '2026-09-24'),
]
const SUNDAYS: DeliveredRun[] = ['2026-09-27', '2026-10-04', '2026-10-11'].map((d, i) =>
  run(`s${i}`, d, `${d}T08:30:00.000Z`),
)

// THE DENOMINATOR ROWS, per audience. September is production's (decision E):
// 626 in the category, 29 filed under a tracked brand, and the client's own 9
// (GR F61), which are not the market. August is staging's split (DR: the
// category is 351 of 377); the 26 rival-filed videos are 377 − 351, put under
// Cotopaxi because nothing here turns on which rival holds them. Apr–Jul are
// the frozen stored rows, category plus Cotopaxi (DR F11).
const row = (month: string, audience: string, videos: number, extra: Partial<ReadingDenominator> = {}): ReadingDenominator => ({
  month,
  audience,
  videos,
  comments: 0,
  status: 'filling',
  origin: 'live',
  ...extra,
})
const COTOPAXI = 'competitor:Cotopaxi'
const FROZEN = { status: 'frozen' as const }
const SEALAND_ROWS: ReadingDenominator[] = [
  row('2026-04-01', 'industry-other', 4, { ...FROZEN, origin: 'back_read' }),
  row('2026-04-01', COTOPAXI, 1, { ...FROZEN, origin: 'back_read' }),
  row('2026-05-01', 'industry-other', 8, { ...FROZEN, origin: 'back_read' }),
  row('2026-05-01', COTOPAXI, 3, { ...FROZEN, origin: 'back_read' }),
  row('2026-06-01', 'industry-other', 45, FROZEN),
  row('2026-06-01', COTOPAXI, 5, FROZEN),
  row('2026-07-01', 'industry-other', 35, FROZEN),
  row('2026-07-01', COTOPAXI, 1, FROZEN),
  row('2026-08-01', 'client', 1),
  row('2026-08-01', 'industry-other', 351),
  row('2026-08-01', COTOPAXI, 26),
  row('2026-09-01', 'client', 9),
  row('2026-09-01', 'industry-other', 626),
  row('2026-09-01', COTOPAXI, 29),
]
// OCTOBER IS NOT KNOWABLE today. The clocks after the 4 Oct run need it to
// have a row, so it carries September's category count as a stand-in; nothing
// below turns on its size beyond "has a row".
const OCTOBER_ROW = row('2026-10-01', 'industry-other', 626)

const SUNDAY = { report_period: 'weekly', report_day: 'sunday' }

describe('readingViewFrom: which month, and the one other month the selector offers', () => {
  it('24 Sep: September so far leads, and August is the other month', () => {
    const v = readingViewFrom({ now: '2026-09-24T18:00:00.000Z', runs: SEALAND_RUNS, denominators: SEALAND_ROWS, schedule: SUNDAY })
    expect(v.reading.month).toBe('2026-09-01')
    expect(v.reading.state).toBe('so_far')
    expect(v.other).toEqual({ month: '2026-08-01', isDefault: false })
    expect(barLine(v.reading)).toBe('as at the 24 Sep update · next update Sun 27 Sep')
  })

  it('2 Oct, before any October row: September, ended, and no other month to offer', () => {
    const v = readingViewFrom({
      now: '2026-10-02T06:00:00.000Z', runs: [...SEALAND_RUNS, SUNDAYS[0]], denominators: SEALAND_ROWS, schedule: SUNDAY,
    })
    expect(v.reading.month).toBe('2026-09-01')
    expect(v.reading.state).toBe('ended')
    expect(v.reading.reason).toBe('current_thin')
    expect(v.other).toBeNull()
    expect(barLine(v.reading)).toBe('as at the 27 Sep update · next update Sun 4 Oct')
  })

  it('5 Oct, once October has a row: still September, with October one click away', () => {
    const v = readingViewFrom({
      now: '2026-10-05T06:00:00.000Z', runs: [...SEALAND_RUNS, ...SUNDAYS.slice(0, 2)],
      denominators: [...SEALAND_ROWS, OCTOBER_ROW], schedule: SUNDAY,
    })
    expect(v.reading.month).toBe('2026-09-01')
    expect(v.other).toEqual({ month: '2026-10-01', isDefault: false })
  })

  it('?month= names the month read, and the other month is the default, linked with no parameter', () => {
    const v = readingViewFrom({
      now: '2026-10-05T06:00:00.000Z', runs: [...SEALAND_RUNS, ...SUNDAYS.slice(0, 2)],
      denominators: [...SEALAND_ROWS, OCTOBER_ROW], schedule: SUNDAY, explicit: '2026-10',
    })
    expect(v.reading.month).toBe('2026-10-01')
    expect(v.reading.reason).toBe('explicit')
    expect(v.other).toEqual({ month: '2026-09-01', isDefault: true })
  })

  it('a ?month= with no row is not honoured, and offers nothing extra', () => {
    const v = readingViewFrom({
      now: '2026-10-02T06:00:00.000Z', runs: [...SEALAND_RUNS, SUNDAYS[0]], denominators: SEALAND_ROWS, explicit: '2026-10',
    })
    expect(v.reading.month).toBe('2026-09-01')
    expect(v.reading.reason).not.toBe('explicit')
    expect(v.other).toBeNull()
  })

  it('the client’s own posts are not the market: a month holding only them has no row', () => {
    const v = readingViewFrom({
      now: '2026-10-02T06:00:00.000Z',
      runs: [...SEALAND_RUNS, SUNDAYS[0]],
      denominators: [...SEALAND_ROWS, row('2026-10-01', 'client', 1)],
    })
    expect(v.reading.month).toBe('2026-09-01')
    expect(v.reading.current.videos).toBeNull()
    expect(v.other).toBeNull()
  })

  it('pools the category with the tracked rivals only when a list is handed in', () => {
    const tracked = readingViewFrom({
      now: '2026-09-24T18:00:00.000Z', runs: SEALAND_RUNS, denominators: SEALAND_ROWS, rivalAudiences: [COTOPAXI],
    })
    expect(tracked.reading.current.videos).toBe(655)
    const none = readingViewFrom({
      now: '2026-09-24T18:00:00.000Z', runs: SEALAND_RUNS, denominators: SEALAND_ROWS, rivalAudiences: [],
    })
    expect(none.reading.current.videos).toBe(626)
    const inferred = readingViewFrom({ now: '2026-09-24T18:00:00.000Z', runs: SEALAND_RUNS, denominators: SEALAND_ROWS })
    expect(inferred.reading.current.videos).toBe(655)
  })
})

describe('readingViewFrom: the stored rows decide final and read at setup', () => {
  // Össur's rows (DR F12: category plus Ottobock; the client's own 12 in
  // August, DR Q2), because its months clear the floor: Sealand's frozen months are
  // all under 100 and read "too few" before anything else.
  const OTTOBOCK = 'competitor:Ottobock'
  const OSSUR_RUNS = [run('o1', '2026-04-06'), run('o2', '2026-09-13')]
  const ossur = (july: Partial<ReadingDenominator>, ottobock: Partial<ReadingDenominator> = july) =>
    readingViewFrom({
      now: '2026-10-02T06:00:00.000Z',
      runs: OSSUR_RUNS,
      denominators: [
        row('2026-06-01', 'industry-other', 182, { ...FROZEN, origin: 'back_read' }),
        row('2026-06-01', OTTOBOCK, 34, { ...FROZEN, origin: 'back_read' }),
        row('2026-07-01', 'industry-other', 118, july),
        row('2026-07-01', OTTOBOCK, 10, ottobock),
        row('2026-09-01', 'industry-other', 338),
        row('2026-09-01', OTTOBOCK, 24),
      ],
      explicit: '2026-07',
    })

  it('a month whose market rows are all frozen is final', () => {
    expect(monthWords(ossur(FROZEN).reading)).toBe('July · final')
  })

  it('a month still filling on one market audience is not final', () => {
    expect(ossur(FROZEN, {}).reading.state).toBe('ended')
  })

  it('a month back-read at the one-shot reads "read at setup" (Össur’s June)', () => {
    const v = readingViewFrom({
      now: '2026-10-02T06:00:00.000Z', runs: OSSUR_RUNS, explicit: '2026-06',
      denominators: [
        row('2026-06-01', 'industry-other', 182, { ...FROZEN, origin: 'back_read' }),
        row('2026-06-01', OTTOBOCK, 34, { ...FROZEN, origin: 'back_read' }),
        row('2026-09-01', 'industry-other', 338),
      ],
    })
    expect(monthWords(v.reading)).toBe('June · read at setup')
  })

  it('the client’s own rows never decide a month’s state (August, with its 12 own posts still filling)', () => {
    const v = readingViewFrom({
      now: '2026-10-05T06:00:00.000Z', runs: OSSUR_RUNS, explicit: '2026-08',
      denominators: [
        row('2026-08-01', 'client', 12),
        row('2026-08-01', 'industry-other', 537, FROZEN),
        row('2026-08-01', OTTOBOCK, 48, FROZEN),
        row('2026-09-01', 'industry-other', 338),
      ],
    })
    expect(v.reading.state).toBe('final')
  })
})

describe('readingViewFrom: Össur, paused since 13 Sep', () => {
  // Össur's first run was 6 Apr 2026 and its last 13 Sep (DR); the pooled
  // market is category plus Ottobock, staging's stored rows (DR F12).
  const OTTOBOCK = 'competitor:Ottobock'
  const OSSUR_RUNS = [run('o1', '2026-04-06'), run('o2', '2026-09-13')]
  const OSSUR_ROWS = [
    row('2026-08-01', 'industry-other', 537), row('2026-08-01', OTTOBOCK, 48),
    row('2026-09-01', 'industry-other', 338), row('2026-09-01', OTTOBOCK, 24),
  ]
  it('reads September on 2 Oct, 2 Nov and 7 Dec, "as at the 13 Sep update · updates paused"', () => {
    for (const now of ['2026-10-02T06:00:00.000Z', '2026-11-02T06:00:00.000Z', '2026-12-07T06:00:00.000Z']) {
      const v = readingViewFrom({ now, runs: OSSUR_RUNS, denominators: OSSUR_ROWS, schedule: { report_period: 'paused', report_day: 'sunday' } })
      expect(v.reading.month).toBe('2026-09-01')
      expect(barLine(v.reading)).toBe('as at the 13 Sep update · updates paused')
      expect(monthWords(v.reading)).toBe('September · read to the 13 Sep update · updates paused')
      expect(v.other).toBeNull()
    }
  })
})

describe('updateInstant', () => {
  it('is when the run finished, and its start where no finish was recorded', () => {
    expect(updateInstant({ id: 'a', started_at: '2026-09-30T22:00:00.000Z', completed_at: '2026-10-01T02:30:00.000Z' }))
      .toBe('2026-10-01T02:30:00.000Z')
    expect(updateInstant({ id: 'b', started_at: '2026-09-20T04:00:00.000Z', completed_at: null })).toBe('2026-09-20T04:00:00.000Z')
    expect(updateInstant({ id: 'c', started_at: '2026-09-20T04:00:00.000Z' })).toBe('2026-09-20T04:00:00.000Z')
  })

  it('a run finishing after the clock is not yet an update', () => {
    const v = readingViewFrom({
      now: '2026-09-27T07:00:00.000Z',
      runs: [...SEALAND_RUNS, SUNDAYS[0]],
      denominators: SEALAND_ROWS,
      schedule: SUNDAY,
    })
    expect(barLine(v.reading)).toBe('as at the 24 Sep update · next update Sun 27 Sep')
  })
})
