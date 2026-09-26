import { describe, expect, it } from 'vitest'

import { fakeAdmin } from '../test/s3-run-fake-admin'
import { provenanceRows, recordGatherSurfacings, surfacingRows } from './surfacings'

// Gather-time provenance and surfacings (WP3.4). Terms are Sealand's search set
// since 20 Sep and a community harvest (GC F28); ids are labels.

const FRESH = [
  { video_id: 'tt-7401', source_keywords: ['handmade bag', 'upcycled bag'] },
  { video_id: 'rd-1ab2', source_keywords: ['r/onebag', 'travel gear'] },
]
const RESURFACED = [{ video_id: 'tt-6002', source_keywords: ['sealand gear'] }]
const idOf = new Map([['tt-7401', 'v1'], ['rd-1ab2', 'v2'], ['tt-6002', 'v3']])

describe('the rows', () => {
  it('an exact first find for each fresh kept video, terms and communities apart', () => {
    expect(provenanceRows({ clientId: 'sealand', runId: 'run-2026-11-08', storedAt: '2026-11-08T04:20:00.000Z', fresh: FRESH, idOf })).toEqual([
      { client_id: 'sealand', video_id: 'v1', first_run_id: 'run-2026-11-08', first_stored_at: '2026-11-08T04:20:00.000Z', first_terms: ['handmade bag', 'upcycled bag'], first_subreddits: [], method: 'exact', evidence: 'gather' },
      { client_id: 'sealand', video_id: 'v2', first_run_id: 'run-2026-11-08', first_stored_at: '2026-11-08T04:20:00.000Z', first_terms: ['travel gear'], first_subreddits: ['r/onebag'], method: 'exact', evidence: 'gather' },
    ])
  })

  it('a surfacing row for every surfaced video, fresh or resurfaced, once each', () => {
    const rows = surfacingRows({ clientId: 'sealand', runId: 'run-2026-11-08', surfaced: [...FRESH, ...RESURFACED, RESURFACED[0]], idOf })
    expect(rows.map((r) => `${r.video_id} ${r.terms.join('+')} ${r.subreddits.join('+')}`)).toEqual([
      'v1 handmade bag+upcycled bag ', 'v2 travel gear r/onebag', 'v3 sealand gear ',
    ])
  })

  it('a video with no stored id gets no row', () => {
    expect(provenanceRows({ clientId: 'sealand', runId: null, storedAt: 'x', fresh: [{ video_id: 'unknown' }], idOf })).toEqual([])
  })
})

describe('the write', () => {
  const videos = () => [...idOf].map(([video_id, id]) => ({ id, video_id, client_id: 'sealand', platform: 'tiktok' }))
  const args = { clientId: 'sealand', runId: 'run-2026-11-08', platform: 'tiktok', storedAt: '2026-11-08T04:20:00.000Z', fresh: FRESH, surfaced: [...FRESH, ...RESURFACED] }

  it('writes both, and a replay of the step adds nothing', async () => {
    const f = fakeAdmin({ tables: { videos: videos(), video_provenance: [], video_surfacings: [] } })
    const r = await recordGatherSurfacings(f.client, args)
    expect(r).toEqual({ provenance: 2, surfacings: 3, errors: [] })
    await recordGatherSurfacings(f.client, args)
    expect(f.tables.video_provenance).toHaveLength(2)
    expect(f.tables.video_surfacings).toHaveLength(3)
    expect(f.tables.video_provenance.every((p) => p.method === 'exact' && p.evidence === 'gather')).toBe(true)
  })

  it('never rewrites a held first find (a video first found by an earlier run keeps it)', async () => {
    const held = { client_id: 'sealand', video_id: 'v1', first_run_id: 'run-2026-10-04', first_terms: ['upcycled bag'], first_subreddits: [], method: 'reconstructed', evidence: 'gate_verdicts' }
    const f = fakeAdmin({ tables: { videos: videos(), video_provenance: [held], video_surfacings: [] } })
    await recordGatherSurfacings(f.client, args)
    expect(f.tables.video_provenance.find((p) => p.video_id === 'v1')).toEqual(held)
  })

  it('is a quiet no-op before MF1 and MF3', async () => {
    const f = fakeAdmin({ tables: { videos: videos() } })
    expect(await recordGatherSurfacings(f.client, args)).toEqual({ provenance: 'not_applied', surfacings: 'not_applied', errors: [] })
  })

  it('a refused write is counted on the gather\'s errors, never thrown', async () => {
    const f = fakeAdmin({ tables: { videos: videos(), video_provenance: [], video_surfacings: [] }, refuse: { video_surfacings: () => ({ message: 'permission denied for table video_surfacings_x' }) } })
    const r = await recordGatherSurfacings(f.client, args)
    expect(r.provenance).toBe(2)
    expect(r.errors).toEqual(['video_surfacings not recorded: permission denied for table video_surfacings_x'])
  })
})
