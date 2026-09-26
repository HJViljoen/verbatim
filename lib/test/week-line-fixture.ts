import { SEALAND_CLIENT_ID } from '../config'
import { changesFromLog } from '../reading/comparability'
import {
  buildWeekLine, pooledMix, WEEK_DEPTH_BANDS, WEEK_LINE_KINDS, weekAgeCutoff, type WeekLineBlock, type WeekPoint, type WeekRead,
} from '../reading/week-line'
import { weekAxis } from '../reading/weeks'
import { WEEK_LINE } from '../week-line-config'
import {
  readFromStaging, SEALAND_NEXT_UPDATE, STAGING_BAND_K, STAGING_BAND_N, STAGING_CHANGES, STAGING_LOOKS_ID, standInSundayRuns,
} from './week-fixture'

// The same-age weekly line as it would print (WP3.13), for the WeekLine rows'
// fixture state and render test.
//
// HYPOTHETICAL DATES, REAL NUMBERS. Production's weeks from 28 Sep are not
// knowable yet (the first is kept on Mon 19 Oct), so staging's four weeks of
// 24 Aug to 14 Sep are RE-DATED to 28 Sep to 19 Oct, read on the production
// schedule's stand-in Sunday updates, as lib/reading/week-line.test.ts does.
// Every count is staging's own (lib/test/week-fixture.ts, decision M's
// measurement): the depth of each week, and k and n per depth band for the
// six kinds and Looks & style. Unchecked admissions are 0, because production's
// count for those weeks is not knowable yet and the relevance fix is live from
// the 27 Sep update. So the pairs read as staging's did:
//   24 → 31 Aug (28 Sep → 5 Oct)   depth, mean ratio 0.69: not read the same way
//   31 Aug → 7 Sep (5 → 12 Oct)    depth, mean ratio 0.74: not read the same way
//   7 → 14 Sep (12 → 19 Oct)       read the same way: praise 61.9 against 61.3,
//                                  "no clear change"
// Looks & style is provisional (decision C): points, no verdict.

const STAGING_WEEKS = ['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14'] as const
/** The weeks the staging weeks stand in for. */
export const WEEK_LINE_FIXTURE_WEEKS = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'] as const
const SUNDAYS = ['2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25', '2026-11-01', '2026-11-08']
const RUNS = standInSundayRuns(SUNDAYS)
/** The clock the fixture is read at: Mon 9 Nov, after the 8 Nov update brought the week of 19 Oct to 14 days. */
export const WEEK_LINE_FIXTURE_NOW = '2026-11-09T09:00:00.000Z'

const reads: WeekRead[] = STAGING_WEEKS.map((stagingWeek, i) => {
  const week = WEEK_LINE_FIXTURE_WEEKS[i]
  const run = RUNS[3 + i]
  return readFromStaging(stagingWeek, {
    week, capturedBefore: weekAgeCutoff(week, 14), readThroughRun: run.id, readThroughAt: run.finishedAt, unchecked: 0,
    computedAt: `${weekAgeCutoff(week, 14).slice(0, 10)}T09:00:00.000Z`,
  })
})

const points: WeekPoint[] = STAGING_WEEKS.flatMap((stagingWeek, i) => [...WEEK_LINE_KINDS, 'looks'].map((kind): WeekPoint => ({
  week: WEEK_LINE_FIXTURE_WEEKS[i],
  ageDays: 14,
  objectKind: kind === 'looks' ? 'subject' : 'kind',
  objectId: kind === 'looks' ? STAGING_LOOKS_ID : kind,
  bands: WEEK_DEPTH_BANDS.map((band, j) => ({ band, k: STAGING_BAND_K[stagingWeek][kind][j], n: STAGING_BAND_N[stagingWeek][j] })),
})))

/** The axis Your market draws on Mon 9 Nov (October ended): the weeks of 31 Aug to 9 Nov. */
export const WEEK_LINE_FIXTURE_AXIS = weekAxis({ month: '2026-10-01' }, WEEK_LINE_FIXTURE_NOW)

/** The line printed on the four weeks, the depth mix fixed on the first pair. */
export const WEEK_LINE_FIXTURE: WeekLineBlock = buildWeekLine(
  reads,
  points,
  changesFromLog(STAGING_CHANGES),
  { ...WEEK_LINE[SEALAND_CLIENT_ID], print: true, mix: pooledMix(reads.slice(0, 2)) },
  {
    objects: [{ objectKind: 'subject', objectId: STAGING_LOOKS_ID, label: 'Looks & style', calibration: 'provisional' }],
    axis: WEEK_LINE_FIXTURE_AXIS,
    nextUpdateAfter: SEALAND_NEXT_UPDATE,
  },
)

/** The line on its first kept week alone (Mon 19 Oct, if it printed then): one point a row, no pair. */
export const WEEK_LINE_FIXTURE_FIRST: WeekLineBlock = buildWeekLine(
  reads.slice(0, 1),
  points.filter((p) => p.week === WEEK_LINE_FIXTURE_WEEKS[0]),
  changesFromLog(STAGING_CHANGES),
  { ...WEEK_LINE[SEALAND_CLIENT_ID], print: true, mix: null },
  { objects: [{ objectKind: 'subject', objectId: STAGING_LOOKS_ID, label: 'Looks & style', calibration: 'provisional' }] },
)

/** The line printed with nothing kept yet: the rows' empty state. */
export const WEEK_LINE_FIXTURE_EMPTY: WeekLineBlock = buildWeekLine([], [], [], { ...WEEK_LINE[SEALAND_CLIENT_ID], print: true })
