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
import { rankEngageCandidates, type EngageCandidate } from './engage'
import { readingOf } from './quotes'
import { segmentRulesEnabled } from './segments/rules'
import { pickEligible, quoteGate, quoteMarketFor, type GateOptions, type QuoteVideo } from './quote-gate'

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
  /** videos.id → the video. */
  uuid: Map<string, QuoteVideo>
}

const CACHES = new WeakMap<object, Cache>()
function cacheOf(db: unknown): Cache {
  const fresh = (): Cache => ({ comment: new Map(), evidence: new Map(), video: new Map(), bare: new Map(), missing: new Set(), uuid: new Map() })
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
  /** A video by its row id (`videos.id`). */
  forVideoUuid(uuid: string | null | undefined): QuoteVideo | null
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
    /** Comments whose video the caller already read: seeds the memo, so the
     *  comments hop is skipped for them. */
    commentVideos?: readonly { commentId: string | null | undefined; platform: string | null | undefined; videoId: string | null | undefined }[]
    /** Videos by their row id (`videos.id`). */
    videoUuids?: readonly (string | null | undefined)[]
  },
  admin?: SupabaseClient | null,
): Promise<QuoteContext> {
  const cache = cacheOf(db)
  const clean = (xs: readonly (string | null | undefined)[] | undefined): string[] => [...new Set((xs ?? []).filter((x): x is string => typeof x === 'string' && x.length > 0))]
  for (const c of want.commentVideos ?? []) {
    if (c.commentId && !cache.comment.has(c.commentId)) cache.comment.set(c.commentId, c.videoId ? videoKey(c.platform, c.videoId) : null)
  }

  // 1. Evidence → its comment (with the comment's video, embedded: one hop,
  //    not two) and its own video.
  const evidenceIds = clean(want.evidenceIds).filter((id) => !cache.evidence.has(id))
  if (evidenceIds.length > 0) {
    type EvidenceRow = { id: string; comment_id: string | null; source_video_id: string | null; comments?: { platform: string | null; video_id: string | null } | null }
    const rows = await readChunks<EvidenceRow>(evidenceIds, UUID_IN_CHUNK,
      (part) => db.from('insight_evidence').select('id, comment_id, source_video_id, comments(platform, video_id)').in('id', part), 'quote-context evidence')
    for (const r of rows) {
      cache.evidence.set(String(r.id), { commentId: r.comment_id ? String(r.comment_id) : null, videoId: r.source_video_id ? String(r.source_video_id) : null })
      const c = Array.isArray(r.comments) ? r.comments[0] : r.comments
      if (r.comment_id && c && !cache.comment.has(String(r.comment_id))) cache.comment.set(String(r.comment_id), c.video_id ? videoKey(c.platform, String(c.video_id)) : null)
    }
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
  const uuidsToRead = clean(want.videoUuids).filter((id) => !cache.uuid.has(id))
  if (toRead.length > 0 || uuidsToRead.length > 0) {
    const [byNative, byUuid] = await Promise.all([
      toRead.length > 0
        ? readChunks<VideoRow>(toRead, UUID_IN_CHUNK, (part) => db.from('videos').select(VIDEO_COLUMNS).eq('client_id', clientId).in('video_id', part), 'quote-context videos')
        : Promise.resolve([] as VideoRow[]),
      uuidsToRead.length > 0
        ? readChunks<VideoRow>(uuidsToRead, UUID_IN_CHUNK, (part) => db.from('videos').select(VIDEO_COLUMNS).eq('client_id', clientId).in('id', part), 'quote-context videos by id')
        : Promise.resolve([] as VideoRow[]),
    ])
    const rows = [...byNative, ...byUuid]
    const fresh: { row: VideoRow; video: QuoteVideo }[] = []
    for (const r of rows) {
      if (!r.video_id) continue
      const video: QuoteVideo = {
        platform: r.platform, videoId: String(r.video_id), caption: r.caption, hashtags: r.hashtags, topics: r.topics,
        accountName: r.account_name, isClient: r.is_client, isCompetitor: r.is_competitor, competitorName: r.competitor_name,
        source: r.source, segment: null,
      }
      if (cache.uuid.has(String(r.id))) continue
      cache.video.set(videoKey(r.platform, String(r.video_id)), video)
      if (!cache.bare.has(String(r.video_id))) cache.bare.set(String(r.video_id), video)
      cache.uuid.set(String(r.id), video)
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
    forVideoUuid: (uuid) => (uuid ? cache.uuid.get(uuid) ?? null : null),
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

/**
 * A reply queue's candidates through the quote gate (This week's Worth a reply
 * and Flagged for awareness; the Content page's inbox): a comment the market
 * wrote that the client could answer — readable, not under a maker's or a
 * seller's post, not under another brand's own post, on the market — and one
 * candidate per comment thread, the thread's first in the queue's own order
 * (`rankEngageCandidates` uncapped), so the ranking decides which one stays.
 * Comments under the client's own posts stay: those are the most worth
 * answering. `makers` are comment ids already read as under a maker's video.
 */
export async function gateEngage<T extends EngageCandidate>(
  db: SupabaseClient,
  clientId: string,
  pool: readonly T[],
  translations: Map<string, { lang: string; english: string | null }>,
  makers: ReadonlySet<string> = new Set(),
): Promise<T[]> {
  if (pool.length === 0) return []
  const ctx = await readQuoteContext(db, clientId, { commentIds: pool.map((c) => c.comment.id) })
  const gate = gateFor(clientId, { allowOwn: true })
  const threadOf = new Map<string, string | null>()
  const passed = pool.filter((c) => {
    const video = ctx.forComment(c.comment.id)
    const verdict = quoteGate({
      text: c.comment.text ?? '',
      ...readingOf(translations, c.comment.text ?? ''),
      video: video ? { ...video, segment: makers.has(c.comment.id) ? 'maker' : video.segment } : null,
    }, gate)
    if (verdict.ok) threadOf.set(c.comment.id, verdict.thread)
    return verdict.ok
  })
  const ordered = rankEngageCandidates([...passed], { windowStart: '1970-01-01T00:00:00.000Z', perCategoryCap: Infinity, totalCap: Infinity })
  const threads = new Set<string>()
  const keep = new Set<string>()
  for (const c of ordered) {
    const t = threadOf.get(c.comment.id) ?? null
    if (t && threads.has(t)) continue
    if (t) threads.add(t)
    keep.add(c.comment.id)
  }
  return passed.filter((c) => keep.has(c.comment.id))
}

/**
 * Quotes a cited picker chose (`createCitedQuotePicker`, the legacy pages'),
 * through the quote gate: the first `n` that pass, one per thread. An `e:`
 * quote is judged on its evidence's video; any other ref (a hero copy, `h:`)
 * on its words alone, which under a market lexicon means it must name a carry
 * good. `ctx` is the pool's context, read once per page.
 */
export function gateCitedQuotes<Q extends { ref: string; text: string; lang?: string | null; english?: string | null }>(
  quotes: readonly Q[],
  ctx: QuoteContext,
  n: number,
  gate: GateOptions,
): Q[] {
  return pickEligible(quotes, (q) => ({
    text: q.text,
    lang: q.lang ?? null,
    english: q.english ?? null,
    video: q.ref.startsWith('e:') ? ctx.forEvidence(q.ref.slice(2)) : undefined,
  }), n, gate)
}

/** The context for every evidence row a cited picker may choose from. */
export function readPoolContext(
  db: SupabaseClient,
  clientId: string,
  quotesByAudience: ReadonlyMap<string, readonly { evidenceId: string }[]>,
): Promise<QuoteContext> {
  return readQuoteContext(db, clientId, { evidenceIds: [...quotesByAudience.values()].flat().map((q) => q.evidenceId) })
}
