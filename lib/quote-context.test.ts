import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { readQuoteContext } from './quote-context'

// Two facts about the gate's context read, each a bug the check pass found
// (29 Sep): the memo is one tenant's (a script or a send loop can hold one
// service-role client across tenants, and a platform video id is not unique
// across them), and an evidence row on the video itself names it by
// `videos.id` (`source_video_id` references it), so a post's own words and a
// transcript line resolve to their video instead of failing closed.
//
// The fake answers exactly the three calls the read makes — from, select, eq,
// in — over rows held in memory. Nothing else is stood in for.

type Row = Record<string, unknown>

function fakeDb(tables: Record<string, Row[]>): SupabaseClient {
  const query = (table: string) => {
    const filters: ((r: Row) => boolean)[] = []
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => { filters.push((r) => r[col] === v); return q },
      in: (col: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[col])); return q },
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
        resolve({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }),
    }
    return q
  }
  return { from: query } as unknown as SupabaseClient
}

const video = (over: Row): Row => ({
  platform: 'tiktok', account_name: 'someone', caption: 'my bag', hashtags: [], topics: [], is_client: false,
  is_competitor: false, competitor_name: null, source: 'discovered', ...over,
})

describe('readQuoteContext', () => {
  it('keeps one tenant’s videos from answering for another’s on the same client', async () => {
    const db = fakeDb({
      videos: [
        video({ id: 'a-1', client_id: 'A', video_id: 'shared', is_competitor: true, competitor_name: 'Cotopaxi' }),
        video({ id: 'b-1', client_id: 'B', video_id: 'shared' }),
      ],
    })
    const a = await readQuoteContext(db, 'A', { videos: [{ platform: 'tiktok', videoId: 'shared' }] })
    expect(a.forVideo('tiktok', 'shared')?.competitorName).toBe('Cotopaxi')
    const b = await readQuoteContext(db, 'B', { videos: [{ platform: 'tiktok', videoId: 'shared' }] })
    expect(b.forVideo('tiktok', 'shared')?.competitorName ?? null).toBeNull()
  })

  it('resolves an evidence row on the video itself by the video’s row id', async () => {
    const db = fakeDb({
      insight_evidence: [{ id: 'ev-post', comment_id: null, source_video_id: 'row-7', comments: null }],
      videos: [video({ id: 'row-7', client_id: 'A', platform: 'reddit', video_id: '1wabc', account_name: 'r/onebag' })],
    })
    const ctx = await readQuoteContext(db, 'A', { evidenceIds: ['ev-post'] })
    expect(ctx.forEvidence('ev-post')?.videoId).toBe('1wabc')
    expect(ctx.commentOfEvidence('ev-post')).toBeNull()
  })
})
