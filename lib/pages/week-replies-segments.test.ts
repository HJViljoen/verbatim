import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import { quoteTextHash } from '../quote-text'
import { cleanQuote } from '../quotes'
import { fakeDb } from '../test/fake-db'
import { buildReplies } from './week'

// The reply list's segments read (9 Nov, the live-data bugs): MF1 grants
// `segments_for_videos` to the service role alone (it is SECURITY DEFINER and
// takes the tenant as a parameter), so the session client the Content pages
// hand `buildReplies` is refused it ("permission denied for function
// segments_for_videos"), the queue fails open, and a comment under a video the
// reader precedence marks noise is offered as worth a reply. The segments are
// read on the service-role client the caller passes; everything else stays on
// the session's.

const CLIENT = SEALAND_CLIENT_ID
const WINDOW = { from: '2026-10-04T04:03:00.000Z', to: '2026-10-11T04:02:00.000Z', basis: 'content' as const }
const DENIED = { error: { code: '42501', message: 'permission denied for function segments_for_videos' } }

function tables() {
  const videos = Array.from({ length: 4 }, (_, i) => ({
    id: `vrow-${i}`, client_id: CLIENT, video_id: `nv${i}`, platform: 'tiktok', video_url: `https://x.example/${i}`,
    account_name: i === 0 ? 'offtopicvolcano' : `creator${i}`, topics: ['travel backpack'], source: 'discovered', is_client: false, is_competitor: false, competitor_name: null,
  }))
  const insights: Record<string, unknown>[] = []
  const evidence: Record<string, unknown>[] = []
  const comments: Record<string, unknown>[] = []
  for (let j = 0; j < 8; j++) {
    const v = videos[j % 4]
    insights.push({ id: `ins-${j}`, client_id: CLIENT, category: 'question', theme: 'backpack_buying_questions', description: 'd', strength_score: 5 })
    comments.push({ id: `cm-${j}`, client_id: CLIENT, author: `@a${j}`, text: `Where can I buy this backpack in the grey colour please? (${j})`, likes: j, comment_date: `2026-10-0${5 + (j % 4)}T10:00:00.000Z`, platform: v.platform, video_id: v.video_id, comment_id: `n${j}` })
    evidence.push({ id: `ev-${j}`, audience_insight_id: `ins-${j}`, comment_id: `cm-${j}`, source: 'comment', source_video_id: v.id })
  }
  return {
    audience_insights_current: insights, insight_evidence: evidence, comments, videos,
    tracking_configs: [{ client_id: CLIENT, own_handles: {}, brand_keywords: ['sealand'], competitor_keywords: [], industry_keywords: ['backpack'] }],
    comment_translations: comments.map((c) => ({ comment_id: c.id, text_hash: quoteTextHash(cleanQuote(String(c.text))), language: 'en', english: String(c.text) })),
  }
}

const noiseOnFirst = (args: Record<string, unknown>) => (args.p_video_ids as string[]).map((id) => ({ video_id: id, segment: id === 'vrow-0' ? 'noise' : 'market', labelled: false }))

describe('the reply list reads the segments on the service role', () => {
  it('skips the comments under a noise video when the session client is refused the function', async () => {
    const session = fakeDb(tables(), { segments_for_videos: () => DENIED })
    const admin = fakeDb({}, { segments_for_videos: noiseOnFirst })
    const block = await buildReplies({ supabase: session.client as never, admin: admin.client as never, clientId: CLIENT, runId: 'run-1', window: WINDOW, videos: Promise.resolve([]), gate: true })
    expect(block.unread).toBeNull()
    expect(block.total).toBeGreaterThan(0)
    // The segments were asked of the service role, never of the session.
    expect(admin.calls.filter((c) => c.table === 'segments_for_videos')).toHaveLength(1)
    expect(session.calls.filter((c) => c.table === 'segments_for_videos')).toEqual([])
    // Every other read stayed on the session's client.
    expect(admin.calls.filter((c) => c.op !== 'rpc')).toEqual([])
    // No row is a comment under the noise video.
    const offered = [...block.rows, ...block.flagged]
    expect(offered.length).toBeGreaterThan(0)
    for (const r of offered) expect(r.context).not.toContain('offtopicvolcano')
  })

  it('reads them on the one client where no service role is passed (a script, a send)', async () => {
    const db = fakeDb(tables(), { segments_for_videos: noiseOnFirst })
    const block = await buildReplies({ supabase: db.client as never, clientId: CLIENT, runId: 'run-1', window: WINDOW, videos: Promise.resolve([]), gate: true })
    expect(db.calls.filter((c) => c.table === 'segments_for_videos')).toHaveLength(1)
    for (const r of [...block.rows, ...block.flagged]) expect(r.context).not.toContain('offtopicvolcano')
  })
})
