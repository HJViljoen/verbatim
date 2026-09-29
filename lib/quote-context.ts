// The reads behind the quote gate (lib/quote-gate.ts): for a set of quotes,
// the video each sits under — its words, its filing and its segment.
//
// ONE READ PATH FOR EVERY SURFACE. A block names its candidates the way it
// holds them — comment ids, evidence ids, or the videos themselves — and gets
// back the `QuoteVideo` the gate reads. Three hops at most: evidence → comment
// → video, then the videos' segments (`segments_for_videos`, MF1's reader
// precedence: override, judge, rule, else the v1 rule inline), which only the
// service-role client may call.
//
// REQUEST-SCOPED MEMO. A page asks for several blocks' quotes; the rows are
// kept per client object (a WeakMap: a request's clients die with it, the
// memo with them, lib/reading/memo.ts's rule), so a video read for one block
// is not read again for the next.
//
// FAILS SOFT WHERE THE GATE CAN STILL ANSWER, CLOSED WHERE IT CANNOT. A
// segments read that errors leaves `segment` null, and the gate falls back to
// the v1 maker rule on the video's own words (which is what the SQL does for
// an unlabelled video). A video that cannot be found is `null`, and the gate
// refuses its quote: nothing it cannot place prints.

import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, UUID_IN_CHUNK } from './chunk'
import { segmentRulesEnabled } from './segments/rules'
import { quoteMarketFor, type GateOptions, type QuoteVideo } from './quote-gate'

export const RPC_SEGMENTS_FOR_VIDEOS = 'segments_for_videos'
const SEGMENT_CHUNK = 500

type VideoRow = {
  id: string
  platform: string | null
  video_id: string | null
  account_name: string | null
  caption: string | null
  hashtags: string[] | null
  topics: string[] | null
  is_client: boolean | null
  is_competitor: boolean | null
  competitor_name: string | null
  source: string | null
}

const VIDEO_COLUMNS = 'id, platform, video_id, account_name, caption, hashtags, topics, is_client, is_competitor, competitor_name, source'

/** A video's key: platform and its own id. */
export const videoKey = (platform: string | null | undefined, videoId: string): string => `${(platform ?? '').toLowerCase()}::${videoId}`

interface Cache {
  /** comments.id → the video's key, or null where the comment has none. */
  comment: Map<string, string | null>
  /** insight_evidence.id → the comment it quotes and the video it names. */
  evidence: Map<string, { commentId: string | null; videoId: string | null }>
  /** video key → the video; also the bare video id → the first found. */
  video: Map<string, QuoteVideo>
  bare: Map<string, QuoteVideo>
  /** Native video ids asked for and not found. */
  missing: Set<string>
}

const CACHES = new WeakMap<object, Cache>()
function cacheOf(db: unknown): Cache {
  const fresh = (): Cache => ({ comment: new Map(), evidence: new Map(), video: new Map(), bare: new Map(), missing: new Set() })
  if (!db || (typeof db !== 'object' && typeof db !== 'function')) return fresh()
  let c = CACHES.get(db as object)
  if (!c) CACHES.set(db as object, (c = fresh()))
  return c
}

async function readChunks<T>(ids: readonly string[], size: number, read: (part: string[]) => PromiseLike<{ data: unknown; error: unknown }>, what: string): Promise<T[]> {
  const out: T[] = []
  const parts = await Promise.all(chunk([...ids], size).map((part) => read(part)))
  for (const res of parts) {
    if (res.error) throw new Error(`${what}: ${(res.error as { message?: string }).message ?? String(res.error)}`)
    out.push(...((res.data ?? []) as T[]))
  }
  return out
}

/** What one read of quote contexts answers. */
export interface QuoteContext {
  /** The video behind a comment: `null` where it was looked for and not found. */
  forComment(commentId: string | null | undefined): QuoteVideo | null
  /** The video behind an evidence row (its comment's, else its own video). */
  forEvidence(evidenceId: string | null | undefined): QuoteVideo | null
  /** A video by platform and its own id (platform optional). */
  forVideo(platform: string | null | undefined, videoId: string | null | undefined): QuoteVideo | null
  /** The comment an evidence row quotes, where it quotes one. */
  commentOfEvidence(evidenceId: string | null | undefined): string | null
}

/**
 * Read the videos behind these quotes.
 *
 * `db` reads comments, evidence and videos (the session client is enough:
 * each is the tenant's own); `admin`, where given, reads the segments.
 */
export async function readQuoteContext(
  db: SupabaseClient,
  clientId: string,
  want: {
    commentIds?: readonly (string | null | undefined)[]
    evidenceIds?: readonly (string | null | undefined)[]
    videos?: readonly { platform?: string | null; videoId: string | null | undefined }[]
  },
  admin?: SupabaseClient | null,
): Promise<QuoteContext> {
  const cache = cacheOf(db)
  const clean = (xs: readonly (string | null | undefined)[] | undefined): string[] => [...new Set((xs ?? []).filter((x): x is string => typeof x === 'string' && x.length > 0))]

  // 1. Evidence → its comment and its own video.
  const evidenceIds = clean(want.evidenceIds).filter((id) => !cache.evidence.has(id))
  if (evidenceIds.length > 0) {
    const rows = await readChunks<{ id: string; comment_id: string | null; source_video_id: string | null }>(evidenceIds, UUID_IN_CHUNK,
      (part) => db.from('insight_evidence').select('id, comment_id, source_video_id').in('id', part), 'quote-context evidence')
    for (const r of rows) cache.evidence.set(String(r.id), { commentId: r.comment_id ? String(r.comment_id) : null, videoId: r.source_video_id ? String(r.source_video_id) : null })
    for (const id of evidenceIds) if (!cache.evidence.has(id)) cache.evidence.set(id, { commentId: null, videoId: null })
  }

  // 2. Comments → their video.
  const commentIds = clean([...(want.commentIds ?? []), ...clean(want.evidenceIds).map((id) => cache.evidence.get(id)?.commentId ?? null)])
    .filter((id) => !cache.comment.has(id))
  if (commentIds.length > 0) {
    const rows = await readChunks<{ id: string; platform: string | null; video_id: string | null }>(commentIds, UUID_IN_CHUNK,
      (part) => db.from('comments').select('id, platform, video_id').eq('client_id', clientId).in('id', part), 'quote-context comments')
    for (const r of rows) cache.comment.set(String(r.id), r.video_id ? videoKey(r.platform, String(r.video_id)) : null)
    for (const id of commentIds) if (!cache.comment.has(id)) cache.comment.set(id, null)
  }

  // 3. The videos, by their own ids.
  const nativeIds = new Set<string>()
  for (const v of want.videos ?? []) if (v.videoId) nativeIds.add(String(v.videoId))
  for (const id of clean(want.commentIds)) {
    const key = cache.comment.get(id)
    if (key) nativeIds.add(key.slice(key.indexOf('::') + 2))
  }
  for (const id of clean(want.evidenceIds)) {
    const e = cache.evidence.get(id)
    const key = e?.commentId ? cache.comment.get(e.commentId) : null
    if (key) nativeIds.add(key.slice(key.indexOf('::') + 2))
    else if (e?.videoId) nativeIds.add(e.videoId)
  }
  const toRead = [...nativeIds].filter((id) => !cache.bare.has(id) && !cache.missing.has(id))
  if (toRead.length > 0) {
    const rows = await readChunks<VideoRow>(toRead, UUID_IN_CHUNK,
      (part) => db.from('videos').select(VIDEO_COLUMNS).eq('client_id', clientId).in('video_id', part), 'quote-context videos')
    const fresh: { row: VideoRow; video: QuoteVideo }[] = []
    for (const r of rows) {
      if (!r.video_id) continue
      const video: QuoteVideo = {
        platform: r.platform, videoId: String(r.video_id), caption: r.caption, hashtags: r.hashtags, topics: r.topics,
        accountName: r.account_name, isClient: r.is_client, isCompetitor: r.is_competitor, competitorName: r.competitor_name,
        source: r.source, segment: null,
      }
      cache.video.set(videoKey(r.platform, String(r.video_id)), video)
      if (!cache.bare.has(String(r.video_id))) cache.bare.set(String(r.video_id), video)
      fresh.push({ row: r, video })
    }
    for (const id of toRead) if (!cache.bare.has(id)) cache.missing.add(id)

    // 4. Their segments: the service role's call, fail-soft.
    if (admin && fresh.length > 0) {
      const byId = new Map(fresh.map((f) => [String(f.row.id), f.video]))
      try {
        const rows = await readChunks<{ video_id: string; segment: string | null }>([...byId.keys()], SEGMENT_CHUNK,
          (part) => admin.rpc(RPC_SEGMENTS_FOR_VIDEOS, { p_client: clientId, p_video_ids: part }), RPC_SEGMENTS_FOR_VIDEOS)
        for (const r of rows) {
          const v = byId.get(String(r.video_id))
          if (v) v.segment = r.segment ?? null
        }
      } catch (e) {
        console.error(`[quote-context] ${e instanceof Error ? e.message : String(e)}; makers read off the videos' own words`)
      }
    }
  }

  const forVideo = (platform: string | null | undefined, videoId: string | null | undefined): QuoteVideo | null => {
    if (!videoId) return null
    return (platform ? cache.video.get(videoKey(platform, videoId)) : undefined) ?? cache.bare.get(videoId) ?? null
  }
  const forComment = (commentId: string | null | undefined): QuoteVideo | null => {
    const key = commentId ? cache.comment.get(commentId) : null
    return key ? cache.video.get(key) ?? cache.bare.get(key.slice(key.indexOf('::') + 2)) ?? null : null
  }
  return {
    forComment,
    forVideo,
    forEvidence: (evidenceId) => {
      const e = evidenceId ? cache.evidence.get(evidenceId) : undefined
      if (!e) return null
      return (e.commentId ? forComment(e.commentId) : null) ?? (e.videoId ? forVideo(null, e.videoId) : null)
    },
    commentOfEvidence: (evidenceId) => (evidenceId ? cache.evidence.get(evidenceId)?.commentId ?? null : null),
  }
}

/** The gate's options for this tenant, plus what the block asks. */
export function gateFor(clientId: string, block: Omit<GateOptions, 'market' | 'makerRule'> = {}): GateOptions {
  return { market: quoteMarketFor(clientId), makerRule: segmentRulesEnabled(clientId), ...block }
}
