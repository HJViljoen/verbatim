import { describe, expect, it, vi } from 'vitest'

// The relevance module builds the OpenAI client at import; the heuristic gate
// never calls it, and neither does anything here (no spend: decision L).
const h = vi.hoisted(() => ({ parse: vi.fn(async () => { throw new Error('no model call on the $0 path') }) }))
vi.mock('../openai', () => ({ openai: { chat: { completions: { parse: h.parse } } } }))

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { fakeAdmin } from '../test/s3-run-fake-admin'
import { LABEL_SEGMENTS_STAGING } from '../test/s3-run-segments'
import { planSegmentVideos, runSegmentBatch, v1Label, type SegmentVideo } from './segment-videos'

// The segment-videos step (WP3.2, deploy 4): segments_v1 rule rows for the
// run's new videos at $0, the same labels scripts/label-segments.ts wrote on
// the 26 Sep staging rehearsal (lib/test/s3-run-segments.ts), and no model call
// on any path while SEGMENT_JUDGE_ENABLED is off.

const asVideo = (v: (typeof LABEL_SEGMENTS_STAGING)[number]): SegmentVideo => ({
  id: v.id, platform: v.platform, video_id: `pid-${v.id.slice(0, 8)}`, caption: v.caption, hashtags: v.hashtags,
  topics: v.topics, source_keywords: v.sourceKeywords, account_name: null,
})

describe('the v1 label', () => {
  it('is label-segments\' own output, reason for reason, on its staging sheet', () => {
    for (const v of LABEL_SEGMENTS_STAGING) {
      expect(v1Label(asVideo(v), undefined, v.unjudged).reason, v.id).toBe(v.reason)
    }
    // the sheet holds every path: the maker words, a bare name, the market,
    // and both unjudged outcomes (noise by the heuristic gate, and kept)
    const reasons = new Set(LABEL_SEGMENTS_STAGING.map((v) => (v.reason ?? 'market').split(':')[0]))
    expect([...reasons].sort()).toEqual(['bare_name_only', 'maker_regex', 'market', 'unjudged_admission'])
    expect(LABEL_SEGMENTS_STAGING.some((v) => v.reason?.endsWith(';unjudged_admission'))).toBe(true)
  })

  it('first-found terms decide the bare-name rule where provenance holds them', () => {
    const bare = LABEL_SEGMENTS_STAGING.find((v) => v.reason === 'bare_name_only:patagonia')!
    expect(v1Label(asVideo(bare), { first_terms: ['patagonia', 'travel gear'], first_subreddits: [], evidence: 'gather' }, false).segment).toBe('market')
  })
})

const tenant = <T extends object>(rows: T[], clientId = SEALAND_CLIENT_ID) => rows.map((r) => ({ client_id: clientId, ...r }))

describe('the step', () => {
  const videos = () => tenant(LABEL_SEGMENTS_STAGING.map(asVideo))
  const verdicts = () => tenant(LABEL_SEGMENTS_STAGING.filter((v) => v.unjudged).map((v) => ({ platform: v.platform, video_id: `pid-${v.id.slice(0, 8)}`, kept: true, source: 'default' })))

  it('plans only the videos still missing a segments_v1 label', async () => {
    const held = tenant(LABEL_SEGMENTS_STAGING.slice(0, 10).map((v) => ({ video_id: v.id, rule_version: 'segments_v1', method: 'rule' })))
    const f = fakeAdmin({ tables: { video_segments: held, videos: videos() } })
    const plan = await planSegmentVideos(f.client, SEALAND_CLIENT_ID)
    expect(plan.batches.flat().sort()).toEqual(LABEL_SEGMENTS_STAGING.slice(10).map((v) => v.id).sort())
  })

  it('writes one rule row per new video at $0, the labels label-segments wrote, and a replay writes nothing', async () => {
    const f = fakeAdmin({ tables: { video_segments: [], videos: videos(), video_provenance: [], gate_verdicts: verdicts() } })
    const ids = LABEL_SEGMENTS_STAGING.map((v) => v.id)
    const judge = vi.fn()
    const r = await runSegmentBatch(f.client, { clientId: SEALAND_CLIENT_ID, runId: 'run-2026-11-08', ids, judge })
    expect(r.written).toBe(16)
    expect(r.judge).toBe('off')
    expect(r.costUsd).toBe(0)
    expect(judge).not.toHaveBeenCalled()
    expect(h.parse).not.toHaveBeenCalled()
    const byId = new Map(f.tables.video_segments.map((s) => [s.video_id, s]))
    for (const v of LABEL_SEGMENTS_STAGING) {
      expect(byId.get(v.id)).toMatchObject({ rule_version: 'segments_v1', method: 'rule', reason: v.reason })
    }
    const again = await runSegmentBatch(f.client, { clientId: SEALAND_CLIENT_ID, runId: 'run-2026-11-08', ids })
    expect(again.written).toBe(0)
    expect(f.tables.video_segments).toHaveLength(16)
  })

  it('is a no-op before MF1, and for a tenant with no segment rule', async () => {
    expect((await planSegmentVideos(fakeAdmin({ tables: { videos: videos() } }).client, SEALAND_CLIENT_ID)).batches).toEqual([])
    const f = fakeAdmin({ tables: { video_segments: [], videos: videos() } })
    expect((await planSegmentVideos(f.client, OSSUR_CLIENT_ID)).batches).toEqual([])
  })
})
