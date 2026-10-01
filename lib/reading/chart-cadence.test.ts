import { describe, expect, it } from 'vitest'

import { changesFromLog, isFailOpenFix, type OurChange } from './comparability'
import type { ConfigChange } from '../config-log'
import {
  AFTER_GATHER_STEPS, chartCadenceBroken, gatherCompleted, weekPairOf, withChartCadence,
  WEEK_GATE_SURFACES, WEEK_SEARCH_SURFACES, type ChartRun, type WeekRead,
} from './week-line'
import { weekRules, weeksSinceOurChanges, WEEK_CUT_SURFACES, type WeekVolume } from './weeks'

// The release fix of 1 Oct night: the week chart's cadence test, rivals and
// handles cutting it, and the fail-open fixes exempt from the week line as
// they are from the Dashboard.

// Sealand's runs, 13 Sep to 1 Oct, as production holds them (read 1 Oct).
const SEALAND_RUNS: ChartRun[] = [
  { id: '5a2ebc43', status: 'failed', startedAt: '2026-09-15T08:21:22Z', finishedAt: '2026-09-15T08:38:58Z', errors: [] },
  { id: 'b67b56de', status: 'partial', startedAt: '2026-09-20T04:02:57Z', finishedAt: '2026-09-20T08:33:47Z', errors: ['owned-posts:instagram:rareform: instagram census read returned 0 posts'] },
  { id: 'e80e9347', status: 'partial', startedAt: '2026-09-24T15:54:51Z', finishedAt: '2026-09-24T16:16:13Z', errors: ['ocr: failed', 'persist-themes:registry: failed'] },
  { id: '03180a33', status: 'partial', startedAt: '2026-09-24T17:35:55Z', finishedAt: '2026-09-24T17:51:08Z', errors: ['ocr: failed'] },
  {
    id: 'f3646446', status: 'partial', startedAt: '2026-09-27T04:03:42Z', finishedAt: '2026-09-27T07:28:35Z',
    errors: [
      'owned-posts:instagram:rareform: instagram census read returned 0 posts; fell back to the profile summary (0 in window)',
      'transcript-backfill: transcript-backfill step failed: Apify 408: {"error":{"type":"run-timeout"}}',
      'transcript-backfill: transcript-backfill step failed: Apify 408: {"error":{"type":"run-timeout"}}',
      'transcribe:youtube: 7 of 54 caption batches run-failed and were recovered id-by-id, under the 25% ratio',
      'pass-a: 1 video(s) hit the 8000-token output ceiling and were re-asked once on half their comments',
    ],
  },
]
const sunday = (day: string, over: Partial<ChartRun> = {}): ChartRun =>
  ({ id: `run-${day}`, status: 'completed', startedAt: `${day}T04:03:00Z`, finishedAt: `${day}T07:30:00Z`, errors: [], ...over })

describe('gatherCompleted: a partial run counts as a completed gather only on its recorded errors', () => {
  it('the 27 Sep update (f3646446) completed its gather: transcripts, the own-posts census and two findings', () => {
    expect(gatherCompleted(SEALAND_RUNS[4])).toBe(true)
    expect(gatherCompleted(SEALAND_RUNS[1])).toBe(true)
  })

  it('fails closed on a gather step, an unknown step, no reason, a capped list, or a failed run', () => {
    expect(gatherCompleted({ ...SEALAND_RUNS[4], errors: ['comments:tiktok:4: actor failed'] })).toBe(false)
    expect(gatherCompleted({ ...SEALAND_RUNS[4], errors: ['platform:youtube: quota'] })).toBe(false)
    expect(gatherCompleted({ ...SEALAND_RUNS[4], errors: ['gate:instagram: refused'] })).toBe(false)
    expect(gatherCompleted({ ...SEALAND_RUNS[4], errors: ['something-new: x'] })).toBe(false)
    expect(gatherCompleted({ ...SEALAND_RUNS[4], errors: [] })).toBe(false)
    expect(gatherCompleted({ ...SEALAND_RUNS[4], errors: null })).toBe(false)
    expect(gatherCompleted({ ...SEALAND_RUNS[4], errors: Array.from({ length: 50 }, () => 'ocr: failed') })).toBe(false)
    expect(gatherCompleted(SEALAND_RUNS[0])).toBe(false)
    expect(gatherCompleted(sunday('2026-10-04'))).toBe(true)
  })

  it('names no gather step as after the gather', () => {
    for (const gather of ['comments', 'platform', 'gate', 'discover-subreddits', 'classify-meta', 'plan-classify']) {
      expect(AFTER_GATHER_STEPS).not.toContain(gather)
    }
  })
})

describe('chartCadenceBroken: one completed Sunday gather in the week and in each of the two after', () => {
  const NOW = '2026-10-01T19:00:00Z'

  it('on 1 Oct the week of 21 Sep is broken: the two 24 Sep rehearsals make three updates in it, keep or no keep', () => {
    expect(chartCadenceBroken('2026-09-21', SEALAND_RUNS, NOW)).toMatch(/3 updates in the week/)
  })

  it('the week of 14 Sep is broken too (a failed run inside it, and the week after holds three)', () => {
    expect(chartCadenceBroken('2026-09-14', SEALAND_RUNS, NOW)).toMatch(/2 updates in the week/)
  })

  it('the week under way is not broken for an update that has not come round', () => {
    expect(chartCadenceBroken('2026-09-28', SEALAND_RUNS, NOW)).toBeNull()
  })

  it('a run still in flight on Sunday morning is not counted until it finishes', () => {
    const runs = [...SEALAND_RUNS, { id: 'live', status: 'running', startedAt: '2026-10-04T04:03:00Z', finishedAt: null, errors: [] }]
    expect(chartCadenceBroken('2026-09-28', runs, '2026-10-04T05:00:00Z')).toBeNull()
  })

  it('a week whose Sunday has passed with no update is broken', () => {
    expect(chartCadenceBroken('2026-09-28', SEALAND_RUNS, '2026-10-05T08:00:00Z')).toMatch(/0 updates in the week/)
  })

  it('a clean series reads clean; a partial gather, a late run or an extra one breaks its week', () => {
    const clean = [sunday('2026-10-04'), sunday('2026-10-11'), sunday('2026-10-18')]
    expect(chartCadenceBroken('2026-09-28', clean, '2026-10-19T08:00:00Z')).toBeNull()
    expect(chartCadenceBroken('2026-09-28', [...clean.slice(0, 2), { ...clean[2], status: 'partial', errors: ['owned-posts:instagram:x: 0 posts'] }], '2026-10-19T08:00:00Z')).toBeNull()
    expect(chartCadenceBroken('2026-09-28', [...clean.slice(0, 2), { ...clean[2], status: 'partial', errors: ['comments:youtube:3: failed'] }], '2026-10-19T08:00:00Z')).toMatch(/not a completed Sunday update/)
    expect(chartCadenceBroken('2026-09-28', [...clean, sunday('2026-10-07')], '2026-10-19T08:00:00Z')).toMatch(/2 in the week after/)
    expect(chartCadenceBroken('2026-09-28', [{ ...clean[0], finishedAt: '2026-10-05T01:00:00Z' }, ...clean.slice(1)], '2026-10-19T08:00:00Z')).toMatch(/finished late/)
  })

  it('withChartCadence sets each week\'s cadence', () => {
    const weeks = withChartCadence([{ week: '2026-09-21' }, { week: '2026-09-28' }], SEALAND_RUNS, NOW)
    expect(weeks.map((w) => w.cadence === null)).toEqual([false, true])
  })
})

describe('weeksSinceOurChanges: the cut', () => {
  const vol = (week: string, over: Partial<WeekVolume> = {}): WeekVolume => ({
    week, state: 'filling', updatesSince: 0, videos: 100, comments: 1000, category: 100, rivalFiled: 0,
    commentsNextMonth: 0, medianDated: 5, under5: 0, olderVideos: 0, unchecked: 0, ...over,
  })
  const axis = ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']
  const weeks = axis.map((w) => vol(w))
  const change = (surface: OurChange['surface'], changedAt: string, over: Partial<OurChange> = {}): OurChange =>
    ({ id: `${surface}-${changedAt}`, surface, changedAt, note: null, affects: [], ...over })

  it('cuts on the same-age line\'s search and relevance surfaces, rivals and handles included', () => {
    expect([...WEEK_CUT_SURFACES].sort()).toEqual([...WEEK_SEARCH_SURFACES, ...WEEK_GATE_SURFACES].sort())
    for (const s of ['rivals', 'handles'] as const) {
      const kept = weeksSinceOurChanges(weeks, weekRules([change(s, '2026-09-23T10:00:00Z')], axis))
      expect(kept.map((w) => w.week)).toEqual(['2026-09-28', '2026-10-05'])
    }
    // A rename or a retag moves no bar of the pooled market.
    expect(weeksSinceOurChanges(weeks, weekRules([change('rival_rename', '2026-09-23T10:00:00Z')], axis))).toHaveLength(4)
  })

  it('a fix of failed judgements is no rule; any other relevance change still cuts', () => {
    const fix = change('gate_rule', '2026-10-01T18:00:00Z', { failOpenFix: true })
    expect(weekRules([fix], axis)).toEqual([])
    expect(weeksSinceOurChanges(weeks, weekRules([fix], axis))).toHaveLength(4)
    expect(weeksSinceOurChanges(weeks, weekRules([change('gate_rule', '2026-10-01T18:00:00Z')], axis)).map((w) => w.week)).toEqual(['2026-10-05'])
  })

  it('stops at a week off the cadence, and draws what follows it', () => {
    const broken = weeks.map((w) => (w.week === '2026-09-21' ? { ...w, cadence: 'week of 21 Sep: 3 updates in the week' } : { ...w, cadence: null }))
    expect(weeksSinceOurChanges(broken, []).map((w) => w.week)).toEqual(['2026-09-28', '2026-10-05'])
    // No runs read (a fixture): nothing is cut for cadence.
    expect(weeksSinceOurChanges(weeks, [])).toHaveLength(4)
  })
})

describe('the fail-open fixes, as the change log groups them', () => {
  const row = (id: string, surface: string, field: string | null, changed_at: string): ConfigChange => ({
    id, client_id: 'c', changed_at, surface: surface as ConfigChange['surface'], field, before: null, after: null,
    actor_kind: 'script', actor_user_id: null, actor_label: null, run_id: null, source: 'logged', rows_affected: null, note: null,
  } as ConfigChange)

  it('flags a change whose every row is a gate_rule / relevance_gate row, and no other', () => {
    expect(isFailOpenFix({ surface: 'gate_rule', field: 'relevance_gate' })).toBe(true)
    const [fix] = changesFromLog([row('a', 'gate_rule', 'relevance_gate', '2026-10-01T18:00:00Z')])
    expect(fix.failOpenFix).toBe(true)
    const [mixed] = changesFromLog([row('a', 'gate_rule', 'relevance_gate', '2026-10-01T18:00:00Z'), row('b', 'gate_rule', 'relevance_prompt', '2026-10-01T18:00:30Z')])
    expect(mixed.failOpenFix).toBeUndefined()
    const [other] = changesFromLog([row('c', 'regate', null, '2026-10-01T18:00:00Z')])
    expect(other.failOpenFix).toBeUndefined()
  })
})

describe('weekPairOf: the regate does not refuse the 28 Sep → 5 Oct pair', () => {
  const read = (week: string, over: Partial<WeekRead> = {}): WeekRead => ({
    week, ageDays: 14, capturedBefore: '2026-10-19T00:00:00Z', readThroughRun: 'r', runsInWeek: 1, runsAfter: [1, 1], lateRun: false,
    videos: 280, meanDated: 9, medianDated: 6, bands: [100, 100, 80], unchecked: 0, olderVideos: 0, promptVersion: 'v1', laneRule: 'l1',
    rescrapeCapped: false, methodVersion: 'm1', computedAt: '2026-10-19T08:00:00Z', offCadence: 0, ...over,
  })
  const prev = read('2026-09-28', { capturedBefore: '2026-10-19T00:00:00Z', readThroughAt: '2026-10-18T07:30:00Z' })
  const curr = read('2026-10-05', { capturedBefore: '2026-10-26T00:00:00Z', readThroughAt: '2026-10-25T07:30:00Z' })
  const regate: OurChange = { id: 'g', surface: 'gate_rule', changedAt: '2026-10-01T18:00:00Z', note: null, affects: [], failOpenFix: true }

  it('a fix of failed judgements is not a method change', () => {
    expect(weekPairOf(prev, curr, [regate]).reasons.map((r) => r.kind)).not.toContain('gate')
  })

  it('a relevance change that is not one still refuses', () => {
    const { failOpenFix: _f, ...rule } = regate
    expect(weekPairOf(prev, curr, [rule]).reasons.map((r) => r.kind)).toContain('gate')
  })
})
