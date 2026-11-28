import type { RawItem } from '../types'
import { getPath, str, toDateOnly } from '../util'
import { PROVIDER_TIMEOUT_MS, ProviderError, providerGet, providerTransport, type ProviderEndpoint } from './transport'
import { recordProviderCall } from './ledger'

// TikHub's Instagram hashtag feed (28 Nov 2026), the first source of
// Instagram discovery (lib/gather/gather.ts searchOne; Apify after it).
//
// Measured 28 Nov through treg: `instagram/v2/fetch_hashtag_posts` takes
// `keyword`, `feed_type` (top | recent | reels) and `pagination_token`; items
// at `data.data.items`, the next token at `data.pagination_token` (null at the
// end); 30 items on the first page and 20 after, no repeats within a feed.
// NEITHER FEED IS DATE-ORDERED OR DATE-LIMITED: pages reach back years, so the
// feed is paged and filtered to the run's window here, which keeps
// `videos_found` meaning what it meant on Apify: posts in the window that the
// search returned. A feed that has run out answers 200 with no items and a
// null token, and is still charged; a non-null token does not promise a next
// page with anything on it.
//
// Items leave this module in the Apify actor's field names
// (`toApifyInstagramItem`), so normaliseVideo, extractMedia, coverUrl and the
// retention scrub read them unchanged. The provider's own body is never kept.

export const TIKHUB_IG_HASHTAG: ProviderEndpoint = {
  provider: 'tikhub',
  job: 'instagram.hashtag',
  tregId: 'tikhub.x.instagram-v2-fetch-hashtag-posts',
  direct: { url: 'https://api.tikhub.io/api/v1/instagram/v2/fetch_hashtag_posts' },
  priceUsd: 0.002,
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const finite = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** `media_type` as the Apify actor's coarse `type`. */
const TYPES: Record<number, string> = { 1: 'Image', 2: 'Video', 8: 'Sidecar' }

/** The first playable URL: the item's own, else its first carousel video's. */
function videoUrlOf(item: Obj): string | undefined {
  const own = str(getPath(arr(item.video_versions)[0], ['url'])) || str(item.video_url)
  if (own) return own
  for (const child of arr(item.carousel_media)) {
    const url = str(getPath(arr(obj(child).video_versions)[0], ['url'])) || str(obj(child).video_url)
    if (url) return url
  }
  return undefined
}

/** The widest cover candidate, else the thumbnail, else the first carousel
 *  child's: the still the grid shows (coverUrl reads it as `displayUrl`). */
function displayUrlOf(item: Obj): string | undefined {
  const best = (candidates: unknown[]): string | undefined => {
    let pick: { url: string; width: number } | null = null
    for (const c of candidates) {
      const url = str(obj(c).url)
      const width = finite(obj(c).width) ?? 0
      if (url && (!pick || width > pick.width)) pick = { url, width }
    }
    return pick?.url
  }
  const own = best(arr(obj(item.image_versions).items)) ?? (str(item.thumbnail_url) || undefined)
  if (own) return own
  const child = obj(arr(item.carousel_media)[0])
  return best(arr(obj(child.image_versions).items)) ?? (str(child.thumbnail_url) || undefined)
}

/** The track, as the Apify actor's `musicInfo.song_name` / `artist_name`: a
 *  licensed track's title and artist, or a reel's own sound ("Original audio"). */
function musicInfoOf(item: Obj): { song_name: string; artist_name?: string } | undefined {
  const clips = obj(item.clips_metadata)
  const asset = obj(obj(clips.music_info).music_asset_info)
  const feedAsset = obj(obj(obj(item.music_metadata).music_info).music_asset_info)
  const title = str(asset.title) || str(feedAsset.title) || str(obj(clips.original_sound_info).original_audio_title)
  if (!title) return undefined
  const artist = str(asset.display_artist) || str(feedAsset.display_artist)
  return artist ? { song_name: title, artist_name: artist } : { song_name: title }
}

/** `#tags` in a caption, without the `#`, in order, once each (the Apify
 *  actor's `hashtags`). */
export function captionHashtags(caption: string): string[] {
  return [...new Set([...caption.matchAll(/#([\p{L}\p{M}\p{Nd}_]+)/gu)].map((m) => m[1]))]
}

/**
 * One TikHub hashtag-feed item in the Apify actor's field names (the ones
 * normaliseVideo, extractMedia and coverUrl read). A field the item does not
 * carry is left absent, never invented. null when there is no `code` (the
 * shortcode is the video id).
 */
export function toApifyInstagramItem(item: unknown): RawItem | null {
  const it = obj(item)
  const code = str(it.code)
  if (!code) return null
  const user = obj(it.user)
  const caption = str(getPath(it, ['caption', 'text']))
  const takenAt = finite(it.taken_at) ?? finite(it.taken_at_ts)
  const plays = finite(it.play_count) ?? finite(it.ig_play_count)
  const out: RawItem = {
    provider: 'tikhub',
    shortCode: code,
    // The actor's own form, reels included; commentScrape builds the same.
    url: `https://www.instagram.com/p/${code}/`,
    ownerUsername: str(user.username) || undefined,
    ownerId: str(user.id) || str(user.pk) || undefined,
    ownerFollowers: finite(user.follower_count),
    likesCount: finite(it.like_count),
    commentsCount: finite(it.comment_count),
    videoPlayCount: plays,
    caption,
    hashtags: captionHashtags(caption),
    timestamp: takenAt != null ? new Date(takenAt * 1000).toISOString() : undefined,
    productType: str(it.product_type) || undefined,
    type: TYPES[finite(it.media_type) ?? -1],
    videoUrl: videoUrlOf(it),
    displayUrl: displayUrlOf(it),
    videoDuration: finite(it.video_duration),
    musicInfo: musicInfoOf(it),
    paidPartnership: typeof it.is_paid_partnership === 'boolean' ? it.is_paid_partnership : undefined,
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k]
  return out
}

/** A page's items and next token, after the first page's shape check. */
function readPage(body: unknown, first: boolean): { items: unknown[]; token: string | null } {
  const data = obj(obj(body).data)
  if (data.status === false) {
    const why = str(data.errorMessage).split('\n')[0].slice(0, 160)
    throw new ProviderError('soft', `TikHub said the request failed${why ? `: ${why}` : ''}`)
  }
  const items = obj(data.data).items
  if (!Array.isArray(items)) throw new ProviderError('schema', 'TikHub’s answer was not in the shape Verbatim reads (no item list)')
  // Most items, not every: one odd item is the item's problem, a page of
  // them is the provider changing shape.
  if (first && items.length) {
    const sound = items.filter((i) => typeof obj(i).code === 'string' && typeof obj(i).taken_at === 'number').length
    if (sound * 2 <= items.length) throw new ProviderError('schema', 'TikHub’s answer was not in the shape Verbatim reads (items without a code or date)')
  }
  const token = str(data.pagination_token)
  return { items, token: token || null }
}

export type HashtagFeed = 'recent' | 'reels' | 'top'

/**
 * One hashtag feed, paged and kept to the window. Stops on an empty page, a
 * null token, `maxPages`, `limit` in-window posts, or the deadline (which is
 * a duration from the call). The FIRST page decides: a failure there (an
 * error, a soft failure, a page in a shape we do not read) throws, so the
 * router can move on to Apify while nothing has been accepted. After it, a
 * failure ends paging and keeps what was gathered, with `partial` saying so.
 *
 * `since` is the run's lower bound as 'YYYY-MM-DD' (null: no filter), compared
 * the way the gate's `inWindow` does: an undated item is kept. Items are
 * de-duplicated by code; `seen` counts every distinct item the feed handed
 * back, in the window or not.
 *
 * Writes its own provider_calls row, in a finally block, once a call was made.
 */
export async function fetchHashtagFeed(args: {
  tag: string
  feed: HashtagFeed
  since: string | null
  limit: number
  maxPages: number
  deadlineMs: number
  fetchImpl?: typeof fetch
}): Promise<{ items: RawItem[]; seen: number; pages: number; costUsd: number; partial: string | null }> {
  const t0 = Date.now()
  const deadline = t0 + args.deadlineMs
  const kept: RawItem[] = []
  const codes = new Set<string>()
  let pages = 0
  let calls = 0
  let costUsd = 0
  let partial: string | null = null
  let thrown: unknown = null
  let transport: string = providerTransport('tikhub') ?? 'none'
  try {
    let token: string | null = null
    while (pages < args.maxPages && kept.length < args.limit) {
      const first = pages === 0
      const left = deadline - Date.now()
      if (!first && left <= 0) {
        partial = 'TikHub ran out of time partway through a hashtag feed, and the search kept the posts it had found'
        break
      }
      let page: { items: unknown[]; token: string | null }
      try {
        const res = await providerGet(
          TIKHUB_IG_HASHTAG,
          { keyword: args.tag, feed_type: args.feed, pagination_token: token ?? undefined },
          { timeoutMs: Math.max(1, Math.min(PROVIDER_TIMEOUT_MS, left)), fetchImpl: args.fetchImpl },
        )
        calls += res.attempts
        costUsd += res.costUsd
        transport = res.transport
        page = readPage(res.body, first)
      } catch (e) {
        if (e instanceof ProviderError) {
          calls += e.attempts
          costUsd += e.costUsd
        }
        if (first) throw e
        partial = `TikHub failed partway through a hashtag feed (${e instanceof Error ? e.message : String(e)}), and the search kept the posts it had found`
        break
      }
      pages++
      for (const raw of page.items) {
        const item = toApifyInstagramItem(raw)
        const code = item ? String(item.shortCode) : ''
        if (!item || codes.has(code)) continue
        codes.add(code)
        const day = toDateOnly(item.timestamp)
        if (!args.since || !day || day >= args.since) kept.push(item)
      }
      if (!page.items.length || !page.token) break
      token = page.token
    }
    return { items: kept.slice(0, args.limit), seen: codes.size, pages, costUsd, partial }
  } catch (e) {
    thrown = e
    throw e
  } finally {
    if (calls > 0) {
      const items = Math.min(kept.length, args.limit)
      await recordProviderCall({
        provider: 'tikhub',
        transport,
        job: TIKHUB_IG_HASHTAG.job,
        target: `${args.tag}:${args.feed}`,
        calls,
        cost_usd: costUsd,
        items_seen: codes.size,
        items: thrown ? 0 : items,
        outcome: thrown ? 'error' : partial ? 'partial' : items ? 'ok' : 'empty',
        error: thrown ? (thrown instanceof Error ? thrown.message : String(thrown)) : partial,
        duration_ms: Date.now() - t0,
      })
    }
  }
}
