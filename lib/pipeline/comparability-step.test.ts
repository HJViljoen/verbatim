import { describe, expect, it } from 'vitest'

import { fakeAdmin } from '../test/s3-run-fake-admin'
import { gatherRows, runId, runsThrough, SUNDAYS } from '../test/s3-run-updates'
import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { STAGING_AUG31_READINGS, STAGING_WEEK_VOLUMES, standInSundayRuns } from '../test/week-fixture'
import { keepWeeksInRun, planComparability, runComparabilityTask, taskLabel, WEEK_LANE_RULE } from './comparability-step'

// The deploy-4 `comparability` step (WP3.4): its plan on the calendar's run
// dates, its no-op before its tables, and an append-only write that a replay
// does not repeat. Sealand's Sunday updates and search set since 20 Sep
// (lib/test/s3-run-updates.ts); video ids are labels.

describe('the plan', () => {
  it('the 8 Nov run: both pairs with a filling side, the checks of the one whose later month has ended, then the weeks', () => {
    const plan = planComparability('2026-11-08T07:00:00.000Z', ['2026-10-01', '2026-11-01'])
    expect(plan.map(taskLabel)).toEqual(['pair (2026-09, 2026-10)', 'pair (2026-10, 2026-11)', 'checks (2026-09, 2026-10)', 'weeks'])
  })

  it('the 6 Dec run, which freezes October: October against November is checked', () => {
    const plan = planComparability('2026-12-06T07:00:00.000Z', ['2026-10-01', '2026-11-01'])
    expect(plan.map(taskLabel)).toEqual([
      'pair (2026-09, 2026-10)', 'pair (2026-10, 2026-11)', 'pair (2026-11, 2026-12)',
      'checks (2026-09, 2026-10)', 'checks (2026-10, 2026-11)', 'weeks',
    ])
  })

  it('is the same on a replay (a pure function of the clock and the stored months)', () => {
    expect(planComparability('2026-11-08T07:00:00.000Z', ['2026-11-01', '2026-10-01']))
      .toEqual(planComparability('2026-11-08T07:00:00.000Z', ['2026-10-01', '2026-11-01']))
  })
})

const NOW = '2026-11-08T07:10:00.000Z'
const RUN = runId('2026-11-08')
const tenant = <T extends object>(rows: T[]) => rows.map((r) => ({ client_id: 'sealand', ...r }))
const base = () => ({
  config_changes: [],
  videos: tenant([
    { id: 'v-upcycled', platform: 'tiktok', video_id: 'tt-1', source_keywords: ['upcycled bag'], first_seen: '2026-10-04T04:20:00Z', source: 'search', is_client: false, is_competitor: false, competitor_name: null, analyzed_lane: 'full' },
    { id: 'v-none', platform: 'tiktok', video_id: 'tt-2', source_keywords: [], first_seen: '2026-10-18T04:20:00Z', source: 'search', is_client: false, is_competitor: false, competitor_name: null, analyzed_lane: 'full' },
  ]),
  gate_verdicts: [],
  keyword_performance: tenant(SUNDAYS.filter((d) => d <= '2026-11-08').flatMap((d) => gatherRows(d))),
  pipeline_runs: tenant(runsThrough('2026-11-08', true)),
  comments: [],
})
const monthVideos = () => [
  { video_id: 'v-upcycled', audience: 'industry-other', platform: 'tiktok', dated_comments: 23 },
  { video_id: 'v-none', audience: 'industry-other', platform: 'tiktok', dated_comments: 4 },
]

describe('a task', () => {
  it('is a no-op before MF1: no read of the corpus, nothing written', async () => {
    const f = fakeAdmin({ tables: base() })
    const o = await runComparabilityTask(f.client, { clientId: 'sealand', runId: RUN, now: NOW, task: { kind: 'pair', prevMonth: '2026-10-01', month: '2026-11-01' }, log: () => {} })
    expect(o.status).toBe('skipped')
    expect(f.writes).toEqual([])
  })

  it('checks are a no-op before MF2', async () => {
    const f = fakeAdmin({ tables: { ...base(), month_pair_comparability: [] } })
    const o = await runComparabilityTask(f.client, { clientId: 'sealand', runId: RUN, now: NOW, task: { kind: 'checks', prevMonth: '2026-09-01', month: '2026-10-01' }, log: () => {} })
    expect(o.status).toBe('skipped')
    expect(f.writes).toEqual([])
  })

  it('the weekly keep says so while the store is not in the build', async () => {
    const f = fakeAdmin({ tables: base() })
    const o = await runComparabilityTask(f.client, { clientId: 'sealand', runId: RUN, now: NOW, task: { kind: 'weeks' }, log: () => {} })
    expect(o.status).toBe('not_wired')
  })

  it('writes a pair row read through this run, with its gather health, and a replay writes nothing', async () => {
    const f = fakeAdmin({
      tables: { ...base(), month_pair_comparability: [], config_change_reach: [] },
      rpc: { market_month_videos: () => monthVideos() },
    })
    const args = { clientId: 'sealand', runId: RUN, now: NOW, task: { kind: 'pair' as const, prevMonth: '2026-10-01', month: '2026-11-01' }, log: () => {} }
    const o = await runComparabilityTask(f.client, args)
    expect(o.status).toBe('written')
    expect(f.tables.month_pair_comparability).toHaveLength(1)
    const row = f.tables.month_pair_comparability[0]
    expect(row.read_through_run).toBe(RUN)
    expect(row.gather).toEqual([
      { month: '2026-10-01', runs: 4, partial: 0, searches_short: 0 },
      { month: '2026-11-01', runs: 2, partial: 0, searches_short: 0 },
    ])
    const again = await runComparabilityTask(f.client, args)
    expect(again.status).toBe('held')
    expect(f.tables.month_pair_comparability).toHaveLength(1)
  })

  it('refuses a pair no update has read, and writes nothing', async () => {
    const f = fakeAdmin({
      tables: { ...base(), month_pair_comparability: [], config_change_reach: [] },
      rpc: { market_month_videos: () => [] },
    })
    const o = await runComparabilityTask(f.client, { clientId: 'sealand', runId: RUN, now: NOW, task: { kind: 'pair', prevMonth: '2026-11-01', month: '2026-12-01' }, log: () => {} })
    expect(o.status).toBe('refused')
    expect(f.tables.month_pair_comparability).toEqual([])
  })
})

describe('the weekly keep inside the step (WP3.13, through mf/s3-weekline\'s one keep store)', () => {
  // The production schedule's stand-in Sunday updates, and staging's week of
  // 31 Aug RE-DATED to the weeks asked (HYPOTHETICAL, as lib/reading/week-keep.test.ts
  // does): production's weeks from 28 Sep are not knowable yet.
  const SUNDAYS_TO_25_OCT = ['2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25']
  // run ids are uuids in the store (a label is refused): one per stand-in Sunday
  const runs = standInSundayRuns(SUNDAYS_TO_25_OCT).map((r, i) => ({ ...r, id: `00000000-0000-4000-8000-00000000102${i}` }))
  const running = runs[runs.length - 1]
  const AUG31 = STAGING_WEEK_VOLUMES.filter((r) => r.week === '2026-08-31')
  const raw = (week: string) => AUG31.map((r) => ({
    week, audience: r.audience, videos: r.videos, comments: r.comments, comments_next_month: r.commentsNextMonth, under_5: r.under5,
    median_dated: r.medianDated, mean_dated: r.meanDated, older_videos: r.olderVideos, unchecked: r.unchecked,
  }))
  const admin = () => fakeAdmin({
    tables: {
      pipeline_runs: tenant(runs.map((r, i) => ({ id: r.id, status: i === runs.length - 1 ? 'running' : 'completed', started_at: r.startedAt, completed_at: i === runs.length - 1 ? null : r.finishedAt }))),
      ai_call_log: tenant([{ pass: 'pass_a', prompt_version: 'pass_a_v4.1', created_at: '2026-10-25T05:00:00.000Z' }]),
      week_line_reads: [], week_line_points: [],
    },
    rpc: {
      market_week_volumes: (p) => {
        const out = []
        for (let w = Date.parse(`${p.p_from}T00:00:00Z`); w < Date.parse(`${p.p_to}T00:00:00Z`); w += 7 * 86_400_000) out.push(...raw(new Date(w).toISOString().slice(0, 10)))
        return out
      },
      market_week_readings: () => [...STAGING_AUG31_READINGS],
    },
  })

  it('the lane rule is the Monday script\'s (scripts/week-points.ts LANE_RULE)', () => {
    expect(WEEK_LANE_RULE).toBe('min_comments:default=5,reddit=3')
  })

  it('keeps each week that reached its age on this run, and a second keep inserts nothing', async () => {
    const f = admin()
    const now = '2026-10-25T08:00:00.000Z'
    const first = await keepWeeksInRun(f.client, { clientId: SEALAND_CLIENT_ID, runId: running.id, now })
    expect(first.inserted).toBe(2)
    expect(f.tables.week_line_reads.map((r) => `${r.week}@${r.age_days} ${r.read_through_run}`)).toEqual([
      `2026-09-28@21 ${running.id}`, `2026-10-05@14 ${running.id}`,
    ])
    expect(f.tables.week_line_points.length).toBeGreaterThan(0)
    const points = f.tables.week_line_points.length
    const again = await keepWeeksInRun(f.client, { clientId: SEALAND_CLIENT_ID, runId: running.id, now })
    expect(again.inserted).toBe(0)
    expect(f.tables.week_line_reads).toHaveLength(2)
    expect(f.tables.week_line_points).toHaveLength(points)
  })

  it('keeps nothing for a tenant with no same-age line, and is a no-op before MF4', async () => {
    expect((await keepWeeksInRun(admin().client, { clientId: OSSUR_CLIENT_ID, runId: 'r', now: '2026-10-25T08:00:00.000Z' })).note)
      .toBe('no same-age line for this tenant (no WEEK_LINE entry)')
    const bare = fakeAdmin({ tables: { pipeline_runs: [] } })
    expect((await keepWeeksInRun(bare.client, { clientId: SEALAND_CLIENT_ID, runId: 'r', now: '2026-10-25T08:00:00.000Z' })).inserted).toBe(0)
  })

  it('the weeks task runs the keeper handed in', async () => {
    const f = admin()
    const o = await runComparabilityTask(f.client, { clientId: SEALAND_CLIENT_ID, runId: running.id, now: '2026-10-25T08:00:00.000Z', task: { kind: 'weeks' }, keepWeeks: keepWeeksInRun, log: () => {} })
    expect(o.status).toBe('written')
  })
})
