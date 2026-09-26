import { describe, expect, it } from 'vitest'

import { fakeAdmin } from '../test/s3-run-fake-admin'
import { gatherRows, runId, runsThrough, SUNDAYS } from '../test/s3-run-updates'
import { planComparability, runComparabilityTask, taskLabel } from './comparability-step'

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
