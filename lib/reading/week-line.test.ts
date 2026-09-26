import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { directionRe } from '../test/copy-contract'
import {
  readFromStaging, SEALAND_NEXT_UPDATE, STAGING_AUG31_READINGS, STAGING_BAND_K, STAGING_BAND_N, STAGING_CHANGES,
  STAGING_COMMENTS_BY_CUT, STAGING_LOOKS_ID, STAGING_PRICE_ID, STAGING_PRICE_K, STAGING_RIVALS, STAGING_RUNS,
  STAGING_WEEK_VOLUMES, standInSundayRuns,
} from '../test/week-fixture'
import { WEEK_LINE, weekLineConfigFor, type WeekLineConfig } from '../week-line-config'
import { changesFromLog, type OurChange } from './comparability'
import {
  buildWeekLine, fillGain, firstComparisonDue, keepWeekPoints, pendingWeekLine, pooledMix, pooledWeekPoints,
  standardisedShare, WEEK_AGE_DAYS_DEFAULT, WEEK_DEPTH_BANDS, WEEK_DEPTH_RATIO_MIN, WEEK_FILL_LATE_MAX, WEEK_LINE_EXCLUDED,
  WEEK_LINE_FIRST_WEEK, WEEK_LINE_KINDS, WEEK_READER_UNKNOWN, WEEK_UNCHECKED_MAX, weekAgeCutoff, weekCadence, weekDepthRatios, weekPairOf,
  weekReachesAgeAt, weeksToKeep, type WeekPoint, type WeekRead,
} from './week-line'

// The same-age weekly line (decision M, part 2; WP3.13 part A). Every count is
// staging's (lib/test/week-fixture.ts). Production's weeks from 28 Sep are not
// knowable yet, so where a test needs them it RE-DATES a staging week and says
// so (HYPOTHETICAL), as lib/test/pair-fixture.ts does for months, and runs the
// production schedule's STAND-IN updates (the Sunday slot plus the 20 Sep
// staging run's duration).

const SUNDAYS = ['2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25', '2026-11-01', '2026-11-08']
const PROD_RUNS = standInSundayRuns(SUNDAYS)
const runOn = (day: string): string => `stand-in-${day}`
const SEALAND: WeekLineConfig = WEEK_LINE[SEALAND_CLIENT_ID]
const CHANGES = changesFromLog(STAGING_CHANGES)
const STAGING_WEEKS = ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14']

const kindPoints = (stagingWeek: string, asWeek: string, kind: string): WeekPoint => ({
  week: asWeek, ageDays: 14, objectKind: kind === 'looks' ? 'subject' : 'kind', objectId: kind === 'looks' ? STAGING_LOOKS_ID : kind,
  bands: WEEK_DEPTH_BANDS.map((band, i) => ({ band, k: STAGING_BAND_K[stagingWeek][kind][i], n: STAGING_BAND_N[stagingWeek][i] })),
})

/** HYPOTHETICAL: staging's weeks of 7 and 14 Sep re-dated to 28 Sep and 5 Oct,
 *  read on the production schedule's stand-in updates, with the relevance fix
 *  live (no unchecked admission: production's count for those weeks is not
 *  knowable yet). Every other figure is the staging week's own. */
const SEP28 = readFromStaging('2026-09-07', {
  week: '2026-09-28', capturedBefore: weekAgeCutoff('2026-09-28', 14), readThroughRun: runOn('2026-10-18'),
  readThroughAt: PROD_RUNS[3].finishedAt, unchecked: 0,
})
const OCT05 = readFromStaging('2026-09-14', {
  week: '2026-10-05', capturedBefore: weekAgeCutoff('2026-10-05', 14), readThroughRun: runOn('2026-10-25'),
  readThroughAt: PROD_RUNS[4].finishedAt, unchecked: 0,
})

describe('the constants (§4.2)', () => {
  it('pin the first week, the excluded week, the age and the rule thresholds', () => {
    expect(WEEK_LINE_FIRST_WEEK).toBe('2026-09-28')
    expect(WEEK_LINE_EXCLUDED).toEqual(['2026-09-21'])
    expect(WEEK_AGE_DAYS_DEFAULT).toBe(14)
    expect(WEEK_FILL_LATE_MAX).toBe(0.03)
    expect(WEEK_DEPTH_RATIO_MIN).toBe(0.8)
    expect(WEEK_UNCHECKED_MAX).toBe(0.1)
    expect(WEEK_DEPTH_BANDS).toEqual(['1-4', '5-19', '20+'])
    expect(WEEK_LINE_KINDS).toEqual(['praise', 'question', 'purchase_intent', 'pain_point', 'feature_request', 'objection'])
    expect(SEALAND.firstWeek).toBe(WEEK_LINE_FIRST_WEEK)
  })
})

describe('ages and cutoffs', () => {
  it("weekAgeCutoff('2026-09-28', 14) is 2026-10-19T00:00:00Z", () => {
    expect(weekAgeCutoff('2026-09-28', 14)).toBe('2026-10-19T00:00:00Z')
    expect(weekAgeCutoff('2026-09-28', 21)).toBe('2026-10-26T00:00:00Z')
  })

  it('the week of 28 Sep reaches 14 days at the 18 Oct update and 21 at the 25 Oct; the week of 5 Oct at the 25 Oct and 1 Nov', () => {
    expect(weekReachesAgeAt('2026-09-28', 14, PROD_RUNS)).toBe(runOn('2026-10-18'))
    expect(weekReachesAgeAt('2026-09-28', 21, PROD_RUNS)).toBe(runOn('2026-10-25'))
    expect(weekReachesAgeAt('2026-10-05', 14, PROD_RUNS)).toBe(runOn('2026-10-25'))
    expect(weekReachesAgeAt('2026-10-05', 21, PROD_RUNS)).toBe(runOn('2026-11-01'))
  })

  it("on staging's real runs: the week of 3 Aug reached 14 days with the last of the 17 Aug updates, and the week of 10 Aug never did", () => {
    expect(weekReachesAgeAt('2026-08-03', 14, STAGING_RUNS)).toBe('7df7a420-f370-4f4d-a675-58d954d5454f')
    // Nothing ran between 17 Aug and 9 Sep.
    expect(weekReachesAgeAt('2026-08-10', 14, STAGING_RUNS)).toBeNull()
    // The 15 Sep run failed; the 20 Sep partial update is the age run of the week of 31 Aug.
    expect(weekReachesAgeAt('2026-08-31', 14, STAGING_RUNS)).toBe('b67b56de-17b6-429d-b5f7-e53a3c37f7d4')
  })

  it('a missed update leaves a week with no age run', () => {
    const missed = PROD_RUNS.filter((r) => r.id !== runOn('2026-10-18'))
    expect(weekReachesAgeAt('2026-09-28', 14, missed)).toBeNull()
  })

  it('dates the pending row: due 18 Oct and due 25 Oct, the first comparison with the 25 Oct update', () => {
    const axis = ['2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']
    expect(pendingWeekLine(SEALAND, axis, SEALAND_NEXT_UPDATE)).toEqual({
      state: 'pending', firstWeek: '2026-09-28', ageDays: 14,
      due: [{ week: '2026-09-28', date: '2026-10-18' }, { week: '2026-10-05', date: '2026-10-25' }],
    })
    // Without a schedule, the Sunday before the cutoff: the same dates.
    expect(pendingWeekLine(SEALAND, axis)?.due).toEqual([{ week: '2026-09-28', date: '2026-10-18' }, { week: '2026-10-05', date: '2026-10-25' }])
    expect(firstComparisonDue(SEALAND, SEALAND_NEXT_UPDATE)).toBe('2026-10-25')
    // At 21 days every date moves a week.
    expect(firstComparisonDue({ firstWeek: '2026-09-28', ageDays: 21 }, SEALAND_NEXT_UPDATE)).toBe('2026-11-01')
  })

  it('gives Össur, with no WEEK_LINE entry, no pending row', () => {
    expect(pendingWeekLine(weekLineConfigFor(OSSUR_CLIENT_ID), ['2026-09-28'])).toBeNull()
  })
})

describe('weekCadence', () => {
  it('one completed Sunday update inside the week and in each of the two after is on cadence (stand-ins)', () => {
    expect(weekCadence('2026-09-28', PROD_RUNS)).toEqual({ runsInWeek: 1, runsAfter: [1, 1], lateRun: false, offCadence: 0 })
  })

  it("staging's week of 7 Sep was not: Wednesday and Thursday runs, a failed run, a partial one and one still analysing", () => {
    expect(weekCadence('2026-09-07', STAGING_RUNS)).toEqual({ runsInWeek: 2, runsAfter: [2, 1], lateRun: false, offCadence: 5 })
  })

  it('a run that finishes after the Monday 00:00 UTC that ends its week is late (HYPOTHETICAL finish)', () => {
    const late = PROD_RUNS.map((r) => (r.id === runOn('2026-10-11') ? { ...r, finishedAt: '2026-10-12T01:10:00.000Z' } : r))
    expect(weekCadence('2026-10-05', late)).toMatchObject({ runsInWeek: 1, lateRun: true, offCadence: 1 })
  })
})

describe('weekPairOf', () => {
  it('reads two weeks on one cadence, one search set, the fixed relevance check, one reader and similar depth as the same way', () => {
    expect(weekPairOf(SEP28, OCT05, CHANGES)).toEqual({ mode: 'comparable', reasons: [] })
  })

  it("passes 7→14 Sep's depth (mean 0.88, median 0.95) and refuses 24→31 Aug's (mean 0.69)", () => {
    const d = weekDepthRatios(readFromStaging('2026-09-07'), readFromStaging('2026-09-14'))
    // The plan's text says 0.89 for the mean; staging's full capture reads 17.18 ÷ 19.43 = 0.884. Both pass 0.8.
    expect(d.mean).toBeCloseTo(0.884, 3)
    expect(d.median).toBeCloseTo(0.95, 3)
    const sep = weekPairOf(readFromStaging('2026-09-07'), readFromStaging('2026-09-14'), [])
    expect(sep.reasons.map((r) => r.kind)).not.toContain('depth')
    const aug = weekPairOf(readFromStaging('2026-08-24'), readFromStaging('2026-08-31'), [])
    expect(aug.mode).toBe('refuse')
    // 1,831 ÷ 187 = 9.79 against 3,275 ÷ 229 = 14.30: 0.685 (the plan rounds it to 0.69).
    expect(aug.reasons).toContainEqual({ kind: 'depth', detail: 'mean ratio 0.68, median ratio 0.83' })
  })

  it('refuses 17% unchecked (the week of 14 Sep: 54 of 318)', () => {
    const r = weekPairOf(readFromStaging('2026-09-07'), readFromStaging('2026-09-14'), [])
    expect(r.mode).toBe('refuse')
    // Staging's weeks are before the first week, so they are also excluded from the real line.
    expect(r.reasons).toEqual([
      { kind: 'excluded', detail: 'week of 7 Sep' },
      { kind: 'excluded', detail: 'week of 14 Sep' },
      { kind: 'gate', detail: 'week of 14 Sep: 54 of 318 videos let in unchecked' },
    ])
    // The week of 7 Sep alone (27 of 404, 6.7%) is under the line.
    expect(27 / 404).toBeLessThan(WEEK_UNCHECKED_MAX)
  })

  it('refuses an extra update and a late one', () => {
    expect(weekPairOf(SEP28, { ...OCT05, runsInWeek: 2, offCadence: 1 }, CHANGES).reasons.map((r) => r.kind)).toEqual(['cadence'])
    expect(weekPairOf({ ...SEP28, lateRun: true, offCadence: 1 }, OCT05, CHANGES).reasons).toEqual([
      { kind: 'cadence', detail: 'week of 28 Sep: an update finished late' },
    ])
  })

  it("refuses on staging's real cadence (no staging week was read with one update a week)", () => {
    const withCadence = (w: string): WeekRead => readFromStaging(w, { ...weekCadence(w, STAGING_RUNS) })
    const r = weekPairOf(withCadence('2026-09-07'), withCadence('2026-09-14'), [])
    expect(r.reasons.filter((x) => x.kind === 'cadence')).toEqual([
      { kind: 'cadence', detail: 'week of 7 Sep: 2 updates in the week, 2 in the week after' },
      { kind: 'cadence', detail: 'week of 14 Sep: 2 updates in the week, 0 in the second week after' },
    ])
  })

  it("does not count staging's 17 Sep search change (before the 20 Sep search set), and refuses a terms change after it (HYPOTHETICAL)", () => {
    expect(CHANGES.some((c) => c.surface === 'terms' && c.changedAt.startsWith('2026-09-17'))).toBe(true)
    expect(weekPairOf(SEP28, OCT05, CHANGES).mode).toBe('comparable')
    const later: OurChange = { id: 'hypothetical-terms', surface: 'terms', changedAt: '2026-10-06T09:00:00.000Z', note: null, affects: ['market'] }
    expect(weekPairOf(SEP28, OCT05, [...CHANGES, later]).reasons).toEqual([{ kind: 'searches', detail: 'terms 6 Oct' }])
    // After the later week's age run it cannot have moved either read.
    const after: OurChange = { ...later, changedAt: '2026-10-25T12:00:00.000Z' }
    expect(weekPairOf(SEP28, OCT05, [...CHANGES, after]).mode).toBe('comparable')
  })

  it('refuses a relevance change after the earlier week began, and a change of reader (HYPOTHETICAL)', () => {
    const regate: OurChange = { id: 'hypothetical-regate', surface: 'regate', changedAt: '2026-09-30T09:00:00.000Z', note: null, affects: ['market'] }
    expect(weekPairOf(SEP28, OCT05, [regate]).reasons.map((r) => r.kind)).toEqual(['gate'])
    // Staging's gate fix is dated 26 Sep, before the week of 28 Sep began.
    expect(CHANGES.some((c) => c.surface === 'gate_rule')).toBe(true)
    expect(weekPairOf(SEP28, { ...OCT05, promptVersion: 'pass_a_v5' }, []).reasons).toEqual([
      { kind: 'reader', detail: 'prompt pass_a_v4.1 and pass_a_v5' },
    ])
    expect(weekPairOf(SEP28, { ...OCT05, ageDays: 21 }, []).reasons.map((r) => r.kind)).toEqual(['reader'])
  })

  it('refuses a reader that was not recorded, even on both sides (a capture that found no Pass A call)', () => {
    expect(weekPairOf({ ...SEP28, promptVersion: WEEK_READER_UNKNOWN }, { ...OCT05, promptVersion: WEEK_READER_UNKNOWN }, []).reasons).toEqual([
      { kind: 'reader', detail: 'prompt version not recorded' },
    ])
    expect(weekPairOf(SEP28, { ...OCT05, laneRule: '' }, []).reasons).toEqual([{ kind: 'reader', detail: 'lane rule not recorded' }])
  })

  it('refuses a week not kept and the excluded week, and NaN never passes', () => {
    expect(weekPairOf(SEP28, null, []).reasons).toEqual([{ kind: 'not_kept', detail: 'the later week was not kept' }])
    const sep21 = readFromStaging('2026-09-14', { week: '2026-09-21', unchecked: 0 })
    expect(weekPairOf(sep21, SEP28, []).reasons.map((r) => r.kind)).toContain('excluded')
    const nan = weekPairOf(SEP28, { ...OCT05, medianDated: Number.NaN }, [])
    expect(nan.reasons).toEqual([{ kind: 'depth', detail: 'mean ratio 0.88, median ratio not measured' }])
    expect(weekPairOf(SEP28, { ...OCT05, videos: 0 }, []).reasons.map((r) => r.kind)).toContain('gate')
  })

  it('never answers flag', () => {
    const modes = new Set([weekPairOf(SEP28, OCT05, []).mode, weekPairOf(SEP28, null, []).mode])
    expect(modes).toEqual(new Set(['comparable', 'refuse']))
  })
})

describe('shares at a fixed depth mix', () => {
  const mix = pooledMix(STAGING_WEEKS.map((w) => ({ bands: STAGING_BAND_N[w] })))!
  const raw = (w: string, kind: string): number =>
    (STAGING_BAND_K[w][kind].reduce((a, b) => a + b, 0) / STAGING_BAND_N[w].reduce((a, b) => a + b, 0)) * 100
  const std = (w: string, kind: string): number => standardisedShare(kindPoints(w, w, kind).bands, mix)! * 100
  const range = (xs: number[]): number => Math.max(...xs) - Math.min(...xs)
  const r1 = (x: number): number => Math.round(x * 10) / 10

  it('pools the six-week mix at 0.303 · 0.416 · 0.281', () => {
    expect(mix.map((m) => Math.round(m * 1000) / 1000)).toEqual([0.303, 0.416, 0.281])
  })

  it("reproduces decision M's raw market praise 76.2 · 55.3 · 42.8 · 57.2 · 61.9 · 61.3", () => {
    expect(STAGING_WEEKS.map((w) => r1(raw(w, 'praise')))).toEqual([76.2, 55.3, 42.8, 57.2, 61.9, 61.3])
  })

  it('reproduces the depth-standardised market praise 66.7 · 59.1 · 51.0 · 61.2 · 60.8 · 60.7', () => {
    expect(STAGING_WEEKS.map((w) => r1(std(w, 'praise')))).toEqual([66.7, 59.1, 51.0, 61.2, 60.8, 60.7])
  })

  it("narrows praise's range from 33.4 to 15.6 points and question's from 14.0 to 6.4; buying interest only from 22.8 to 17.5", () => {
    expect(r1(range(STAGING_WEEKS.map((w) => raw(w, 'praise'))))).toBe(33.4)
    expect(r1(range(STAGING_WEEKS.map((w) => std(w, 'praise'))))).toBe(15.6)
    expect(r1(range(STAGING_WEEKS.map((w) => raw(w, 'question'))))).toBe(14.0)
    expect(r1(range(STAGING_WEEKS.map((w) => std(w, 'question'))))).toBe(6.4)
    expect(r1(range(STAGING_WEEKS.map((w) => raw(w, 'purchase_intent'))))).toBe(22.8)
    expect(r1(range(STAGING_WEEKS.map((w) => std(w, 'purchase_intent'))))).toBe(17.5)
  })

  it('is null for a mix that is not one, or a weighted band with no videos', () => {
    const bands = kindPoints('2026-08-31', '2026-08-31', 'praise').bands
    expect(standardisedShare(bands, [0, 0, 0])).toBeNull()
    expect(standardisedShare(bands, [Number.NaN, 1, 1])).toBeNull()
    expect(standardisedShare(bands.filter((b) => b.band !== '20+'), mix)).toBeNull()
    // A band the mix does not weight may be missing.
    expect(standardisedShare(bands.filter((b) => b.band !== '20+'), [1, 1, 0])).toBeCloseTo((27 / 91 + 51 / 80) / 2, 10)
  })
})

describe('keeping a week', () => {
  it("offers, at staging's 20 Sep update, the week of 31 Aug at 14 days and 24 Aug at 21 (their cutoff, 21 Sep, and that update the latest)", () => {
    const got = weeksToKeep({ runs: STAGING_RUNS, now: '2026-09-21T06:00:00.000Z', firstWeek: '2026-08-03' })
    expect(got.map((c) => [c.week, c.ageDays, c.cutoff, c.ageRun.id])).toEqual([
      ['2026-08-24', 21, '2026-09-21T00:00:00Z', 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4'],
      ['2026-08-31', 14, '2026-09-21T00:00:00Z', 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4'],
    ])
  })

  it('keeps the week of 28 Sep on Mon 19 Oct, then 28 Sep at 21 and 5 Oct at 14 on Mon 26 Oct, then 5 Oct at 21 and 12 Oct at 14 on Mon 2 Nov (stand-ins)', () => {
    const at = (now: string, held?: ReadonlySet<string>) =>
      weeksToKeep({ runs: PROD_RUNS, now, firstWeek: SEALAND.firstWeek, held }).map((c) => `${c.week}@${c.ageDays}`)
    expect(at('2026-10-19T09:00:00.000Z')).toEqual(['2026-09-28@14'])
    expect(at('2026-10-26T09:00:00.000Z')).toEqual(['2026-09-28@21', '2026-10-05@14'])
    expect(at('2026-11-02T09:00:00.000Z')).toEqual(['2026-10-05@21', '2026-10-12@14'])
    expect(at('2026-10-26T09:00:00.000Z', new Set(['2026-09-28|21']))).toEqual(['2026-10-05@14'])
  })

  it('never offers a week whose age update is no longer the latest (a missed capture is a gap for good), or a week before its cutoff', () => {
    const runs = PROD_RUNS.filter((r) => r.finishedAt! <= '2026-10-25T12:00:00.000Z')
    const offered = weeksToKeep({ runs, now: '2026-10-26T09:00:00.000Z', firstWeek: SEALAND.firstWeek }).map((c) => `${c.week}@${c.ageDays}`)
    expect(offered).not.toContain('2026-09-28@14')
    // Sunday morning, the 18 Oct update still running: nothing yet.
    expect(weeksToKeep({ runs: PROD_RUNS, now: '2026-10-18T06:00:00.000Z', firstWeek: SEALAND.firstWeek })).toEqual([])
  })

  it('never offers the week of 21 Sep', () => {
    const got = weeksToKeep({ runs: PROD_RUNS, now: '2026-10-12T09:00:00.000Z', firstWeek: '2026-09-14' }).map((c) => `${c.week}@${c.ageDays}`)
    expect(got).toEqual(['2026-09-14@21'])
  })

  it("keeps staging's week of 31 Aug at 14 days from its rows, with its real depth and cadence", () => {
    const [, candidate] = weeksToKeep({ runs: STAGING_RUNS, now: '2026-09-21T06:00:00.000Z', firstWeek: '2026-08-03' })
    const { read, rows } = keepWeekPoints({
      candidate,
      runs: STAGING_RUNS,
      volumes: STAGING_WEEK_VOLUMES.filter((r) => r.week === '2026-08-31'),
      readings: STAGING_AUG31_READINGS,
      promptVersion: 'pass_a_v4.1',
      laneRule: 'min_comments:default=5,reddit=3',
      methodVersion: 'week_line_v1',
      computedAt: '2026-09-21T06:00:00.000Z',
    })
    expect(read).toMatchObject({
      week: '2026-08-31', ageDays: 14, capturedBefore: '2026-09-21T00:00:00Z', readThroughRun: 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4',
      readThroughAt: '2026-09-20T08:33:47.358Z',
      videos: 229, comments: 3275, medianDated: 6, bands: [91, 80, 58], unchecked: 4, olderVideos: 89,
      runsInWeek: 0, runsAfter: [2, 2], lateRun: false, rescrapeCapped: null,
    })
    expect(read.meanDated).toBeCloseTo(14.30, 2)
    // The bands add up to the week's videos.
    expect(read.bands.reduce((a, b) => a + b, 0)).toBe(read.videos)
    // 8 audience-bands × 16 objects: the nine kinds staging's current insights carry and the seven subjects.
    expect(rows).toHaveLength(128)

    const points = pooledWeekPoints(rows, STAGING_RIVALS)
    const praise = points.find((p) => p.objectId === 'praise')!
    expect(praise.bands).toEqual([{ band: '1-4', k: 27, n: 91 }, { band: '5-19', k: 51, n: 80 }, { band: '20+', k: 53, n: 58 }])
    const looks = points.find((p) => p.objectId === STAGING_LOOKS_ID)!
    expect(looks.bands.map((b) => b.k)).toEqual(STAGING_BAND_K['2026-08-31'].looks)
    // Every kind is kept, as MF4 returns it; the line draws only the six (staging's own week, read as a first week).
    expect(points.filter((p) => p.objectKind === 'kind')).toHaveLength(9)
    const line = buildWeekLine([read], points, [], { ...SEALAND, firstWeek: '2026-08-31' })
    expect(line.rows.map((r) => r.objectId)).toEqual([...WEEK_LINE_KINDS])
    // Without Freitag as a tracked rival its rows leave the pool.
    const noFreitag = pooledWeekPoints(rows, STAGING_RIVALS.filter((a) => a !== 'competitor:Freitag'))
    expect(noFreitag.find((p) => p.objectId === 'praise')!.bands[0]).toEqual({ band: '1-4', k: 27, n: 90 })
  })

  it('refuses a malformed row rather than keep it, because a kept point is never rewritten', () => {
    const [, candidate] = weeksToKeep({ runs: STAGING_RUNS, now: '2026-09-21T06:00:00.000Z', firstWeek: '2026-08-03' })
    const base = {
      candidate, runs: STAGING_RUNS, volumes: STAGING_WEEK_VOLUMES.filter((r) => r.week === '2026-08-31'),
      promptVersion: 'pass_a_v4.1', laneRule: 'x', methodVersion: 'week_line_v1', computedAt: '2026-09-21T06:00:00.000Z',
    }
    expect(() => keepWeekPoints({ ...base, readings: [{ ...STAGING_AUG31_READINGS[0], k: 9, n: 7 }] })).toThrow(/not a count/)
    expect(() => keepWeekPoints({ ...base, readings: [{ ...STAGING_AUG31_READINGS[0], depth_band: '0-1' }] })).toThrow(/depth band/)
  })

  it('measures the fill between two cuts: the week of 31 Aug held 98.3% of its comments a week before its 14-day cut', () => {
    const aug31 = STAGING_COMMENTS_BY_CUT['2026-08-31']
    expect(Math.round((aug31['2026-09-14'] / aug31['2026-09-21']) * 1000) / 10).toBe(98.3)
    expect(fillGain(aug31['2026-09-14'], aug31['2026-09-21'])!).toBeLessThan(WEEK_FILL_LATE_MAX)
    // The week of 7 Sep gained 19% with the 20 Sep update: a 7-day age would not hold.
    const sep7 = STAGING_COMMENTS_BY_CUT['2026-09-07']
    expect(fillGain(sep7['2026-09-14'], sep7['2026-09-21'])!).toBeGreaterThan(0.19)
    expect(fillGain(0, 5)).toBeNull()
  })
})

describe('buildWeekLine', () => {
  // HYPOTHETICAL points: staging's weeks of 7 and 14 Sep re-dated to 28 Sep and 5 Oct.
  const points: WeekPoint[] = [
    ...[...WEEK_LINE_KINDS, 'looks'].flatMap((k) => [kindPoints('2026-09-07', '2026-09-28', k), kindPoints('2026-09-14', '2026-10-05', k)]),
    ...(['2026-09-07', '2026-09-14'] as const).map((w, i): WeekPoint => ({
      week: i === 0 ? '2026-09-28' : '2026-10-05', ageDays: 14, objectKind: 'subject', objectId: STAGING_PRICE_ID,
      bands: WEEK_DEPTH_BANDS.map((band, j) => ({ band, k: STAGING_PRICE_K[w][j], n: STAGING_BAND_N[w][j] })),
    })),
    // A point for the excluded week and one before the first week: never drawn.
    kindPoints('2026-08-31', '2026-09-21', 'praise'),
    kindPoints('2026-08-24', '2026-09-14', 'praise'),
  ]
  const reads: WeekRead[] = [
    SEP28, OCT05,
    readFromStaging('2026-08-31', { week: '2026-09-21', unchecked: 0 }),
    readFromStaging('2026-08-24', { week: '2026-09-14' }),
  ]
  const objects = [
    { objectKind: 'subject' as const, objectId: STAGING_LOOKS_ID, label: 'Looks & style', calibration: 'provisional' as const },
    { objectKind: 'subject' as const, objectId: STAGING_PRICE_ID, label: 'Price', calibration: 'provisional' as const },
  ]
  const axis = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12']
  const cfg: WeekLineConfig = { ...SEALAND, mix: pooledMix([SEP28, OCT05]) }
  const block = buildWeekLine(reads, points, CHANGES, cfg, { objects, axis, nextUpdateAfter: SEALAND_NEXT_UPDATE })

  it('draws the six kinds, then the subjects that clear 10 in both weeks of a pair (Looks & style, not Price)', () => {
    expect(block.rows.map((r) => r.label)).toEqual([
      'Praising it', 'Asking how it works', 'Ready to buy', 'Hitting a problem', 'Asking for something', 'Pushing back', 'Looks & style',
    ])
  })

  it('gives the week of 21 Sep and every week before 28 Sep no point', () => {
    for (const row of block.rows) expect(row.points.map((p) => p.week)).toEqual(['2026-09-28', '2026-10-05'])
  })

  it('prints the raw share with the depth-held one beside it, read with its age update', () => {
    const praise = block.rows[0]
    expect(praise.points.map((p) => [p.k, p.n, p.readWith])).toEqual([[250, 404, '2026-10-18'], [195, 318, '2026-10-25']])
    expect(praise.points.every((p) => p.standardised != null && p.standardised > 0 && p.standardised < 1)).toBe(true)
    expect(block.mix).toEqual(cfg.mix)
  })

  it('bands the pair: "no clear change" for praise (61.9 against 61.3)', () => {
    const pair = block.rows[0].pairs[0]
    expect(pair).toMatchObject({ prevWeek: '2026-09-28', week: '2026-10-05', mode: 'comparable', reasons: [] })
    expect(pair.verdict).toMatchObject({ state: 'no_clear_change', value: { k: 195, n: 318 }, baseline: { k: 250, n: 404 }, window: { kind: 'week' } })
  })

  it('gives a provisional subject points and no verdict', () => {
    const looks = block.rows.find((r) => r.objectId === STAGING_LOOKS_ID)!
    expect(looks.calibration).toBe('provisional')
    expect(looks.points.map((p) => p.k)).toEqual([65, 38])
    expect(looks.pairs[0].verdict).toBeNull()
    const ready = buildWeekLine(reads, points, CHANGES, cfg, { objects: [{ ...objects[0], calibration: 'ready' }] })
    expect(ready.rows.find((r) => r.objectId === STAGING_LOOKS_ID)!.pairs[0].verdict).not.toBeNull()
  })

  it('never draws a failed subject', () => {
    const failed = buildWeekLine(reads, points, CHANGES, cfg, { objects: [{ ...objects[0], calibration: 'failed' }] })
    expect(failed.rows.some((r) => r.objectId === STAGING_LOOKS_ID)).toBe(false)
  })

  it('keeps both points of a pair not read the same way, with its reasons and a refused verdict carrying the counts', () => {
    const extra = buildWeekLine([SEP28, { ...OCT05, runsInWeek: 2, offCadence: 1 }], points, CHANGES, cfg)
    const pair = extra.rows[0].pairs[0]
    expect(pair.mode).toBe('refuse')
    expect(pair.reasons).toEqual(['cadence'])
    expect(pair.verdict).toMatchObject({ state: 'refused', refusedReason: 'unmeasured', value: { k: 195, n: 318 } })
    const shallow = buildWeekLine([SEP28, { ...OCT05, meanDated: 9.79 }], points, CHANGES, cfg)
    expect(shallow.rows[0].pairs[0].verdict).toMatchObject({ state: 'refused', refusedReason: 'depth' })
  })

  it('lists the weeks still due, with their updates', () => {
    expect(block.due).toEqual([{ week: '2026-10-12', date: '2026-11-01' }])
  })

  it('carries no direction word on any path', () => {
    const all = [block, buildWeekLine([SEP28, { ...OCT05, runsInWeek: 2 }], points, CHANGES, cfg)]
    for (const b of all) {
      for (const row of b.rows) for (const p of row.pairs) expect(p.verdict?.direction).toBeUndefined()
      expect(JSON.stringify(b)).not.toMatch(directionRe())
    }
  })

  it('reads only its own age and method', () => {
    const other = buildWeekLine(reads.map((r) => ({ ...r, methodVersion: 'week_line_v0' })), points, CHANGES, cfg)
    expect(other.rows).toEqual([])
  })
})
