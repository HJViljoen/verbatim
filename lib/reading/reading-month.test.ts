import { describe, expect, it } from 'vitest'

import { freezeBoundary } from './monthly'
import {
  barLine,
  closedMonthFor,
  daysInMonth,
  MONTH_PARAM,
  monthStateOf,
  monthWords,
  parseMonthParam,
  PAUSED_AFTER_DAYS,
  READING_SWITCH_FRACTION,
  readingAnchor,
  readingMonthFor,
  scheduledUpdateAfter,
  windowEnd,
  type ReadingMonth,
} from './reading-month'

// ---- Fixtures: real calendars, real counts ---------------------------------------
//
// SEALAND'S UPDATES. The past ones are the research's (DR F21): completed runs
// on 28 Jun and 9 Jul, 17 Aug, 9 Sep and the 10 Sep "monthly" run, a partial
// run on 20 Sep, and the 24 Sep update the plan's bar names (§2.2 block 0).
// The failed 15 Sep run is not an update. The research gives the days, not the
// finish times, so each past update is stamped 12:00 UTC on its day; nothing
// below turns on the hour. From 27 Sep the updates are the schedule's: Sunday
// 06:00 SAST, about 4.5 h (plan §3.0), so finished at 08:30 UTC.
const SEALAND_PAST = [
  '2026-06-28T12:00:00.000Z',
  '2026-07-09T12:00:00.000Z',
  '2026-08-17T12:00:00.000Z',
  '2026-09-09T12:00:00.000Z',
  '2026-09-10T12:00:00.000Z',
  '2026-09-20T12:00:00.000Z',
  '2026-09-24T12:00:00.000Z',
]
function sundayUpdates(from: string, to: string): string[] {
  const out: string[] = []
  for (let t = Date.parse(`${from}T08:30:00.000Z`); t <= Date.parse(`${to}T08:30:00.000Z`); t += 7 * 86_400_000) {
    out.push(new Date(t).toISOString())
  }
  return out
}
const SEALAND_UPDATES = [...SEALAND_PAST, ...sundayUpdates('2026-09-27', '2027-01-03')]

// SEALAND'S POOLED MARKET (decision E: the category plus the videos filed under
// a tracked brand, the client's own posts left out). Apr–Jul are the frozen
// stored rows, category plus Cotopaxi (DR F11: 4+1, 8+3, 45+5, 35+1); they
// froze before the staging copy was taken, so production holds the same.
// August 377 and September 655 are production's, to 24 Sep (decision E).
// October and November are NOT KNOWABLE today: the later clocks need those
// months to have a row, so they carry September's 655 as a stand-in. Nothing
// here turns on their size beyond "has a row" and "clears 100".
const SEALAND_TO_SEP = new Map<string, number>([
  ['2026-04-01', 5],
  ['2026-05-01', 11],
  ['2026-06-01', 50],
  ['2026-07-01', 36],
  ['2026-08-01', 377],
  ['2026-09-01', 655],
])
const STAND_IN = 655
const SEALAND_LATER = new Map<string, number>([
  ...SEALAND_TO_SEP,
  ['2026-10-01', STAND_IN],
  ['2026-11-01', STAND_IN],
])

const SEALAND_SCHEDULE = scheduledUpdateAfter({ report_period: 'weekly', report_day: 'sunday' })

function sealandAt(now: string, over: Partial<Parameters<typeof readingMonthFor>[0]> = {}): ReadingMonth {
  return readingMonthFor({
    now,
    updates: SEALAND_UPDATES,
    videosByMonth: SEALAND_LATER,
    firstRunMonth: '2026-06-01',
    nextUpdateAfter: SEALAND_SCHEDULE,
    ...over,
  })
}

// ÖSSUR, PAUSED. Its first run ever was 6 Apr 2026 and its last 13 Sep (DR,
// "Össur's comments end on 13 Sep"; bands.ts thinMonth). The research names no
// run between them, and none is needed: every clock below is after 13 Sep.
// Pooled market, category plus Ottobock, staging's stored rows (DR F12):
// Apr 41+2, May 13+12, Jun 182+34, Jul 118+10, Aug 537+48, Sep (1–13) 338+24.
const OSSUR_UPDATES = ['2026-04-06T12:00:00.000Z', '2026-09-13T12:00:00.000Z']
const OSSUR = new Map<string, number>([
  ['2026-04-01', 43],
  ['2026-05-01', 25],
  ['2026-06-01', 216],
  ['2026-07-01', 128],
  ['2026-08-01', 585],
  ['2026-09-01', 362],
])
function ossurAt(now: string): ReadingMonth {
  return readingMonthFor({
    now,
    updates: OSSUR_UPDATES,
    videosByMonth: OSSUR,
    firstRunMonth: '2026-04-01',
    nextUpdateAfter: scheduledUpdateAfter({ report_period: 'paused', report_day: 'sunday' }),
  })
}

// ---- Sealand's calendar (WP1.2's pins; plan §2 "Every reading page follows one reading month") ----

describe('readingMonthFor: Sealand through the trial and after', () => {
  it('24 Sep: September so far, read to the 24 Sep update', () => {
    const r = sealandAt('2026-09-24T18:00:00.000Z')
    expect(r.month).toBe('2026-09-01')
    expect(r.state).toBe('so_far')
    expect(r.reason).toBe('current_readable')
    expect(r.leadsWithCurrent).toBe(true)
    // 9, 10, 20 and 24 Sep; the failed 15 Sep run is not in the list.
    expect(r.current).toEqual({ month: '2026-09-01', updates: 4, videos: 655, daysIn: 24 })
    expect(r.asAt).toBe('2026-09-24T12:00:00.000Z')
    expect(r.nextUpdate).toBe('2026-09-27T04:00:00.000Z')
  })

  it('1 Oct 02:00 SAST: September, ended, read to the 27 Sep update (October has no update yet)', () => {
    const r = sealandAt('2026-10-01T00:00:00.000Z')
    expect(r.month).toBe('2026-09-01')
    expect(r.state).toBe('ended')
    expect(r.reason).toBe('current_thin')
    expect(r.current.updates).toBe(0)
    expect(r.readTo).toBe('2026-09-27T08:30:00.000Z')
    expect(r.readToEnd).toBe(false)
    expect(r.leadsWithCurrent).toBe(false)
  })

  it('4 Oct: September, read to the 4 Oct update, and now read past its end', () => {
    const r = sealandAt('2026-10-04T12:00:00.000Z')
    expect(r.month).toBe('2026-09-01')
    expect(r.state).toBe('ended')
    expect(r.readTo).toBe('2026-10-04T08:30:00.000Z')
    expect(r.readToEnd).toBe(true)
    expect(r.reason).toBe('current_thin')
  })

  it('11 Oct: still September, because day 11 of 31 is under half although October has two updates', () => {
    const r = sealandAt('2026-10-11T12:00:00.000Z')
    expect(r.month).toBe('2026-09-01')
    expect(r.reason).toBe('current_early')
    expect(r.current.updates).toBe(2)
    expect(r.readTo).toBe('2026-10-11T08:30:00.000Z')
  })

  it('15 Oct is still September; 16 Oct is October so far', () => {
    expect(sealandAt('2026-10-15T12:00:00.000Z').month).toBe('2026-09-01')
    const r = sealandAt('2026-10-16T12:00:00.000Z')
    expect(r.month).toBe('2026-10-01')
    expect(r.state).toBe('so_far')
    expect(r.reason).toBe('current_readable')
    expect(r.current.updates).toBe(2)
  })

  it('a third instead of a half switches to October on 11 Oct, and changes nothing else', () => {
    const third = sealandAt('2026-10-11T12:00:00.000Z', { switchFraction: 1 / 3 })
    expect(third.month).toBe('2026-10-01')
    expect(third.state).toBe('so_far')
    expect(READING_SWITCH_FRACTION).toBe(0.5)
  })

  it('1 Nov: October, ended, and September final (the 1 Nov run is the first past its freeze line)', () => {
    const r = sealandAt('2026-11-01T12:00:00.000Z')
    expect(r.month).toBe('2026-10-01')
    expect(r.state).toBe('ended')
    expect(r.readTo).toBe('2026-11-01T08:30:00.000Z')
    expect(r.settles).toEqual({ boundary: '2026-12-01T00:00:00.000Z', withUpdateOn: '2026-12-06T04:00:00.000Z' })

    const sep = sealandAt('2026-11-01T12:00:00.000Z', { explicit: '2026-09' })
    expect(sep.month).toBe('2026-09-01')
    expect(sep.reason).toBe('explicit')
    expect(sep.state).toBe('final')
    expect(sep.settles).toBeNull()
    expect(sep.readTo).toBe('2026-11-01T08:30:00.000Z')
  })

  it('16 Nov: November so far; 2 Dec: November, ended, settling with the 3 Jan update', () => {
    expect(sealandAt('2026-11-16T12:00:00.000Z').month).toBe('2026-11-01')
    const r = sealandAt('2026-12-02T12:00:00.000Z')
    expect(r.month).toBe('2026-11-01')
    expect(r.state).toBe('ended')
    expect(r.readTo).toBe('2026-11-29T08:30:00.000Z')
    expect(r.settles?.withUpdateOn).toBe('2027-01-03T04:00:00.000Z')
  })

  it('reads the latest month with rows when the one before is missing', () => {
    const withoutSep = new Map(SEALAND_TO_SEP)
    withoutSep.delete('2026-09-01')
    const r = sealandAt('2026-10-05T12:00:00.000Z', { videosByMonth: withoutSep })
    expect(r.month).toBe('2026-08-01')
    expect(r.reason).toBe('latest_with_rows')
    // August's freeze line was 1 Oct 00:00 UTC and the 4 Oct update is the run that froze it.
    expect(r.state).toBe('final')
  })

  it('a thin current month falls back even with two updates and past half (Össur, May)', () => {
    // Össur's May, 25 videos, against its only earlier gathered month, April's
    // 43: 25 < 0.6 × 43. The research names no Össur run in May, so the two May
    // updates here are stand-ins; the counts are real.
    const r = readingMonthFor({
      now: '2026-05-31T12:00:00.000Z',
      updates: ['2026-04-06T12:00:00.000Z', '2026-05-10T12:00:00.000Z', '2026-05-24T12:00:00.000Z'],
      videosByMonth: new Map([['2026-04-01', 43], ['2026-05-01', 25]]),
      firstRunMonth: '2026-04-01',
    })
    expect(r.current.updates).toBe(2)
    expect(r.month).toBe('2026-04-01')
    expect(r.reason).toBe('current_thin')
  })

  it('reads the current month when nothing before it has a row', () => {
    const r = readingMonthFor({
      now: '2026-06-05T12:00:00.000Z',
      updates: [],
      videosByMonth: new Map(),
      firstRunMonth: '2026-06-01',
    })
    expect(r.month).toBe('2026-06-01')
    expect(r.reason).toBe('no_month')
    expect(r.asAt).toBeNull()
    expect(barLine(r)).toBe('no update yet')
  })
})

describe('readingMonthFor: Össur, paused, reads September on every date (plan §2.13)', () => {
  it.each([
    ['2026-10-02T12:00:00.000Z', 'current_thin'],
    ['2026-11-02T12:00:00.000Z', 'latest_with_rows'],
    ['2026-12-07T12:00:00.000Z', 'latest_with_rows'],
  ])('%s', (now, reason) => {
    const r = ossurAt(now)
    expect(r.month).toBe('2026-09-01')
    expect(r.reason).toBe(reason)
    expect(r.paused).toBe(true)
    expect(r.nextUpdate).toBeNull()
    expect(r.readTo).toBe('2026-09-13T12:00:00.000Z')
    expect(r.readToEnd).toBe(false)
    // Past September's freeze line on 2 Nov and 7 Dec, but no run froze it:
    // the clock passing a line is not the run that freezes the month.
    expect(r.state).toBe('ended')
    expect(barLine(r)).toBe('as at the 13 Sep update · updates paused')
    expect(monthWords(r)).toBe('September · read to the 13 Sep update · updates paused')
    expect(windowEnd(r)).toBe('2026-09-13T12:00:00.000Z')
  })

  it('paused wins over a schedule: no next update is promised', () => {
    const r = readingMonthFor({
      now: '2026-10-02T12:00:00.000Z',
      updates: OSSUR_UPDATES,
      videosByMonth: OSSUR,
      firstRunMonth: '2026-04-01',
      nextUpdateAfter: SEALAND_SCHEDULE,
    })
    expect(r.paused).toBe(true)
    expect(r.nextUpdate).toBeNull()
  })

  it('pauses only after more than fourteen days with no update', () => {
    expect(PAUSED_AFTER_DAYS).toBe(14)
    expect(ossurAt('2026-09-27T12:00:00.000Z').paused).toBe(false)
    expect(ossurAt('2026-09-27T12:00:01.000Z').paused).toBe(true)
  })
})

describe('readingMonthFor: the stored row wins over the derived one', () => {
  it('Össur’s June, back-read at the one-shot, reads "read at setup", not "final"', () => {
    // Össur's first run was 6 Apr, so June is after it, and the 13 Sep update
    // finished past June's freeze line: derived alone, June reads final. The
    // stored row says what June is: 216 market videos, back-read (DR F12).
    const at = { now: '2026-10-02T12:00:00.000Z', updates: OSSUR_UPDATES, videosByMonth: OSSUR, firstRunMonth: '2026-04-01', explicit: '2026-06' }
    expect(readingMonthFor(at).state).toBe('final')
    const r = readingMonthFor({ ...at, rows: new Map([['2026-06-01', { status: 'frozen' as const, origin: 'back_read' as const }]]) })
    expect(r.month).toBe('2026-06-01')
    expect(r.state).toBe('read_at_setup')
    expect(r.settles).toBeNull()
    expect(monthWords(r)).toBe('June · read at setup')
  })

  it('a run that finished past the freeze line without reaching freeze-months froze nothing', () => {
    // If the 4 Oct run had stopped before freeze-months, August's row would
    // still be filling on 5 Oct, although an update finished past its line.
    const at = '2026-10-05T12:00:00.000Z'
    expect(sealandAt(at, { explicit: '2026-08' }).state).toBe('final')
    const r = sealandAt(at, { explicit: '2026-08', rows: new Map([['2026-08-01', { status: 'filling' as const, origin: 'live' as const }]]) })
    expect(r.state).toBe('ended')
    expect(r.settles?.boundary).toBe('2026-10-01T00:00:00.000Z')
  })

  it('a month the rows do not name is derived as before', () => {
    const r = sealandAt('2026-10-11T12:00:00.000Z', { rows: new Map([['2026-06-01', { status: 'frozen' as const, origin: 'back_read' as const }]]) })
    expect(r.month).toBe('2026-09-01')
    expect(r.state).toBe('ended')
  })
})

// ---- "As at" and the windows: the last update, never the clock ----------------------

describe('as at is the last update, never the clock', () => {
  it('names the latest update on or before now, and ignores later ones', () => {
    const r = sealandAt('2026-09-30T23:00:00.000Z')
    expect(r.asAt).toBe('2026-09-27T08:30:00.000Z')
    expect(r.asAt).not.toBe('2026-09-30T23:00:00.000Z')
  })

  it('keeps promising an update that is running now, and moves on once it is a day overdue', () => {
    // 4 Oct 09:00 SAST: the Sunday run started at 06:00 and has not finished.
    const running = sealandAt('2026-10-04T07:00:00.000Z')
    expect(running.asAt).toBe('2026-09-27T08:30:00.000Z')
    expect(running.nextUpdate).toBe('2026-10-04T04:00:00.000Z')
    // The 4 Oct run failed: on Tuesday the bar names the 11 Oct slot, not a past one.
    const failed = sealandAt('2026-10-06T12:00:00.000Z', {
      updates: SEALAND_UPDATES.filter((u) => !u.startsWith('2026-10-04')),
    })
    expect(failed.asAt).toBe('2026-09-27T08:30:00.000Z')
    expect(failed.nextUpdate).toBe('2026-10-11T04:00:00.000Z')
  })
})

describe('windowEnd', () => {
  it('ends a ninety-day window at the reading month’s end once it has ended', () => {
    expect(windowEnd(sealandAt('2026-10-11T12:00:00.000Z'))).toBe('2026-10-01T00:00:00.000Z')
  })

  it('ends it at the last update inside a month so far', () => {
    expect(windowEnd(sealandAt('2026-09-24T18:00:00.000Z'))).toBe('2026-09-24T12:00:00.000Z')
  })

  it('with no update at all, ends at the month’s end', () => {
    const r = readingMonthFor({ now: '2026-06-05T12:00:00.000Z', updates: [], videosByMonth: new Map(), firstRunMonth: '2026-06-01' })
    expect(windowEnd(r)).toBe('2026-07-01T00:00:00.000Z')
  })
})

describe('readingAnchor', () => {
  it('is noon on the reading month’s first day', () => {
    expect(readingAnchor(sealandAt('2026-10-11T12:00:00.000Z'))).toBe('2026-09-01T12:00:00.000Z')
  })
})

// ---- The bar's one line and the selector's words (25 Sep rulings) --------------------

describe('barLine', () => {
  it('pins the three lines the plan prints', () => {
    expect(barLine(sealandAt('2026-09-24T18:00:00.000Z'))).toBe('as at the 24 Sep update · next update Sun 27 Sep')
    expect(barLine(sealandAt('2026-10-01T00:00:00.000Z'))).toBe('as at the 27 Sep update · next update Sun 4 Oct')
    expect(barLine(sealandAt('2026-10-04T12:00:00.000Z'))).toBe('as at the 4 Oct update · next update Sun 11 Oct')
    expect(barLine(sealandAt('2026-10-11T12:00:00.000Z'))).toBe('as at the 11 Oct update · next update Sun 18 Oct')
    expect(barLine(ossurAt('2026-10-02T12:00:00.000Z'))).toBe('as at the 13 Sep update · updates paused')
  })

  it('never carries the month’s state, a soundness word, an em dash or "complete"', () => {
    const clocks = [
      '2026-09-24T18:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-10-11T12:00:00.000Z',
      '2026-10-16T12:00:00.000Z', '2026-11-01T12:00:00.000Z', '2026-12-02T12:00:00.000Z',
    ]
    const lines = [...clocks.map((c) => barLine(sealandAt(c))), ...clocks.map((c) => barLine(ossurAt(c)))]
    for (const line of lines) {
      expect(line).not.toContain('so far, ')
      expect(line).not.toContain('still filling')
      expect(line).not.toContain('—')
      expect(line.toLowerCase()).not.toContain('how sound')
      expect(line.toLowerCase()).not.toContain('complete')
    }
  })

  it('says only "as at" when no schedule was handed in', () => {
    expect(barLine(sealandAt('2026-09-24T18:00:00.000Z', { nextUpdateAfter: undefined }))).toBe('as at the 24 Sep update')
  })
})

describe('monthWords', () => {
  it('pins the selector tooltip for each state the plan names', () => {
    expect(monthWords(sealandAt('2026-10-11T12:00:00.000Z')))
      .toBe('September · ended · read to the 11 Oct update · still filling until the 1 Nov update')
    expect(monthWords(sealandAt('2026-10-01T00:00:00.000Z')))
      .toBe('September · ended · read to the 27 Sep update · still filling until the 1 Nov update')
    expect(monthWords(sealandAt('2026-10-16T12:00:00.000Z'))).toBe('October so far · 16 days · 2 updates')
    expect(monthWords(sealandAt('2026-11-01T12:00:00.000Z')))
      .toBe('October · ended · read to the 1 Nov update · still filling until the 6 Dec update')
    expect(monthWords(sealandAt('2026-11-01T12:00:00.000Z', { explicit: '2026-09' }))).toBe('September · final')
  })

  it('names a small month by its count, and one day and one update in the singular', () => {
    // Sealand's July: 35 category videos plus one filed under Cotopaxi (DR F11).
    const july = sealandAt('2026-09-24T18:00:00.000Z', { explicit: '2026-07' })
    expect(july.state).toBe('too_few')
    expect(monthWords(july, 36)).toBe('July · 36 videos · too few to read')
    expect(monthWords(july)).toBe('July · too few to read')
    const first = sealandAt('2026-10-01T12:00:00.000Z', { switchFraction: 0, videosByMonth: SEALAND_TO_SEP })
    expect(first.current.updates).toBe(0)
    // Day 1 of October, with a zero switch fraction, still does not lead: it has no update.
    expect(first.month).toBe('2026-09-01')
  })

  it('never uses the word "complete"', () => {
    const clocks = ['2026-09-24T18:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-10-16T12:00:00.000Z', '2026-11-01T12:00:00.000Z']
    for (const c of clocks) expect(monthWords(sealandAt(c)).toLowerCase()).not.toContain('complete')
  })
})

// ---- The month's state -------------------------------------------------------------------

describe('monthStateOf', () => {
  it('a month in progress is so far, whatever its row says', () => {
    expect(monthStateOf('2026-09-01', '2026-09-24T18:00:00.000Z', { status: 'filling', origin: 'live', videos: 655 })).toBe('so_far')
  })

  it('under 100 market videos, settled, is too few, ahead of read at setup', () => {
    // Sealand's July: back-read at the one-shot, frozen, 36 market videos.
    expect(monthStateOf('2026-07-01', '2026-09-24T18:00:00.000Z', { status: 'frozen', origin: 'back_read', videos: 36 })).toBe('too_few')
  })

  it('a small month still being read towards its end is not yet too few', () => {
    expect(monthStateOf('2026-07-01', '2026-08-01T00:00:00.000Z', { status: 'filling', origin: 'live', videos: 36 }, false)).toBe('ended')
    expect(monthStateOf('2026-07-01', '2026-08-01T00:00:00.000Z', { status: 'filling', origin: 'live', videos: 36 }, true)).toBe('too_few')
  })

  it('a back-read month is read at setup; a frozen live month is final; else ended', () => {
    // Össur's June: 216 market videos, back-read (DR F12).
    expect(monthStateOf('2026-06-01', '2026-09-24T18:00:00.000Z', { status: 'frozen', origin: 'back_read', videos: 216 })).toBe('read_at_setup')
    expect(monthStateOf('2026-08-01', '2026-10-05T00:00:00.000Z', { status: 'frozen', origin: 'live', videos: 377 })).toBe('final')
    expect(monthStateOf('2026-08-01', '2026-09-24T18:00:00.000Z', { status: 'filling', origin: 'live', videos: 377 })).toBe('ended')
  })

  it('without a row it never claims final, even past the freeze line', () => {
    expect(monthStateOf('2026-08-01', '2026-12-01T00:00:00.000Z')).toBe('ended')
  })
})

describe('settles', () => {
  it('is the freeze line and the first scheduled update after it', () => {
    const r = sealandAt('2026-10-11T12:00:00.000Z')
    expect(r.settles?.boundary).toBe(freezeBoundary('2026-09-01'))
    expect(r.settles).toEqual({ boundary: '2026-10-31T00:00:00.000Z', withUpdateOn: '2026-11-01T04:00:00.000Z' })
  })
})

// ---- The schedule, the monthly's month, and the parameter ---------------------------------

describe('scheduledUpdateAfter', () => {
  const sunday = scheduledUpdateAfter({ report_period: 'weekly', report_day: 'sunday' })

  it('Sealand: the next Sunday 06:00 SAST', () => {
    expect(sunday('2026-09-24T12:00:00.000Z')).toBe('2026-09-27T04:00:00.000Z')
    expect(sunday('2026-09-27T03:59:59.000Z')).toBe('2026-09-27T04:00:00.000Z')
  })

  it('is strictly after: from a slot, the next week’s', () => {
    expect(sunday('2026-09-27T04:00:00.000Z')).toBe('2026-10-04T04:00:00.000Z')
  })

  it('monthly: the next 1st at 06:00 SAST, across short months', () => {
    const first = scheduledUpdateAfter({ report_period: 'monthly' })
    expect(first('2026-09-24T12:00:00.000Z')).toBe('2026-10-01T04:00:00.000Z')
    expect(first('2027-01-31T12:00:00.000Z')).toBe('2027-02-01T04:00:00.000Z')
    expect(first('2027-02-01T04:00:00.000Z')).toBe('2027-03-01T04:00:00.000Z')
  })

  it('no cadence, or no date, promises nothing', () => {
    expect(scheduledUpdateAfter({ report_period: 'paused', report_day: 'sunday' })('2026-09-24T12:00:00.000Z')).toBeNull()
    expect(sunday('not a date')).toBeNull()
  })
})

describe('closedMonthFor', () => {
  const rows = ['2026-08-01', '2026-09-01', '2026-10-01']

  it('a monthly built on 4 Oct is September’s, not October’s', () => {
    expect(closedMonthFor('2026-10-04T12:00:00.000Z', rows)).toBe('2026-09-01')
  })

  it('a month has ended at the first instant of the next', () => {
    expect(closedMonthFor('2026-10-01T00:00:00.000Z', rows)).toBe('2026-09-01')
    expect(closedMonthFor('2026-09-30T23:59:59.000Z', rows)).toBe('2026-08-01')
  })

  it('skips an ended month with no rows', () => {
    expect(closedMonthFor('2026-10-04T12:00:00.000Z', ['2026-08-01'])).toBe('2026-08-01')
  })

  it('with no rows at all, the calendar month before', () => {
    expect(closedMonthFor('2026-10-04T12:00:00.000Z', [])).toBe('2026-09-01')
  })
})

describe('the ?month= parameter', () => {
  it('is named once', () => {
    expect(MONTH_PARAM).toBe('month')
  })

  it('accepts a month and nothing looser', () => {
    expect(parseMonthParam('2026-09')).toBe('2026-09-01')
    expect(parseMonthParam('2026-09-01')).toBe('2026-09-01')
    expect(parseMonthParam('2026-09-15')).toBeNull()
    expect(parseMonthParam('2026-13')).toBeNull()
    expect(parseMonthParam('September')).toBeNull()
    expect(parseMonthParam(null)).toBeNull()
  })

  it('is honoured only for a month with a row, no later than the current month', () => {
    const at = '2026-09-24T18:00:00.000Z'
    expect(sealandAt(at, { explicit: '2026-08' }).month).toBe('2026-08-01')
    expect(sealandAt(at, { explicit: '2026-08' }).state).toBe('ended')
    // No March row in the fixture, a month in the future, and a malformed value all read the rule's month.
    expect(sealandAt(at, { explicit: '2026-03' }).reason).toBe('current_readable')
    expect(sealandAt(at, { explicit: '2026-10' }).month).toBe('2026-09-01')
    expect(sealandAt(at, { explicit: '2026-9' }).month).toBe('2026-09-01')
  })
})

describe('daysInMonth', () => {
  it('counts 28 to 31', () => {
    expect(daysInMonth('2026-02-01')).toBe(28)
    expect(daysInMonth('2028-02-01')).toBe(29)
    expect(daysInMonth('2026-09-01')).toBe(30)
    expect(daysInMonth('2026-10-01')).toBe(31)
  })
})
