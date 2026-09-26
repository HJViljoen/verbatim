import { readingMonthFor, scheduledUpdateAfter, type ReadingMonth } from '../reading/reading-month'

// The reading month a fixture carries (market-first WP1.2).
//
// SEALAND'S REAL CALENDAR, NOT AN INVENTED ONE. The updates are the research's
// (DR F21: completed runs on 28 Jun, 9 Jul, 17 Aug, 9 and 10 Sep, a partial
// run on 20 Sep, and the 24 Sep update), each stamped 12:00 UTC because the
// research gives days, not finish times; from 27 Sep the schedule's Sunday
// updates, finished at 08:30 UTC. The pooled market (decision E): September's
// 655 is production's (626 in the category, 29 filed under a tracked brand);
// August's 377 is STAGING's (351 in the category, 22 Cotopaxi, 4 Freitag: DR
// F11; production's August category is 351, its rival-filed count not in the
// research); April to July are the frozen stored rows, category plus Cotopaxi
// (DR F11). OCTOBER IS NOT A MEASUREMENT: it carries September's count as a
// stand-in, because a clock after the 4 Oct run needs October to have a row
// and its size is not knowable today. Only the October clocks read it, only
// the 16 Oct clock turns on its size (it must not be thin against the trailing
// months), and no test prints it. THE 18 OCT, 25 OCT AND 1 NOV UPDATES ARE
// STAND-INS TOO: the schedule's Sunday slots, finished at 08:30 UTC like the
// ones before them, for the clocks once October leads (the change strip,
// default M-e). No test before 16 Oct reads them.

const SEALAND_UPDATES = [
  '2026-06-28T12:00:00.000Z',
  '2026-07-09T12:00:00.000Z',
  '2026-08-17T12:00:00.000Z',
  '2026-09-09T12:00:00.000Z',
  '2026-09-10T12:00:00.000Z',
  '2026-09-20T12:00:00.000Z',
  '2026-09-24T12:00:00.000Z',
  '2026-09-27T08:30:00.000Z',
  '2026-10-04T08:30:00.000Z',
  '2026-10-11T08:30:00.000Z',
  // Stand-ins on the schedule (see above).
  '2026-10-18T08:30:00.000Z',
  '2026-10-25T08:30:00.000Z',
  '2026-11-01T08:30:00.000Z',
]

const SEALAND_MARKET = new Map<string, number>([
  ['2026-04-01', 5],
  ['2026-05-01', 11],
  ['2026-06-01', 50],
  ['2026-07-01', 36],
  ['2026-08-01', 377],
  ['2026-09-01', 655],
  // A stand-in, not a measurement (see above).
  ['2026-10-01', 655],
])

/** Sealand's reading month at `now` (default: the fixtures' 18 Sep clock). */
export function sealandReading(now = '2026-09-18T09:00:00.000Z', explicit: string | null = null): ReadingMonth {
  return readingMonthFor({
    now,
    updates: SEALAND_UPDATES,
    videosByMonth: SEALAND_MARKET,
    firstRunMonth: '2026-06-01',
    explicit,
    nextUpdateAfter: scheduledUpdateAfter({ report_period: 'weekly', report_day: 'sunday' }),
  })
}
