import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeAdmin, type FakeAdmin } from '../test/s3-run-fake-admin'

// The discovery pause (decision I; WP3.4, deploy 4): while a tenant's tracking
// is locked, our own discovery neither promotes nor demotes a community for
// it, spends nothing, and logs what it would have done. Sealand's three
// communities (GC F28) and one queued candidate; the strike rule reads the
// last Reddit gather's yields (r/backpacks and r/travelgear barren a third time
// while r/onebag kept 4; SUBREDDIT_STRIKE_LIMIT is 3).

const h = vi.hoisted(() => ({ admin: null as FakeAdmin | null, probe: vi.fn(), parse: vi.fn() }))
vi.mock('../supabase-admin', async (orig) => ({ ...(await orig<object>()), createAdminClient: () => h.admin!.client }))
vi.mock('./subreddit-probe', () => ({ probeSubreddits: h.probe }))
vi.mock('../openai', () => ({ openai: { chat: { completions: { parse: h.parse } } } }))

import { SEALAND_CLIENT_ID, OSSUR_CLIENT_ID } from '../config'
import { discoverSubreddits } from './subreddit-discovery'
import type { GatherConfig, SubredditEntry } from './types'

const COMMUNITIES: SubredditEntry[] = [
  { name: 'backpacks', status: 'active', discovered_at: '2026-08-17', strikes: 2 },
  { name: 'onebag', status: 'active', discovered_at: '2026-09-09' },
  { name: 'travelgear', status: 'active', discovered_at: '2026-09-09', strikes: 2 },
  { name: 'ultralight', status: 'candidate', discovered_at: '2026-09-20' },
]
const config = (subreddits: SubredditEntry[]): GatherConfig => ({
  brand_keywords: ['sealand gear'], competitor_keywords: [], competitor_names: ['Cotopaxi'], industry_keywords: ['upcycled bag'],
  exclude_terms: [], platforms: ['reddit'], max_videos: 25, comment_depth: 50, report_period: 'weekly', own_handles: {}, subreddits,
})
const yields = (clientId: string) => [
  { client_id: clientId, platform: 'reddit', run_id: 'run-2026-11-01', keyword: 'r/backpacks', gate_survived: 0, created_at: '2026-11-01T04:12:00Z' },
  { client_id: clientId, platform: 'reddit', run_id: 'run-2026-11-01', keyword: 'r/onebag', gate_survived: 4, created_at: '2026-11-01T04:12:00Z' },
  { client_id: clientId, platform: 'reddit', run_id: 'run-2026-11-01', keyword: 'r/travelgear', gate_survived: 0, created_at: '2026-11-01T04:12:00Z' },
]

describe('the discovery pause', () => {
  beforeEach(() => { h.probe.mockReset(); h.parse.mockReset() })

  it('a locked tenant: nothing promoted, demoted, struck, probed or proposed, and the log says what would have happened', async () => {
    h.admin = fakeAdmin({ tables: { keyword_performance: yields(SEALAND_CLIENT_ID), tracking_configs: [{ client_id: SEALAND_CLIENT_ID, subreddits: COMMUNITIES }] } })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const out = await discoverSubreddits({ clientId: SEALAND_CLIENT_ID, runId: 'run-2026-11-08', config: config(COMMUNITIES), today: '2026-11-08' })
    const lines = log.mock.calls.map((c) => String(c[0]))
    log.mockRestore()
    expect(out).toEqual(COMMUNITIES)
    expect(h.admin.writes).toEqual([])
    expect(h.probe).not.toHaveBeenCalled()
    expect(h.parse).not.toHaveBeenCalled()
    expect(lines.find((l) => l.includes('discovery paused'))).toBe(
      '[reddit] discovery paused: tracking is locked for this tenant (decision I), so no community is promoted or demoted; ' +
      'would have demoted r/backpacks, r/travelgear to a candidate; would have probed r/ultralight (a promotion if it passed); would have proposed new communities',
    )
  })

  it('an unlocked tenant is not paused: the same yields demote and the write is made', async () => {
    h.admin = fakeAdmin({ tables: { keyword_performance: yields(OSSUR_CLIENT_ID), tracking_configs: [{ client_id: OSSUR_CLIENT_ID, subreddits: COMMUNITIES }], config_changes: [] } })
    h.probe.mockImplementation(async ({ candidates }: { candidates: SubredditEntry[] }) => candidates)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const four = [...COMMUNITIES, { name: 'onebagtravel', status: 'candidate' as const, discovered_at: '2026-09-20' }, { name: 'packing', status: 'candidate' as const, discovered_at: '2026-09-20' }]
    await discoverSubreddits({ clientId: OSSUR_CLIENT_ID, runId: 'run-2026-11-08', config: config(four), today: '2026-11-08' })
    log.mockRestore()
    expect(h.probe).toHaveBeenCalled()
    expect(h.admin.writes.some((w) => w.table === 'tracking_configs' && w.op === 'update')).toBe(true)
  })
})
