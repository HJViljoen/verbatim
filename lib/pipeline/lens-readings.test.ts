import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import { fakeAdmin } from '../test/s3-run-fake-admin'
import { gatherRows, runsThrough, SUNDAYS } from '../test/s3-run-updates'
import { lensMonths, planLensReadings, runLensMonth } from './lens-readings'

// The deploy-4 `lens-readings` step (WP3.3): the months it reads, its no-op
// before MF3, and a month that freezes in the same run written frozen, which a
// second visit leaves alone. Counts are Sealand's staging figures (the
// category's 626 September videos, praise 450; decision E); ids are labels.

const t = <T extends object>(rows: T[]) => rows.map((r) => ({ client_id: SEALAND_CLIENT_ID, ...r }))

describe('the months', () => {
  it('the 6 Dec run reads October (it freezes now), November and December', () => {
    expect(lensMonths('2026-12-06T07:00:00.000Z', ['2026-10-01', '2026-11-01'], [])).toEqual(['2026-10-01', '2026-11-01', '2026-12-01'])
  })
  it('a month whose lens rows are still filling is visited, so its visit can freeze them', () => {
    expect(lensMonths('2026-12-13T07:00:00.000Z', ['2026-11-01'], ['2026-10-01'])).toEqual(['2026-10-01', '2026-11-01', '2026-12-01'])
  })
})

describe('the step', () => {
  it('is a no-op before MF3', async () => {
    const f = fakeAdmin({ tables: {} })
    expect((await planLensReadings(f.client, SEALAND_CLIENT_ID, '2026-11-08T07:00:00.000Z')).months).toEqual([])
    const r = await runLensMonth(f.client, { clientId: SEALAND_CLIENT_ID, runId: 'run-2026-11-08', now: '2026-11-08T07:00:00.000Z', month: '2026-10-01' })
    expect(r.status).toBe('skipped')
    expect(f.writes).toEqual([])
  })

  const lensRows = (ids: unknown) => (ids == null
    ? [{ audience: 'industry-other', object_kind: 'denominator', object_id: 'videos', k: 626, n: 626 }, { audience: 'industry-other', object_kind: 'kind', object_id: 'praise', k: 450, n: 626 }]
    : [{ audience: 'industry-other', object_kind: 'denominator', object_id: 'videos', k: (ids as string[]).length, n: (ids as string[]).length }])

  const admin = () => fakeAdmin({
    tables: {
      month_lens_readings: [],
      month_denominators: t([{ month: '2026-10-01', audience: 'industry-other', status: 'filling' }]),
      // v1 was found by a search that has run unchanged since 20 Sep; v2 by nothing held
      videos: t([
        { id: 'v1', platform: 'tiktok', video_id: 'tt-1', source_keywords: ['upcycled bag'], first_seen: '2026-10-04T04:20:00Z', analyzed_lane: 'full' },
        { id: 'v2', platform: 'tiktok', video_id: 'tt-2', source_keywords: [], first_seen: '2026-10-11T04:20:00Z', analyzed_lane: 'full' },
      ]),
      gate_verdicts: [], video_provenance: [],
      keyword_performance: t(SUNDAYS.filter((d) => d <= '2026-12-06').flatMap((d) => gatherRows(d))),
      pipeline_runs: t(runsThrough('2026-12-06', true)),
    },
    rpc: {
      market_month_videos: () => [
        { video_id: 'v1', audience: 'industry-other', platform: 'tiktok', dated_comments: 23 },
        { video_id: 'v2', audience: 'industry-other', platform: 'tiktok', dated_comments: 4 },
      ],
      segments_for_videos: () => [{ video_id: 'v1', segment: 'market' }, { video_id: 'v2', segment: 'maker' }],
      lens_readings: (p) => lensRows(p.p_video_ids),
    },
  })

  it('writes October frozen on the run that freezes it, before freeze-months writes its marker, and a second visit rewrites nothing', async () => {
    const f = admin()
    const args = { clientId: SEALAND_CLIENT_ID, runId: 'run-2026-12-06', now: '2026-12-06T07:00:00.000Z', month: '2026-10-01' }
    const r = await runLensMonth(f.client, args)
    expect(r.status).toBe('written')
    const rows = f.tables.month_lens_readings
    expect(new Set(rows.map((x) => x.lens))).toEqual(new Set(['market', 'buyers', 'makers', 'all_but_noise', 'dense20', 'same_searches:2026-09']))
    expect(rows.every((x) => x.status === 'frozen' && x.frozen_at === args.now && x.rule_version === 'segments_v1')).toBe(true)
    expect(rows.find((x) => x.lens === 'market' && x.object_kind === 'kind')).toMatchObject({ k: 450, n: 626 })
    const again = await runLensMonth(f.client, { ...args, now: '2026-12-13T07:00:00.000Z', runId: 'run-2026-12-13' })
    expect(again.written).toBe(0)
    expect(again.keptFrozen).toBe(rows.length)
  })

  it('writes a filling month as filling', async () => {
    const f = admin()
    await runLensMonth(f.client, { clientId: SEALAND_CLIENT_ID, runId: 'run-2026-11-08', now: '2026-11-08T07:00:00.000Z', month: '2026-10-01' })
    expect(f.tables.month_lens_readings.every((x) => x.status === 'filling' && x.frozen_at === null && x.origin === 'live')).toBe(true)
  })
})
