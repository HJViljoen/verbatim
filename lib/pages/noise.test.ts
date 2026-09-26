import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { SEALAND_CLIENT_ID } from '../config'
import { noiseComments, noiseVideos, RPC_SEGMENTS_FOR_VIDEOS, skipNoise } from './noise'

// This week's noise filter (market-first WP2.7). The reads are stubbed: what
// is tested is which quotes skip, for whom, and what a failed read does.

const OSSUR = 'e52cac94-30e1-426a-9a36-31b11e0b30b6'

interface Call { kind: 'rpc' | 'from'; name: string; args?: unknown }

function stub(tables: Record<string, Record<string, unknown>[]>, segments: { video_id: string; segment: string }[] | Error) {
  const calls: Call[] = []
  const builder = (table: string) => {
    const filters: [string, unknown][] = []
    const b = {
      select: () => b,
      eq: (col: string, v: unknown) => { filters.push([col, v]); return b },
      in: (col: string, vs: unknown[]) => {
        const rowsIn = (tables[table] ?? []).filter((r) => vs.includes(r[col]) && filters.every(([c, v]) => r[c] === v))
        return Promise.resolve({ data: rowsIn, error: null })
      },
    }
    return b
  }
  const client = {
    rpc: (name: string, args: unknown) => {
      calls.push({ kind: 'rpc', name, args })
      return Promise.resolve(segments instanceof Error ? { data: null, error: { message: segments.message } } : { data: segments, error: null })
    },
    from: (name: string) => {
      calls.push({ kind: 'from', name })
      return builder(name)
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

describe('the noise filter on This week’s quotes', () => {
  it('reads nothing and skips nothing for a tenant the rule is not switched on for (Össur)', async () => {
    const { client, calls } = stub({}, [{ video_id: 'v1', segment: 'noise' }])
    expect(await noiseVideos(client, OSSUR, ['v1'])).toEqual(new Set())
    expect(await noiseComments(client, OSSUR, ['c1'])).toEqual(new Set())
    expect(calls).toEqual([])
  })

  it('names the videos the reader precedence marks noise, and only those', async () => {
    const { client, calls } = stub({}, [
      { video_id: 'v1', segment: 'noise' }, { video_id: 'v2', segment: 'maker' }, { video_id: 'v3', segment: 'market' },
    ])
    expect(await noiseVideos(client, SEALAND_CLIENT_ID, ['v1', 'v2', 'v3', 'v1'])).toEqual(new Set(['v1']))
    expect(calls).toEqual([{ kind: 'rpc', name: RPC_SEGMENTS_FOR_VIDEOS, args: { p_client: SEALAND_CLIENT_ID, p_video_ids: ['v1', 'v2', 'v3'] } }])
  })

  it('finds each comment’s video by the platform’s own id, then asks once', async () => {
    const { client } = stub({
      comments: [
        { id: 'c1', client_id: SEALAND_CLIENT_ID, platform: 'youtube', video_id: 'yt1' },
        { id: 'c2', client_id: SEALAND_CLIENT_ID, platform: 'tiktok', video_id: 'yt1' },
        { id: 'c3', client_id: SEALAND_CLIENT_ID, platform: 'youtube', video_id: 'yt2' },
      ],
      videos: [
        { id: 'v1', client_id: SEALAND_CLIENT_ID, platform: 'youtube', video_id: 'yt1' },
        { id: 'v2', client_id: SEALAND_CLIENT_ID, platform: 'tiktok', video_id: 'yt1' },
        { id: 'v3', client_id: SEALAND_CLIENT_ID, platform: 'youtube', video_id: 'yt2' },
      ],
    }, [{ video_id: 'v1', segment: 'noise' }, { video_id: 'v2', segment: 'market' }, { video_id: 'v3', segment: 'maker' }])
    // The same native id on two platforms is two videos: only YouTube's is noise.
    expect(await noiseComments(client, SEALAND_CLIENT_ID, ['c1', 'c2', 'c3'])).toEqual(new Set(['c1']))
  })

  it('fails open: a read that errors skips no quote, rather than emptying the block', async () => {
    const { client } = stub({ comments: [{ id: 'c1', client_id: SEALAND_CLIENT_ID, platform: 'youtube', video_id: 'yt1' }], videos: [{ id: 'v1', client_id: SEALAND_CLIENT_ID, platform: 'youtube', video_id: 'yt1' }] }, new Error('boom'))
    const errors: unknown[] = []
    const original = console.error
    console.error = (...a: unknown[]) => { errors.push(a) }
    try {
      expect(await noiseVideos(client, SEALAND_CLIENT_ID, ['v1'])).toEqual(new Set())
      expect(await noiseComments(client, SEALAND_CLIENT_ID, ['c1'])).toEqual(new Set())
    } finally {
      console.error = original
    }
    expect(errors.length).toBe(2)
  })

  it('keeps the rows’ order and drops only the skipped ones', () => {
    const rowsIn = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: null }]
    expect(skipNoise(rowsIn, (r) => r.id, new Set(['b']))).toEqual([{ id: 'a' }, { id: 'c' }, { id: null }])
    expect(skipNoise(rowsIn, (r) => r.id, new Set())).toEqual(rowsIn)
  })
})
