import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { barLine, monthWords } from './reading-month'
import {
  asAtOf,
  MONTH_MENU_MAX,
  marketMonths,
  marketRivalAudiences,
  monthlyMonthFor,
  readingViewFrom,
  updateClock,
  updateInstant,
  type DeliveredRun,
  type ReadingDenominator,
} from './reading-view'

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

/** The months before September the market has a row for, newest first, as the
 *  selector offers them: none is the default, so each links with `?month=`. */
const EARLIER = ['2026-08-01', '2026-07-01', '2026-06-01', '2026-05-01', '2026-04-01'].map((month) => ({ month, isDefault: false }))

// THE SELECTOR ALWAYS STEPS BACK (default M-d, 26 Sep). It offered one other
// month, and on 1 to 3 Oct, before October has a row, none at all; it now
// offers every month the market has a row for, newest first. Which month is
// READ is decision A's rule, and every clock below reads the month it read
// before: only the offer changed.
describe('readingViewFrom: which month, and the other months the selector offers', () => {
  it('24 Sep: September so far leads, and August, July and the months before are one click back', () => {
    const v = readingViewFrom({ now: '2026-09-24T18:00:00.000Z', runs: SEALAND_RUNS, denominators: SEALAND_ROWS, schedule: SUNDAY })
    expect(v.reading.month).toBe('2026-09-01')
    expect(v.reading.state).toBe('so_far')
    expect(v.others).toEqual(EARLIER)
    expect(barLine(v.reading)).toBe('as at the 24 Sep update · next update Sun 27 Sep')
  })

  it('2 Oct, before any October row: September, ended, and still August, July and the months before one click back', () => {
    const v = readingViewFrom({
      now: '2026-10-02T06:00:00.000Z', runs: [...SEALAND_RUNS, SUNDAYS[0]], denominators: SEALAND_ROWS, schedule: SUNDAY,
    })
    expect(v.reading.month).toBe('2026-09-01')
    expect(v.reading.state).toBe('ended')
    expect(v.reading.reason).toBe('current_thin')
    // WP1.2 offered nothing here (October has no row until the 4 Oct update).
    expect(v.others).toEqual(EARLIER)
    expect(barLine(v.reading)).toBe('as at the 27 Sep update · next update Sun 4 Oct')
  })

  it('5 Oct, once October has a row: still September, with October and every earlier month one click away', () => {
    const v = readingViewFrom({
      now: '2026-10-05T06:00:00.000Z', runs: [...SEALAND_RUNS, ...SUNDAYS.slice(0, 2)],
      denominators: [...SEALAND_ROWS, OCTOBER_ROW], schedule: SUNDAY,
    })
    expect(v.reading.month).toBe('2026-09-01')
    expect(v.others).toEqual([{ month: '2026-10-01', isDefault: false }, ...EARLIER])
  })

  it('?month= names the month read, and the default is offered first among the rest, linked with no parameter', () => {
    const v = readingViewFrom({
      now: '2026-10-05T06:00:00.000Z', runs: [...SEALAND_RUNS, ...SUNDAYS.slice(0, 2)],
      denominators: [...SEALAND_ROWS, OCTOBER_ROW], schedule: SUNDAY, explicit: '2026-10',
    })
    expect(v.reading.month).toBe('2026-10-01')
    expect(v.reading.reason).toBe('explicit')
    expect(v.others).toEqual([{ month: '2026-09-01', isDefault: true }, ...EARLIER])
  })

  it('a ?month= naming an earlier month reads it, and every other month stays in the selector', () => {
    const v = readingViewFrom({
      now: '2026-10-02T06:00:00.000Z', runs: [...SEALAND_RUNS, SUNDAYS[0]], denominators: SEALAND_ROWS, schedule: SUNDAY, explicit: '2026-07',
    })
    expect(v.reading.month).toBe('2026-07-01')
    expect(v.others).toEqual([
      { month: '2026-09-01', isDefault: true }, ...EARLIER.filter((o) => o.month !== '2026-07-01'),
    ])
  })

  it('a ?month= naming the default month offers what the default offers', () => {
    const v = readingViewFrom({
      now: '2026-10-05T06:00:00.000Z', runs: [...SEALAND_RUNS, ...SUNDAYS.slice(0, 2)],
      denominators: [...SEALAND_ROWS, OCTOBER_ROW], schedule: SUNDAY, explicit: '2026-09',
    })
    expect(v.reading.month).toBe('2026-09-01')
    expect(v.others).toEqual([{ month: '2026-10-01', isDefault: false }, ...EARLIER])
  })

  it('a ?month= with no row is not honoured, and offers no month without one', () => {
    const v = readingViewFrom({
      now: '2026-10-02T06:00:00.000Z', runs: [...SEALAND_RUNS, SUNDAYS[0]], denominators: SEALAND_ROWS, explicit: '2026-10',
    })
    expect(v.reading.month).toBe('2026-09-01')
    expect(v.reading.reason).not.toBe('explicit')
    expect(v.others).toEqual(EARLIER)
  })

  it('never offers a month after the clock (a staging clock set back behind its rows)', () => {
    const v = readingViewFrom({
      now: '2026-09-24T18:00:00.000Z', runs: SEALAND_RUNS, denominators: [...SEALAND_ROWS, OCTOBER_ROW], schedule: SUNDAY,
    })
    expect(v.reading.month).toBe('2026-09-01')
    expect(v.others).toEqual(EARLIER)
  })

  it('the client’s own posts are not the market: a month holding only them has no row', () => {
    const v = readingViewFrom({
      now: '2026-10-02T06:00:00.000Z',
      runs: [...SEALAND_RUNS, SUNDAYS[0]],
      denominators: [...SEALAND_ROWS, row('2026-10-01', 'client', 1)],
    })
    expect(v.reading.month).toBe('2026-09-01')
    expect(v.reading.current.videos).toBeNull()
    expect(v.others).toEqual(EARLIER)
  })

  it('holds a year at most, the default kept: Össur’s back-read reaches six years', () => {
    // A SHAPE, NOT A MEASUREMENT: seventy-two months of rows, each carrying
    // Össur's September category count as a stand-in; nothing below turns on
    // a size beyond "has a row".
    const months: string[] = []
    for (let y = 2020, m = 10; months.length < 72; m === 12 ? (y++, (m = 1)) : m++) months.push(`${y}-${String(m).padStart(2, '0')}-01`)
    const rows = months.map((month) => row(month, 'industry-other', 338))
    const runs = [run('o1', '2026-04-06'), run('o2', '2026-09-13')]
    const v = readingViewFrom({ now: '2026-10-02T06:00:00.000Z', runs, denominators: rows })
    expect(v.reading.month).toBe('2026-09-01')
    expect(v.others).toHaveLength(MONTH_MENU_MAX - 1)
    expect(v.others[0]).toEqual({ month: '2026-08-01', isDefault: false })
    expect(v.others[v.others.length - 1].month).toBe('2025-10-01')
    // An old month named in the URL keeps the way back to the default.
    const old = readingViewFrom({ now: '2026-10-02T06:00:00.000Z', runs, denominators: rows, explicit: '2021-03' })
    expect(old.reading.month).toBe('2021-03-01')
    expect(old.others[0]).toEqual({ month: '2026-09-01', isDefault: true })
    expect(old.others).toHaveLength(MONTH_MENU_MAX - 1)
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
  it('reads September on 2 Oct, 2 Nov and 7 Dec, "as at the 13 Sep update · updates paused", with August one click back', () => {
    for (const now of ['2026-10-02T06:00:00.000Z', '2026-11-02T06:00:00.000Z', '2026-12-07T06:00:00.000Z']) {
      const v = readingViewFrom({ now, runs: OSSUR_RUNS, denominators: OSSUR_ROWS, schedule: { report_period: 'paused', report_day: 'sunday' } })
      expect(v.reading.month).toBe('2026-09-01')
      expect(barLine(v.reading)).toBe('as at the 13 Sep update · updates paused')
      expect(monthWords(v.reading)).toBe('September · read to the 13 Sep update · updates paused')
      expect(v.others).toEqual([{ month: '2026-08-01', isDefault: false }])
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

describe('asAtOf', () => {
  it('agrees with the reading month’s "as at" on every clock, and is never the clock', () => {
    const runs = [...SEALAND_RUNS, ...SUNDAYS]
    for (const now of ['2026-09-24T18:00:00.000Z', '2026-09-27T07:00:00.000Z', '2026-10-02T06:00:00.000Z', '2026-10-11T12:00:00.000Z']) {
      const v = readingViewFrom({ now, runs, denominators: SEALAND_ROWS })
      expect(asAtOf(runs, now)).toBe(v.reading.asAt)
      expect(asAtOf(runs, now)).not.toBe(now)
    }
    expect(asAtOf(runs, '2026-06-01T00:00:00.000Z')).toBeNull()
  })
})

describe('monthlyMonthFor: the monthly reads the month that has just ended', () => {
  it('a monthly built at a 4 Oct clock is September’s, not October’s', () => {
    expect(monthlyMonthFor('2026-10-04T08:30:00.000Z', [...SEALAND_ROWS, OCTOBER_ROW])).toBe('2026-09')
  })

  it('on 12 Oct, the day it is sent, it is still September', () => {
    expect(monthlyMonthFor('2026-10-12T09:00:00.000Z', [...SEALAND_ROWS, OCTOBER_ROW])).toBe('2026-09')
  })

  it('a month the caller names wins', () => {
    expect(monthlyMonthFor('2026-10-04T08:30:00.000Z', SEALAND_ROWS, '2026-08')).toBe('2026-08')
    expect(monthlyMonthFor('2026-10-04T08:30:00.000Z', SEALAND_ROWS, 'not a month')).toBe('2026-09')
  })

  it('a month holding only the client’s own posts is not a month with rows', () => {
    expect(marketMonths([row('2026-10-01', 'client', 1), ...SEALAND_ROWS]))
      .toEqual(['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'])
  })
})

describe('updateClock: This week’s "next update", from its own two runs', () => {
  it('the 20 Sep update, read on 22 Sep: next update Sun 27 Sep', () => {
    const c = updateClock({ now: '2026-09-22T09:00:00.000Z', runs: [run('r5', '2026-09-10'), run('r6', '2026-09-20')], schedule: SUNDAY })
    expect(c).toEqual({ asAt: '2026-09-20T12:00:00.000Z', nextUpdate: '2026-09-27T04:00:00.000Z', paused: false })
  })

  it('Össur, last updated 13 Sep: paused, and no next update promised', () => {
    const c = updateClock({
      now: '2026-10-02T06:00:00.000Z',
      runs: [run('o1', '2026-04-06'), run('o2', '2026-09-13')],
      schedule: { report_period: 'weekly', report_day: 'sunday' },
    })
    expect(c.paused).toBe(true)
    expect(c.nextUpdate).toBeNull()
  })

  it('with no schedule it promises nothing', () => {
    expect(updateClock({ now: '2026-09-22T09:00:00.000Z', runs: [run('r6', '2026-09-20')] }).nextUpdate).toBeNull()
  })
})

// ONE MARKET FOR EVERY PAGE (WP1.2 review). Overview and Subjects pooled the
// tenant's rivals, Voice and Competitive their own copy of the same list, and
// Market, the Reports card and the monthly inferred every rival audience with a
// row, so a stopped rival's rows counted on three pages and not on four.
describe('marketRivalAudiences: the one market every loader pools', () => {
  // Cotopaxi is tracked; Poler was stopped on 9 Sep (lib/rivals.ts: "Poler not
  // observed · tracked to 9 Sep 2026"). Poler's October row is a SHAPE, not a
  // measurement: it carries Cotopaxi's September count as a stand-in, and
  // nothing below turns on its size beyond "has a row".
  const POLER = 'competitor:Poler'
  const RIVALS = [
    { name: 'Cotopaxi', retiredAt: null },
    { name: 'Poler', retiredAt: '2026-09-09T00:00:00.000Z' },
  ]
  const ROWS = [...SEALAND_ROWS, row('2026-10-01', POLER, 29)]
  const at = {
    now: '2026-10-05T06:00:00.000Z',
    runs: [...SEALAND_RUNS, ...SUNDAYS.slice(0, 2)],
    denominators: ROWS,
    schedule: SUNDAY,
  }

  it('is the tracked rivals, never a stopped one', () => {
    expect(marketRivalAudiences(RIVALS)).toEqual([COTOPAXI])
  })

  it('Overview, Market, the Reports card and the monthly read one month on rows that include a stopped rival', () => {
    const list = marketRivalAudiences(RIVALS)
    const view = readingViewFrom({ ...at, rivalAudiences: list })
    expect(view.reading.month).toBe('2026-09-01')
    // A stopped rival's October row is not a market month: no page offers it.
    expect(view.others.map((o) => o.month)).not.toContain('2026-10-01')
    expect(marketMonths(ROWS, list)).not.toContain('2026-10-01')
    expect(monthlyMonthFor(at.now, ROWS, null, list)).toBe(view.reading.month.slice(0, 7))
    // What the three inferring loaders drew before: October offered on a
    // stopped rival's row alone.
    expect(readingViewFrom(at).others[0]).toEqual({ month: '2026-10-01', isDefault: false })
  })

  // THE SWEEP. Every loader that decides the reading month hands in the one
  // list; a call that omits it infers, and pools a different market.
  it('every page loader hands the view its rivals through the one rule', () => {
    const dir = join(__dirname, '..', 'pages')
    const calls: string[] = []
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const src = readFileSync(join(dir, file), 'utf8')
      for (const m of src.matchAll(/readingViewFrom\(\{[\s\S]*?\}\)/g)) {
        calls.push(file)
        expect(m[0], file).toMatch(/rivalAudiences/)
        expect(src, file).toMatch(/marketRivalAudiences\(|loadMarketRivalAudiences\(/)
      }
      for (const m of src.matchAll(/monthlyMonthFor\(([^)]*)\)/g)) {
        calls.push(file)
        expect(m[1].split(',').length, file).toBe(4)
      }
    }
    expect([...new Set(calls)].sort()).toEqual([
      'competitive-surface.ts', 'market-surface.ts', 'monthly.ts', 'overview.ts', 'reports-card.ts', 'subjects.ts', 'voice-surface.ts',
    ])
  })
})

