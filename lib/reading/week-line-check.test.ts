import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import {
  readFromStaging, STAGING_BAND_K, STAGING_BAND_N, STAGING_CHANGES, STAGING_COMMENTS_BY_CUT, STAGING_LOOKS_ID, STAGING_RIVALS,
  standInSundayRuns,
} from '../test/week-fixture'
import { WEEK_LINE } from '../week-line-config'
import { changesFromLog } from './comparability'
import { WEEK_DEPTH_BANDS, WEEK_LINE_KINDS, weekAgeCutoff, type WeekPointRow, type WeekRead } from './week-line'
import { firstPair, reachedCuts, weekLineCheck, weekLineCheckNote } from './week-line-check'
import { addDays } from './weeks'

// The Mon 26 Oct check note (WP3.13 "Agent, check"). Production's weeks are not
// knowable yet, so the kept reads are HYPOTHETICAL: staging's weeks re-dated,
// each figure the staging week's own (lib/test/week-fixture.ts).

const CFG = WEEK_LINE[SEALAND_CLIENT_ID]
const CHANGES = changesFromLog(STAGING_CHANGES)
const RUNS = standInSundayRuns(['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'])
const AT_26_OCT = '2026-10-26T09:00:00.000Z'

/** The age run: the stand-in update in the week before the cut. */
const ageRun = (week: string, ageDays: number) => RUNS.find((r) => r.id === `stand-in-${addDays(week, 6 + ageDays)}`)!
const redated = (stagingWeek: string, week: string, ageDays: 14 | 21, comments: number): WeekRead => readFromStaging(stagingWeek, {
  week, ageDays, capturedBefore: weekAgeCutoff(week, ageDays), unchecked: 0, comments,
  readThroughRun: ageRun(week, ageDays).id, readThroughAt: ageRun(week, ageDays).finishedAt,
})

/** A staging week's pooled market points, re-dated, as one row per band: the
 *  market pooled in one audience row gives the same point `pooledWeekPoints`
 *  would make from the audience rows. */
const rowsFor = (stagingWeek: string, week: string): WeekPointRow[] =>
  [...WEEK_LINE_KINDS, 'looks'].flatMap((kind) => WEEK_DEPTH_BANDS.map((band, i) => ({
    week, ageDays: 14 as const, methodVersion: CFG.methodVersion, audience: 'industry-other',
    objectKind: kind === 'looks' ? 'subject' as const : 'kind' as const, objectId: kind === 'looks' ? STAGING_LOOKS_ID : kind,
    depthBand: band, k: STAGING_BAND_K[stagingWeek][kind][i], n: STAGING_BAND_N[stagingWeek][i],
  })))

describe('the first pair and its cuts', () => {
  it('is the week of 28 Sep against 5 Oct, and skips the excluded week', () => {
    expect(firstPair('2026-09-28')).toEqual({ prevWeek: '2026-09-28', week: '2026-10-05' })
    expect(firstPair('2026-09-14')).toEqual({ prevWeek: '2026-09-14', week: '2026-09-28' })
  })

  it('on Mon 26 Oct the week of 28 Sep has reached 14 and 21 days, the week of 5 Oct 14', () => {
    expect(reachedCuts('2026-09-28', AT_26_OCT).map((c) => c.ageDays)).toEqual([14, 21])
    expect(reachedCuts('2026-10-05', AT_26_OCT).map((c) => c.ageDays)).toEqual([14])
    expect(reachedCuts('2026-09-28', '2026-11-02T09:00:00.000Z').map((c) => c.ageDays)).toEqual([14, 21, 28])
  })
})

describe('weekLineCheck', () => {
  // HYPOTHETICAL: the week of 28 Sep holds staging's week of 17 Aug's fill
  // (2,621 comments a week before the last cut, 2,646 at it: +0.95%).
  const aug17 = STAGING_COMMENTS_BY_CUT['2026-08-17']
  const reads = [
    redated('2026-09-07', '2026-09-28', 14, aug17['2026-09-14']),
    redated('2026-09-07', '2026-09-28', 21, aug17['2026-09-21']),
    redated('2026-09-14', '2026-10-05', 14, 5462),
  ]
  const rows = [...rowsFor('2026-09-07', '2026-09-28'), ...rowsFor('2026-09-14', '2026-10-05')]
  const objects = [{ objectKind: 'subject' as const, objectId: STAGING_LOOKS_ID, label: 'Looks & style', calibration: 'provisional' as const }]
  const check = weekLineCheck({ now: AT_26_OCT, cfg: CFG, reads, rows, changes: CHANGES, rivalAudiences: STAGING_RIVALS, objects })

  it('measures the fill from the kept reads: under 3%, so the 14-day age holds', () => {
    expect(check.fill[0].cuts.map((c) => [c.ageDays, c.comments])).toEqual([[14, 2621], [21, 2646]])
    expect(check.firstWeekGain).toBeCloseTo(25 / 2621, 10)
    expect(check.fillVerdict).toBe('passes')
  })

  it("fails the fill on staging's week of 7 Sep (+19%), and is not measurable before the second cut", () => {
    const sep7 = STAGING_COMMENTS_BY_CUT['2026-09-07']
    const failing = weekLineCheck({
      now: AT_26_OCT, cfg: CFG, rows, changes: CHANGES, rivalAudiences: STAGING_RIVALS,
      reads: [redated('2026-09-07', '2026-09-28', 14, sep7['2026-09-14']), redated('2026-09-07', '2026-09-28', 21, sep7['2026-09-21']), reads[2]],
    })
    expect(failing.fillVerdict).toBe('fails')
    const early = weekLineCheck({ now: '2026-10-19T09:00:00.000Z', cfg: CFG, reads: [reads[0]], rows, changes: CHANGES, rivalAudiences: STAGING_RIVALS })
    expect(early.fillVerdict).toBe('not_yet')
  })

  it('takes a cut no file holds from the live read', () => {
    const live = weekLineCheck({
      now: AT_26_OCT, cfg: CFG, reads: [reads[0], reads[2]], rows, changes: CHANGES, rivalAudiences: STAGING_RIVALS,
      fills: [{ week: '2026-09-28', ageDays: 21, comments: aug17['2026-09-21'] }],
    })
    expect(live.fillVerdict).toBe('passes')
  })

  it('states the six conditions for 28 Sep against 5 Oct, and the line exactly as it would print', () => {
    expect(check.conditions.mode).toBe('comparable')
    expect(check.conditions.depth?.median).toBeCloseTo(0.95, 3)
    expect(check.mix).not.toBeNull()
    expect(check.line.rows.map((r) => r.label)).toEqual([
      'Praising it', 'Asking how it works', 'Ready to buy', 'Hitting a problem', 'Asking for something', 'Pushing back', 'Looks & style',
    ])
    expect(check.line.rows[0].pairs[0].verdict?.state).toBe('no_clear_change')
  })

  it('writes the note Heinrich answers', () => {
    const note = weekLineCheckNote(check, { project: 'mkwjlckescdveosvrvaq', client: SEALAND_CLIENT_ID, latestUpdate: RUNS[3].finishedAt })
    expect(note).toContain('# The same-age weekly line: check at 2026-10-26')
    expect(note).toContain('as at the 25 Oct update. The first pair is the week of 28 Sep against the week of 5 Oct.')
    expect(note).toContain('Result: the week of 28 Sep gained 1% between two and three updates old, under the line. The 14-day age holds.')
    expect(note).toContain('| kept at 14 days | yes, through stand-in-2026-10-18 | yes, through stand-in-2026-10-25 |')
    expect(note).toContain('Result: read the same way. Every condition holds.')
    expect(note).toContain('- Praising it: 28 Sep 250 of 404 (61.9%; at the fixed mix')
    expect(note).toContain('- Looks & style (provisional): 28 Sep 65 of 404')
    expect(note).toContain('no verdict (a subject not yet checked)')
    expect(note).toContain('Print or wait, by Mon 26 Oct, 18:00.')
    expect(note).not.toMatch(/—/)
  })
})
