import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, UUID_IN_CHUNK } from '../chunk'
import { segmentRulesEnabled } from '../segments/rules'

// The noise filter for This week's quote blocks (market-first WP2.7, plan
// §2.7: "quote blocks skip videos the segments_v1 rule marks as noise").
//
// NOISE IS A VIDEO OUR BARE-NAME SEARCHES FOUND OFF-TOPIC (lib/segments/
// rules.ts, CQ F22): a "Patagonia" travel vlog, a "Cotopaxi" volcano, the
// military-dog channel "sealand gear" found. A quote from under one of those
// is not the market talking, so a quote block skips it and takes the next.
// Only the QUOTES skip: a block's counts stay what was read (the segments_v1
// rule is a label, never a deletion, and the default count sets noise aside
// only from deploy 5, decision F).
//
// ONE READER PRECEDENCE: MF1's `segments_for_videos` (an override, else a
// judge, else a stored rule row, else the segments_v1 rule computed inline),
// the function the front page's voices already read. Only for a tenant the
// rule is switched on for (`segmentRulesEnabled`: Sealand); for any other
// (Össur) nothing is read and nothing is skipped, so its blocks are unchanged.
//
// FAILS OPEN, AND SAYS SO IN THE LOG. A quote block that lost every quote to a
// read error would print "nothing" about a week that said plenty; a missed
// label leaves one quote an operator can see. This is a quality filter, not
// decision F's makers rule, which fails closed on the headline.

export const RPC_SEGMENTS_FOR_VIDEOS = 'segments_for_videos'

const warn = (what: string, error: unknown): void => {
  console.error(`[pages] noise ${what}: ${(error as { message?: string })?.message ?? String(error)}; no quote skipped`)
}

/** The videos (uuids, of these) the reader precedence marks noise. Empty for a
 *  tenant with no rule, for no ids, and on a read error. */
export async function noiseVideos(client: SupabaseClient, clientId: string, videoIds: readonly string[]): Promise<Set<string>> {
  const ids = [...new Set(videoIds.filter(Boolean))]
  if (!segmentRulesEnabled(clientId) || ids.length === 0) return new Set()
  const res = await client.rpc(RPC_SEGMENTS_FOR_VIDEOS, { p_client: clientId, p_video_ids: ids })
  if (res.error) {
    warn(RPC_SEGMENTS_FOR_VIDEOS, res.error)
    return new Set()
  }
  return new Set(((res.data ?? []) as { video_id: string; segment: string | null }[])
    .filter((r) => r.segment === 'noise')
    .map((r) => String(r.video_id)))
}

/**
 * The comments (uuids, of these) that sit under a video marked noise. Two
 * small reads find each comment's video (`comments` by id, then `videos` by the
 * platform's own id), in chunks issued together, then `noiseVideos`.
 */
export async function noiseComments(client: SupabaseClient, clientId: string, commentIds: readonly string[]): Promise<Set<string>> {
  const ids = [...new Set(commentIds.filter(Boolean))]
  if (!segmentRulesEnabled(clientId) || ids.length === 0) return new Set()
  try {
    const comments = (await Promise.all(chunk(ids, UUID_IN_CHUNK).map(async (part) => {
      const res = await client.from('comments').select('id, platform, video_id').eq('client_id', clientId).in('id', part)
      if (res.error) throw res.error
      return (res.data ?? []) as { id: string; platform: string; video_id: string }[]
    }))).flat()
    const native = [...new Set(comments.map((c) => c.video_id).filter(Boolean))]
    const videos = (await Promise.all(chunk(native, UUID_IN_CHUNK).map(async (part) => {
      const res = await client.from('videos').select('id, platform, video_id').eq('client_id', clientId).in('video_id', part)
      if (res.error) throw res.error
      return (res.data ?? []) as { id: string; platform: string; video_id: string }[]
    }))).flat()
    const uuidOf = new Map(videos.map((v) => [`${v.platform}::${v.video_id}`, v.id]))
    const noise = await noiseVideos(client, clientId, [...uuidOf.values()])
    if (noise.size === 0) return new Set()
    return new Set(comments
      .filter((c) => noise.has(uuidOf.get(`${c.platform}::${c.video_id}`) ?? ''))
      .map((c) => c.id))
  } catch (error) {
    warn('comments', error)
    return new Set()
  }
}

/** The rows whose key is not in `skip`, in their order. */
export function skipNoise<T>(rows: readonly T[], keyOf: (row: T) => string | null | undefined, skip: ReadonlySet<string>): T[] {
  if (skip.size === 0) return [...rows]
  return rows.filter((r) => {
    const k = keyOf(r)
    return k == null || !skip.has(k)
  })
}
