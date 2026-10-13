import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import { quoteTextHash } from '../quote-text'
import { cleanQuote } from '../quotes'
import { fakeDb } from '../test/fake-db'
import { buildReplies } from './week'

// The reply list's reads (Content and This week; Phase 4 fix round). Sealand's
// Content load was 143 statements on 13 Oct, 99 of them this list reading
// every cited comment by id. Bounded by the window it reads, the list is the
// same and the reads are a chunk of evidence (with its comments) per 250
// insights, the videos, the translations and one segments call: no comment is
// read by id, and the segments read reuses what the candidates carry.
//
// On a tenant sized like Sealand's dump the list's statements are pinned
// below (24 for the week, 26 for the month); the 117 before the fix round
// was measured offline once, on the same tenant with the old code.

const CLIENT = SEALAND_CLIENT_ID
const WINDOW = { from: '2026-10-04T04:03:00.000Z', to: '2026-10-11T04:02:00.000Z', basis: 'content' as const }

function tables() {
  const videos = Array.from({ length: 60 }, (_, i) => ({
    id: `vrow-${i}`, client_id: CLIENT, video_id: `nv${i}`, platform: ['tiktok', 'instagram', 'youtube'][i % 3], video_url: `https://x.example/${i}`,
    account_name: `creator${i}`, topics: ['travel backpack'], source: 'discovered', is_client: false, is_competitor: false, competitor_name: null,
  }))
  const insights: Record<string, unknown>[] = []
  const evidence: Record<string, unknown>[] = []
  const comments: Record<string, unknown>[] = []
  let j = 0
  for (let i = 0; i < 300; i++) {
    insights.push({ id: `ins-${i}`, client_id: CLIENT, category: ['question', 'purchase_intent', 'objection'][i % 3], theme: 'backpack_buying_questions', description: 'd', strength_score: (i % 9) + 1 })
    for (let k = 0; k < 2; k++, j++) {
      const r = (j * 7919) % 100
      const date = r < 10 ? `2026-10-0${5 + (r % 4)}T10:00:00.000Z` : `2026-08-1${r % 9}T10:00:00.000Z`
      const text = `Where can I buy this backpack in the grey colour please? (${j})`
      comments.push({ id: `cm-${j}`, client_id: CLIENT, author: '@a', text, likes: j % 5, comment_date: date, platform: videos[j % 60].platform, video_id: videos[j % 60].video_id, comment_id: `n${j}` })
      evidence.push({ id: `ev-${j}`, audience_insight_id: `ins-${i}`, comment_id: `cm-${j}`, source: 'comment', source_video_id: videos[j % 60].id })
    }
  }
  return {
    audience_insights_current: insights, insight_evidence: evidence, comments, videos,
    tracking_configs: [{ client_id: CLIENT, own_handles: {}, brand_keywords: ['sealand'], competitor_keywords: [], industry_keywords: ['backpack'] }],
    comment_translations: comments.map((c) => ({ comment_id: c.id, text_hash: quoteTextHash(cleanQuote(String(c.text))), language: 'en', english: String(c.text) })),
  }
}

describe('the reply list\'s reads', () => {
  it('reads no comment by id, and a chunk of evidence with its comments per 250 insights', async () => {
    const db = fakeDb(tables(), { segments_for_videos: () => [] })
    const block = await buildReplies({ supabase: db.client as never, clientId: CLIENT, runId: 'run-1', window: WINDOW, videos: Promise.resolve([]), gate: true })
    expect(block.unread).toBeNull()
    expect(block.total).toBeGreaterThan(0)
    expect(db.calls.filter((c) => c.table === 'comments')).toEqual([])
    expect(db.calls.filter((c) => c.table === 'insight_evidence')).toHaveLength(2)
    // The segments call is made, from the videos the candidates carry.
    expect(db.calls.filter((c) => c.table === 'segments_for_videos')).toHaveLength(1)
    expect(db.calls.length).toBeLessThanOrEqual(12)
    // Every row is a comment written inside the window.
    for (const r of block.rows) expect(r.date! >= WINDOW.from && r.date! < WINDOW.to).toBe(true)
  })
})

// THE FIGURE AGENTS.md QUOTES, PINNED (Phase 4 fix check): on a tenant sized
// like Sealand's 13 Oct dump (2,750 current engage insights, 6,875 cited
// comments, about 6% of them in the week; the dump had 3 pages of insights,
// 28 evidence and 71 comment statements), the list makes 24 statements for
// the week and 26 for the month. The 117 it made before the fix round was
// measured once, offline, on this same tenant with the code at 3abd43be; it
// cannot be re-run here, because that code is gone.
describe('the reply list\'s statements on a Sealand-sized tenant', () => {
  const CATS = ['purchase_intent', 'question', 'objection', 'switching_signal', 'buying_trigger', 'misinformation']
  const TEXTS = [
    'Where can I buy this backpack in the grey colour please?',
    'Does this bag fit under an airline seat as a personal item?',
    'How much is the shipping to Germany for the duffel bag?',
    'Is the zipper waterproof or will my laptop get wet in rain?',
    'I would buy it if it came in a bigger size for a laptop.',
  ]
  function sealandSized() {
    const videos = Array.from({ length: 1500 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, client_id: CLIENT, video_id: `nv${i}`, platform: ['tiktok', 'instagram', 'youtube'][i % 3],
      video_url: `https://example.com/v/${i}`, account_name: `creator${i % 400}`, topics: ['travel backpack'], source: 'discovered', is_client: false,
      is_competitor: false, competitor_name: null,
    }))
    const insights: Record<string, unknown>[] = []
    const evidence: Record<string, unknown>[] = []
    const comments: Record<string, unknown>[] = []
    const DAY = 86_400_000
    const t0 = Date.parse('2026-06-01T00:00:00Z')
    let j = 0
    for (let i = 0; i < 2750; i++) {
      insights.push({ id: `i${i}`, client_id: CLIENT, category: CATS[i % CATS.length], theme: 'backpack_buying_questions', description: 'Where to buy', strength_score: (i % 9) + 1 })
      for (let k = 0; k < (i % 2 ? 3 : 2); k++, j++) {
        const v = videos[j % videos.length]
        const r = (j * 7919) % 1000
        const date = r < 60 ? new Date(Date.parse('2026-10-04T06:00:00Z') + (r % 6) * DAY).toISOString()
          : r < 70 ? '2026-10-11T09:00:00.000Z'
          : new Date(t0 + (r % 120) * DAY).toISOString()
        comments.push({ id: `c${j}`, client_id: CLIENT, author: `@asker${j}`, text: `${TEXTS[j % TEXTS.length]} (${j})`, likes: j % 17, comment_date: date, platform: v.platform, video_id: v.video_id, comment_id: `native${j}` })
        evidence.push({ id: `e${j}`, client_id: CLIENT, audience_insight_id: `i${i}`, comment_id: `c${j}`, source: 'comment', source_video_id: v.id })
      }
    }
    return {
      audience_insights_current: insights, insight_evidence: evidence, comments, videos,
      tracking_configs: [{ client_id: CLIENT, own_handles: {}, brand_keywords: ['sealand'], competitor_keywords: [], industry_keywords: ['backpack'] }],
      comment_translations: comments.map((c) => ({ comment_id: c.id, text_hash: quoteTextHash(cleanQuote(String(c.text))), language: 'en', english: String(c.text) })),
    }
  }

  it.each([
    ['the week', WINDOW, 24],
    ['the month', { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z', basis: 'content' as const }, 26],
  ])('%s: %s statements, and no comment read by id', async (_label, window, statements) => {
    const db = fakeDb(sealandSized(), { segments_for_videos: () => [] })
    const block = await buildReplies({ supabase: db.client as never, clientId: CLIENT, runId: 'run-1', window, videos: Promise.resolve([]), gate: true })
    expect(block.total).toBe(12)
    expect(block.flagged).toHaveLength(3)
    expect(db.calls).toHaveLength(statements)
    expect(db.calls.filter((c) => c.table === 'insight_evidence')).toHaveLength(11)
    expect(db.calls.filter((c) => c.table === 'comments')).toEqual([])
  })
})
