import { describe, expect, it, vi } from 'vitest'

// The relevance module builds the OpenAI client at import; the heuristic gate
// never calls it, and neither does anything here (no spend: decision L).
const h = vi.hoisted(() => ({ parse: vi.fn(async () => { throw new Error('no model call on the $0 path') }), judgeOn: false }))
vi.mock('../openai', () => ({ openai: { chat: { completions: { parse: h.parse } } } }))
// SEGMENT_JUDGE_ENABLED is off for every tenant (pinned in lib/config.test.ts);
// the one test of the judge's branch turns it on here, and mocks the model.
vi.mock('../config', async (orig) => {
  const real = await orig<typeof import('../config')>()
  return { ...real, segmentJudgeEnabled: (id: string) => (h.judgeOn ? true : real.segmentJudgeEnabled(id)) }
})

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { fakeAdmin } from '../test/s3-run-fake-admin'
import { LABEL_SEGMENTS_STAGING } from '../test/s3-run-segments'
import { planSegmentVideos, runSegmentBatch, segmentJudgeFor, stepSegmentJudge, v1Label, type SegmentVideo } from './segment-videos'

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

describe('the judge branch (segments_v2), with the switch and the model mocked', () => {
  const videos = () => tenant(LABEL_SEGMENTS_STAGING.slice(0, 3).map(asVideo))
  // A stand-in for the model: the first video a maker, the rest buyers.
  const client = () => ({
    chat: { completions: { parse: vi.fn(async (req: { messages: { content: string }[] }) => {
      const n = (req.messages[1].content.match(/^\[\d+\]/gm) ?? []).length
      return {
        usage: { prompt_tokens: 900, completion_tokens: 90 },
        choices: [{ message: { parsed: { verdicts: Array.from({ length: n }, (_, i) => ({ index: i, role: i === 0 ? 'maker' : 'buyer', why: 'w' })) } } }],
      }
    }) } },
  })

  it('is never built while the switch is off', async () => {
    const f = fakeAdmin({ tables: { tracking_configs: [] } })
    expect(await stepSegmentJudge(f.client, SEALAND_CLIENT_ID, 'run-2026-11-08', client() as never)).toBeNull()
  })

  it('on: writes a judge row per judged video beside the rule rows, logs the call, and never judges a video twice', async () => {
    h.judgeOn = true
    try {
      const f = fakeAdmin({ tables: { video_segments: [], videos: videos(), video_provenance: [], gate_verdicts: [], ai_call_log: [], tracking_configs: tenant([{ exclude_terms: [] }]) } })
      const c = client()
      const judge = segmentJudgeFor(f.client, { clientId: SEALAND_CLIENT_ID, runId: 'run-2026-11-08', client: c as never })
      const ids = LABEL_SEGMENTS_STAGING.slice(0, 3).map((v) => v.id)
      const r = await runSegmentBatch(f.client, { clientId: SEALAND_CLIENT_ID, runId: 'run-2026-11-08', ids, judge })
      expect(r.judge).toBe('on')
      expect(r.judged).toBe(3)
      expect(r.costUsd).toBeGreaterThan(0)
      expect(f.tables.video_segments.filter((x) => x.method === 'judge').map((x) => `${x.rule_version} ${x.segment} ${x.reason}`)).toEqual([
        'segments_v2 maker judge_role:maker', 'segments_v2 market judge_role:buyer', 'segments_v2 market judge_role:buyer',
      ])
      expect(f.tables.video_segments.filter((x) => x.method === 'rule')).toHaveLength(3)
      expect(f.tables.ai_call_log).toHaveLength(1)
      await runSegmentBatch(f.client, { clientId: SEALAND_CLIENT_ID, runId: 'run-2026-11-08', ids, judge })
      expect(c.chat.completions.parse).toHaveBeenCalledTimes(1)
      expect(h.parse).not.toHaveBeenCalled()
      expect((await planSegmentVideos(fakeAdmin({ tables: { video_segments: [], videos: tenant(LABEL_SEGMENTS_STAGING.map(asVideo)) } }).client, SEALAND_CLIENT_ID)).batches[0]).toHaveLength(16)
    } finally {
      h.judgeOn = false
    }
  })
})

