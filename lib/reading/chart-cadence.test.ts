import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { changesFromLog, isFailOpenFix, type OurChange } from './comparability'
import type { ConfigChange } from '../config-log'
import { gatheredNothing } from '../pipeline/run-bookkeeping'
import {
  AFTER_GATHER_STEPS, chartAnalysisResume, chartCadenceBroken, chartDated, chartRunGatheredNothing, chartSettlingUpdates, gatherCompleted, keepWeekPoints, weekCadence, weekPairOf, withChartCadence,
  WEEK_GATE_SURFACES, WEEK_SEARCH_SURFACES, type ChartRun, type WeekRead,
} from './week-line'
import { weekRules, weeksSinceOurChanges, WEEK_CUT_SURFACES, type WeekVolume } from './weeks'

// The release fix of 1 Oct night: the week chart's cadence test, rivals and
// handles cutting it, and the fail-open fixes exempt from the week line as
// they are from the Dashboard.

// Sealand's runs, 13 Sep to 1 Oct, as production holds them (read 1 Oct;
// their options read 5 Oct). The 15 Sep row is a resume (`runId` itself); the
// two 24 Sep rows are fresh analysis-only rehearsals, which gathered nothing.
const SEALAND_RUNS: ChartRun[] = [
  { id: '5a2ebc43', status: 'failed', startedAt: '2026-09-15T08:21:22Z', finishedAt: '2026-09-15T08:38:58Z', errors: [], options: { runId: '5a2ebc43', skipGather: true } },
  { id: 'b67b56de', status: 'partial', startedAt: '2026-09-20T04:02:57Z', finishedAt: '2026-09-20T08:33:47Z', errors: ['owned-posts:instagram:rareform: instagram census read returned 0 posts'], options: { sendReport: true, scheduledFor: '2026-09-20T04:00:00.000Z' } },
  { id: 'e80e9347', status: 'partial', startedAt: '2026-09-24T15:54:51Z', finishedAt: '2026-09-24T16:16:13Z', errors: ['ocr: failed', 'persist-themes:registry: failed'], options: { skipGather: true } },
  { id: '03180a33', status: 'partial', startedAt: '2026-09-24T17:35:55Z', finishedAt: '2026-09-24T17:51:08Z', errors: ['ocr: failed'], options: { skipGather: true } },
  {
    id: 'f3646446', status: 'partial', startedAt: '2026-09-27T04:03:42Z', finishedAt: '2026-09-27T07:28:35Z', options: { sendReport: true, scheduledFor: '2026-09-27T04:00:00.000Z' },
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

  it('a run partial only for the product steps (depth v2 T11) still completed its gather', () => {
    expect(gatherCompleted({ ...SEALAND_RUNS[4], errors: ['product-readings: 2026-10 out of retries', 'plan-product-readings: catalogue read failed'] })).toBe(true)
  })

  it('names no gather step as after the gather (the pipeline\'s gather labels: a search, a platform, its comments, the gate, discovery)', () => {
    for (const gather of ['search', 'platform', 'comments', 'gate', 'discover-subreddits']) {
      expect(AFTER_GATHER_STEPS).not.toContain(gather)
    }
  })
})

// 13 Oct: both tenants' "Videos, week by week" was empty. On Sealand the 11 Oct
// update closed partial on the own-posts census, one classify-meta batch that
// ran into the output limit, and one theme merge; every gather step completed,
// but classification was not a step after the gather, so the run was not a
// completed gather, its week (5 Oct) broke, and the cut, which walks back from
// the newest gathered week and stops at the first break, drew nothing at all.
describe('classification is a step after the gather (13 Oct)', () => {
  // Sealand's 11 Oct update, its errors as production recorded them; its
  // window and finish as the 13 Oct page dumps read them.
  const RUN_11_OCT: ChartRun = {
    id: '78a6eb3c', status: 'partial', startedAt: '2026-10-11T04:00:32Z', finishedAt: '2026-10-11T07:29:44Z',
    windowStart: '2026-10-04T04:01:17Z', windowEnd: '2026-10-11T04:00:32Z',
    options: { sendReport: true, scheduledFor: '2026-10-11T04:00:00.000Z' },
    errors: [
      'owned-posts:instagram:rareform: instagram census read returned 0 posts; fell back to the profile summary (0 in window)',
      'classify-meta: Could not parse response content as the length limit was reached',
      'themes:industry-other: the merge call failed on the last attempt; this bucket\'s themes are unmerged this run',
    ],
  }
  // The 4 Oct update, resumed analysis-only the same day (lib/pages/home.test.ts).
  const RUN_4_OCT: ChartRun = {
    id: '393b95df', status: 'completed', startedAt: '2026-10-04T11:45:46Z', finishedAt: '2026-10-04T12:13:08Z',
    windowStart: '2026-09-27T04:03:42Z', windowEnd: '2026-10-04T04:01:17Z', errors: [], options: { runId: '393b95df', sendReport: true, skipGather: true },
  }
  const RUNS = [...SEALAND_RUNS, RUN_4_OCT, RUN_11_OCT]
  const NOW_13 = '2026-10-13T16:42:37Z'

  it('lists the labels the pipeline notes a classification failure under', () => {
    expect(AFTER_GATHER_STEPS).toContain('plan-classify')
    expect(AFTER_GATHER_STEPS).toContain('classify-meta')
    const pipeline = readFileSync(new URL('../../inngest/functions/pipeline.ts', import.meta.url), 'utf8')
    const labels = [...pipeline.matchAll(/noteError\('((?:plan-)?classify[^':`]*)'/g)].map((m) => m[1])
    expect([...new Set(labels)].sort()).toEqual(['classify-meta', 'plan-classify'])
    // Classification is planned after the gather has stored its videos.
    const gathered = pipeline.indexOf("if (totalVideos === 0)")
    expect(gathered).toBeGreaterThan(0)
    expect(pipeline.indexOf(".run('plan-classify'")).toBeGreaterThan(gathered)
  })

  it('Sealand\'s 11 Oct update completed its gather: own posts, classification and a theme merge are all after it', () => {
    expect(gatherCompleted(RUN_11_OCT)).toBe(true)
    expect(gatherCompleted({ ...RUN_11_OCT, errors: ['plan-classify: plan failed'] })).toBe(true)
  })

  it('a real gather error beside them still makes it no completed gather', () => {
    for (const gather of ['comments:tiktok:4: actor failed', 'platform:youtube: quota', 'gate:instagram: refused', 'discover-subreddits: probe timed out', 'something-new: x']) {
      expect(gatherCompleted({ ...RUN_11_OCT, errors: [...RUN_11_OCT.errors!, gather] }), gather).toBe(false)
    }
  })

  it('so the weeks of 21 Sep, 28 Sep and 5 Oct keep their cadence on 13 Oct; 14 Sep stays broken', () => {
    for (const week of ['2026-09-21', '2026-09-28', '2026-10-05']) expect(chartCadenceBroken(week, RUNS, NOW_13), week).toBeNull()
    expect(chartCadenceBroken('2026-09-14', RUNS, NOW_13)).toBe('week of 14 Sep: 2 updates in the week')
    // With a gather step failed instead, every one of the three breaks.
    const broken = [...SEALAND_RUNS, RUN_4_OCT, { ...RUN_11_OCT, errors: ['comments:tiktok:4: actor failed'] }]
    for (const week of ['2026-09-21', '2026-09-28', '2026-10-05']) expect(chartCadenceBroken(week, broken, NOW_13), week).toMatch(/not a completed Sunday update/)
  })

  it('the same-age line never reads the list: it counts the partial run off-cadence exactly as before, so nothing it keeps moves', () => {
    const { read } = keepWeekPoints({
      candidate: { week: '2026-09-28', ageDays: 14, cutoff: '2026-10-12T00:00:00Z', ageRun: RUN_11_OCT },
      runs: [RUN_4_OCT, RUN_11_OCT],
      volumes: [], readings: [], promptVersion: 'v1', laneRule: 'l1', methodVersion: 'm1', computedAt: '2026-10-12T08:00:00Z',
    })
    expect(read.runsInWeek).toBe(1)
    expect(read.runsAfter).toEqual([1, 0])
    // The 11 Oct run is partial, and the line reads status alone.
    expect(read.offCadence).toBe(1)
    const src = readFileSync(new URL('./week-line.ts', import.meta.url), 'utf8')
    const callers = src.split('\n').filter((l) => /gatherCompleted\(/.test(l) && !/export function gatherCompleted/.test(l))
    expect(callers).toHaveLength(1)
    expect(callers[0]).toContain('status: gatherCompleted(r)')
    expect(src.slice(src.indexOf('export function chartCadenceBroken'))).toContain('status: gatherCompleted(r)')
  })
})

describe('chartCadenceBroken: one completed Sunday gather in the week and in each of the two after', () => {
  const NOW = '2026-10-01T19:00:00Z'

  it('the two 24 Sep rehearsals gathered nothing, so the week of 21 Sep holds its one Sunday update (Heinrich, 5 Oct)', () => {
    expect(chartCadenceBroken('2026-09-21', SEALAND_RUNS, NOW)).toBeNull()
  })

  it('read without the runs\' options the rehearsals count, and the week is broken as before: it fails closed', () => {
    const unread = SEALAND_RUNS.map(({ options: _o, ...r }) => r)
    expect(chartCadenceBroken('2026-09-21', unread, NOW)).toMatch(/3 updates in the week/)
  })

  it('the week of 14 Sep is still broken: a failed resume on Tue 15 Sep beside the 20 Sep update', () => {
    expect(chartCadenceBroken('2026-09-14', SEALAND_RUNS, NOW)).toBe('week of 14 Sep: 2 updates in the week')
  })

  it('only a run that gathered nothing is left out: a resume of a gathered run, or an extra gather, still breaks the week', () => {
    const at = (id: string, day: string, options: unknown): ChartRun => ({ id, status: 'completed', startedAt: `${day}T15:00:00Z`, finishedAt: `${day}T15:30:00Z`, errors: [], options })
    const clean = [sunday('2026-10-04'), sunday('2026-10-11'), sunday('2026-10-18')]
    const NOW_19 = '2026-10-19T08:00:00Z'
    // A rehearsal on any day of the three weeks: not counted.
    expect(chartCadenceBroken('2026-09-28', [...clean, at('r', '2026-10-07', { skipGather: true })], NOW_19)).toBeNull()
    expect(chartCadenceBroken('2026-09-28', [...clean, at('r', '2026-10-07', { skipGather: 'yes' })], NOW_19)).toBeNull()
    // A failed rehearsal is not counted either: it gathered nothing whatever its status.
    expect(chartCadenceBroken('2026-09-28', [...clean, { ...at('r', '2026-10-07', { skipGather: true }), status: 'failed' }], NOW_19)).toBeNull()
    // The resume lever (`runId` itself), an extra gather, or a run with no options read: counted.
    expect(chartCadenceBroken('2026-09-28', [...clean, at('r', '2026-10-07', { runId: 'r', skipGather: true })], NOW_19)).toMatch(/2 in the week after/)
    expect(chartCadenceBroken('2026-09-28', [...clean, at('r', '2026-10-07', { sendReport: true })], NOW_19)).toMatch(/2 in the week after/)
    expect(chartCadenceBroken('2026-09-28', [...clean, at('r', '2026-10-07', undefined)], NOW_19)).toMatch(/2 in the week after/)
    expect(chartCadenceBroken('2026-09-28', [...clean, at('r', '2026-10-07', null)], NOW_19)).toMatch(/2 in the week after/)
    // A rehearsal is no update either: a week with only a rehearsal in it has none.
    expect(chartCadenceBroken('2026-09-28', [at('r', '2026-10-04', { skipGather: true }), ...clean.slice(1)], NOW_19)).toMatch(/0 updates in the week/)
  })

  it('reads a run that gathered nothing exactly as the pipeline\'s window anchor does (`gatheredNothing`)', () => {
    const cases: { id: string; options?: unknown }[] = [
      { id: 'a', options: { skipGather: true } },
      { id: 'a', options: { skipGather: true, runId: 'b' } },
      { id: 'a', options: { skipGather: true, runId: 'a' } },
      { id: 'a', options: { skipGather: true, runId: 'A' } },
      { id: 'A', options: { skipGather: true, runId: 'a' } },
      { id: '393b95df', options: { skipGather: true, runId: '393B95DF' } },
      { id: 'a', options: { skipGather: true, runId: 7 } },
      { id: 'a', options: { skipGather: false } },
      { id: 'a', options: { skipGather: 1 } },
      { id: 'a', options: { skipGather: '' } },
      { id: 'a', options: { sendReport: true } },
      { id: 'a', options: {} },
      { id: 'a', options: null },
      { id: 'a', options: 'skipGather' },
      { id: 'a' },
    ]
    for (const c of cases) expect(chartRunGatheredNothing(c), JSON.stringify(c)).toBe(gatheredNothing(c))
  })

  it('a run that gathered nothing settles no week: its finish leaves the updates (chartSettlingUpdates)', () => {
    const updates = SEALAND_RUNS.filter((r) => r.status !== 'failed').map((r) => r.finishedAt!)
    expect(chartSettlingUpdates(updates, SEALAND_RUNS)).toEqual(['2026-09-20T08:33:47Z', '2026-09-27T07:28:35Z'])
    // Matched by instant: Postgres's text form of the same finish.
    expect(chartSettlingUpdates(['2026-09-24 16:16:13+00', '2026-09-27 07:28:35+00'], SEALAND_RUNS)).toEqual(['2026-09-27 07:28:35+00'])
    // No runs (a fixture), or runs read without options: every update counts.
    expect(chartSettlingUpdates(updates, null)).toEqual(updates)
    expect(chartSettlingUpdates(updates, SEALAND_RUNS.map(({ options: _o, ...r }) => r))).toEqual(updates)
  })

  it('the same-age line keeps counting every run: its kept reads are never recomputed', () => {
    const rehearsals = SEALAND_RUNS.filter((r) => chartRunGatheredNothing(r))
    expect(rehearsals.map((r) => r.id)).toEqual(['e80e9347', '03180a33'])
    const { read } = keepWeekPoints({
      candidate: { week: '2026-09-21', ageDays: 14, cutoff: '2026-10-12T00:00:00Z', ageRun: sunday('2026-10-11') },
      runs: [...SEALAND_RUNS, sunday('2026-10-04'), sunday('2026-10-11')],
      volumes: [], readings: [], promptVersion: 'v1', laneRule: 'l1', methodVersion: 'm1', computedAt: '2026-10-12T08:00:00Z',
    })
    expect(read.runsInWeek).toBe(3)
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
    const weeks = withChartCadence([{ week: '2026-09-14' }, { week: '2026-09-21' }, { week: '2026-09-28' }], SEALAND_RUNS, NOW)
    expect(weeks.map((w) => w.cadence === null)).toEqual([false, true, true])
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

// 14 Oct: Össur's chart drew nothing. Its 11 Oct update (`41024b9e`) opened
// and gathered on Sunday 11 Oct, then was resumed analysis-only (`skipGather`,
// `runId` itself) on Monday 12 Oct, which rewrote `started_at` and
// `completed_at`. Dated by those it was an off-day, late run in the week of
// 12 Oct. The chart dates such a run by its gather, its `windowEnd`
// (`chartDated`); the same-age line's `weekCadence` is untouched. Runs as the
// lead read them from production on 14 Oct (ossur-runs-14oct.md).
describe('an analysis-only resume is dated by its gather on the chart (14 Oct)', () => {
  const NOW = '2026-10-14T09:00:00Z'
  const OSSUR_RUNS: ChartRun[] = [
    {
      id: '555af400', status: 'partial', startedAt: '2026-10-04T11:45:00Z', finishedAt: '2026-10-04T14:46:00Z',
      windowStart: '2026-09-13T04:00:00Z', windowEnd: '2026-10-04T11:45:00Z', options: { sendReport: true },
      errors: [
        'themes:industry-other: merge failed',
        'transcribe:youtube: 2 of 43 caption batches run-failed and were recovered id-by-id, under the 25% ratio',
        'pass-a: 1 video(s) hit the 8000-token output ceiling and were re-asked once on half their comments',
      ],
    },
    {
      id: '41024b9e', status: 'partial', startedAt: '2026-10-12T05:37:00Z', finishedAt: '2026-10-12T06:23:00Z',
      windowStart: '2026-10-04T11:45:00Z', windowEnd: '2026-10-11T04:00:00Z', options: { skipGather: true, runId: '41024b9e' },
      errors: ['ocr: 41 of 300 failed (14%)', 'themes:industry-other: merge failed'],
    },
  ]

  it('Össur\'s 4 Oct and 11 Oct updates draw the weeks of 28 Sep and 5 Oct, as of 14 Oct', () => {
    expect(OSSUR_RUNS.every(gatherCompleted)).toBe(true)
    expect(chartAnalysisResume(OSSUR_RUNS[1])).toBe(true)
    expect(chartCadenceBroken('2026-09-28', OSSUR_RUNS, NOW)).toBeNull()
    expect(chartCadenceBroken('2026-10-05', OSSUR_RUNS, NOW)).toBeNull()
    // The week still under way reads as having its update to come.
    expect(chartCadenceBroken('2026-10-12', OSSUR_RUNS, NOW)).toBeNull()
  })

  it('dated by its own clock (the rule before 14 Oct), the same run cut both weeks', () => {
    const asBefore = OSSUR_RUNS.map((r) => ({ ...r, windowEnd: null }))
    expect(chartCadenceBroken('2026-09-28', asBefore, NOW)).not.toBeNull()
    expect(chartCadenceBroken('2026-10-05', asBefore, NOW)).not.toBeNull()
  })

  it('a self-resume WITHOUT skipGather gathers again at the resume: on a Monday it still breaks', () => {
    const regathered = OSSUR_RUNS.map((r) => (r.id === '41024b9e' ? { ...r, options: { runId: '41024b9e' } } : r))
    expect(chartAnalysisResume(regathered[1])).toBe(false)
    expect(chartDated(regathered[1])).toBe(regathered[1])
    expect(chartCadenceBroken('2026-10-05', regathered, NOW)).not.toBeNull()
  })

  it('a run with no windowEnd keeps today\'s rule; a fresh skipGather run is still not counted', () => {
    const noWindow = { ...OSSUR_RUNS[1], windowEnd: null }
    expect(chartDated(noWindow)).toBe(noWindow)
    const fresh: ChartRun = { ...OSSUR_RUNS[1], id: 'fresh', options: { skipGather: true } }
    expect(chartAnalysisResume(fresh)).toBe(false)
    expect(chartRunGatheredNothing(fresh)).toBe(true)
    // Dated by its gather, an unfinished resume stays unfinished.
    expect(chartDated({ ...OSSUR_RUNS[1], finishedAt: null, status: 'running' }).finishedAt).toBeNull()
  })

  it('the same-age line reads every run on its own clock, unchanged', () => {
    // `weekCadence` places the resume in the week of 12 Oct, off-day and
    // late, as it always has: its kept reads are never recomputed.
    const c = weekCadence('2026-10-05', OSSUR_RUNS.map((r) => ({ id: r.id, status: 'completed', finishedAt: r.finishedAt, startedAt: r.startedAt })))
    expect(c.runsInWeek).toBe(0)
    expect(c.runsAfter[0]).toBe(1)
    expect(c.offCadence).toBe(1)
    const src = readFileSync(new URL('./week-line.ts', import.meta.url), 'utf8')
    const body = src.slice(src.indexOf('export function weekCadence'), src.indexOf('/** The weeks with their cadence'))
    expect(body).not.toContain('chartDated')
  })
})
