import type { PlatformAdapter, GatherConfig, VideoRef, RawItem } from '../types'
import { num, str, first, getPath, toDateOnly, engagementRate } from '../util'
import { tagVideo } from '../tagging'

// YouTube adapter — official YouTube Data API v3 (replaced the Apify actor on
// 2026-07-05). YouTube is the one platform with a free, complete, reliable
// official API, so paying a scraper for it was pure cost + an extra breakage
// surface. Flow: search.list → videos.list (statistics + contentDetails) →
// commentThreads.list. Needs YOUTUBE_API_KEY (Google Cloud → enable "YouTube
// Data API v3" → create an API key).
//
// Quota (10k units/day by default): search.list = 100 units/call, videos.list &
// commentThreads.list = 1 unit each. A 7-keyword run ≈ 700 units for discovery
// plus 1/video for comments — comfortably inside the free daily quota.

const YT_API = 'https://www.googleapis.com/youtube/v3'

function apiKey(): string {
  const k = process.env.YOUTUBE_API_KEY
  if (!k) throw new Error('YOUTUBE_API_KEY not set (Google Cloud → enable YouTube Data API v3 → create an API key)')
  return k
}

async function ytGet(endpoint: string, params: URLSearchParams): Promise<Record<string, unknown>> {
  const res = await fetch(`${YT_API}/${endpoint}?${params.toString()}`)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`YouTube ${endpoint} ${res.status}: ${body.slice(0, 200)}`)
  }
  return (await res.json()) as Record<string, unknown>
}

function itemsOf(data: Record<string, unknown>): RawItem[] {
  return Array.isArray(data.items) ? (data.items as RawItem[]) : []
}

/** report_period → RFC-3339 `publishedAfter` lower bound for the search window. */
function periodToPublishedAfter(period: string): string {
  const days = period === 'daily' ? 1 : period === 'monthly' ? 30 : 7
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

/** ISO-8601 duration ('PT1M30S') → seconds. */
function isoDurationToSeconds(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!m) return 0
  return (m[1] ? +m[1] : 0) * 3600 + (m[2] ? +m[2] : 0) * 60 + (m[3] ? +m[3] : 0)
}

/** Subscriber counts for the given channels, batched (≤50/call). Best-effort:
 *  a failure just leaves those channels at 0 followers, never fails the gather. */
async function fetchSubscribers(channelIds: string[], key: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  for (let i = 0; i < channelIds.length; i += 50) {
    const params = new URLSearchParams({ part: 'statistics', id: channelIds.slice(i, i + 50).join(','), key })
    try {
      for (const ch of itemsOf(await ytGet('channels', params))) {
        const id = str(getPath(ch, ['id']))
        if (id) out.set(id, num(getPath(ch, ['statistics', 'subscriberCount'])))
      }
    } catch {
      // best-effort — leave this batch's channels at 0
    }
  }
  return out
}

export const youtube: PlatformAdapter = {
  platform: 'youtube',

  async fetchVideos(config: GatherConfig, terms: string[], limit: number): Promise<RawItem[]> {
    const key = apiKey()
    const keyword = terms[0] ?? ''
    if (!keyword) return []
    const publishedAfter = periodToPublishedAfter(config.report_period)

    // 1) search.list → video ids (paginate up to `limit`, 50/page).
    const ids: string[] = []
    let pageToken = ''
    while (ids.length < limit) {
      const params = new URLSearchParams({
        part: 'snippet', q: keyword, type: 'video',
        maxResults: String(Math.min(50, limit - ids.length)),
        order: 'relevance', publishedAfter, key,
      })
      if (pageToken) params.set('pageToken', pageToken)
      const data = await ytGet('search', params)
      for (const it of itemsOf(data)) {
        const vid = str(getPath(it, ['id', 'videoId']))
        if (vid) ids.push(vid)
      }
      pageToken = str(data.nextPageToken)
      if (!pageToken) break
    }
    if (!ids.length) return []

    // 2) videos.list → snippet + statistics + contentDetails (batched, 50/call).
    const items: RawItem[] = []
    for (let i = 0; i < ids.length; i += 50) {
      const params = new URLSearchParams({
        part: 'snippet,statistics,contentDetails', id: ids.slice(i, i + 50).join(','), key,
      })
      items.push(...itemsOf(await ytGet('videos', params)))
    }

    // 3) real subscriber counts (the old Apify actor only gave a formatted
    //    string like "35.3K subscribers", which parsed to 0).
    const channelIds = [...new Set(items.map((v) => str(getPath(v, ['snippet', 'channelId']))).filter(Boolean))]
    const subs = await fetchSubscribers(channelIds, key)
    for (const v of items) v._subscriberCount = subs.get(str(getPath(v, ['snippet', 'channelId']))) ?? 0
    return items
  },

  normaliseVideo(raw, ctx) {
    const video_id = str(getPath(raw, ['id']))
    if (!video_id) return null
    const video_url = `https://www.youtube.com/watch?v=${video_id}`

    const account_name = str(getPath(raw, ['snippet', 'channelTitle']))
    const title = str(getPath(raw, ['snippet', 'title']))
    const description = str(getPath(raw, ['snippet', 'description']))
    const caption = [title, description].filter(Boolean).join(' ')
    const views = num(getPath(raw, ['statistics', 'viewCount']))
    const likes = num(getPath(raw, ['statistics', 'likeCount']))
    const comments_count = num(getPath(raw, ['statistics', 'commentCount']))
    const duration = isoDurationToSeconds(str(getPath(raw, ['contentDetails', 'duration'])))

    const rawTags = getPath(raw, ['snippet', 'tags'])
    const hashtags = Array.isArray(rawTags) ? rawTags.map((t) => str(t)).filter(Boolean) : []

    return {
      client_id: ctx.clientId,
      run_id: ctx.runId,
      platform: 'youtube',
      video_id,
      video_url,
      account_name,
      account_followers: num(raw._subscriberCount),
      caption,
      hashtags,
      content_format: duration > 0 && duration <= 60 ? 'short' : 'long-form',
      views,
      likes,
      shares: 0, // YouTube doesn't expose shares
      comments_count,
      engagement_rate: engagementRate(views, likes, 0, comments_count),
      upload_date: toDateOnly(getPath(raw, ['snippet', 'publishedAt'])),
      audio_name: '',
      is_sponsored: false,
      duration_seconds: duration,
      ...tagVideo({ account_name, caption, hashtags }, ctx.config),
    }
  },

  async fetchCommentCounts(videoIds: string[]): Promise<Map<string, number>> {
    const key = apiKey()
    const out = new Map<string, number>()
    for (let i = 0; i < videoIds.length; i += 50) {
      const params = new URLSearchParams({ part: 'statistics', id: videoIds.slice(i, i + 50).join(','), key })
      for (const v of itemsOf(await ytGet('videos', params))) {
        const id = str(getPath(v, ['id']))
        if (id) out.set(id, num(getPath(v, ['statistics', 'commentCount'])))
      }
    }
    return out
  },

  async fetchComments(video: VideoRef, config: GatherConfig): Promise<RawItem[]> {
    const key = apiKey()
    const out: RawItem[] = []
    let pageToken = ''
    while (out.length < config.comment_depth) {
      const params = new URLSearchParams({
        part: 'snippet', videoId: video.video_id,
        maxResults: String(Math.min(100, config.comment_depth - out.length)),
        order: 'relevance', textFormat: 'plainText', key,
      })
      if (pageToken) params.set('pageToken', pageToken)
      let data: Record<string, unknown>
      try {
        data = await ytGet('commentThreads', params)
      } catch (e) {
        // Comments disabled / video private or removed → no comments, not a failure.
        if (/\b40[34]\b|commentsDisabled/.test((e as Error).message)) return out
        throw e
      }
      out.push(...itemsOf(data))
      pageToken = str(data.nextPageToken)
      if (!pageToken) break
    }
    return out
  },

  normaliseComment(raw, video, ctx) {
    const top = getPath(raw, ['snippet', 'topLevelComment', 'snippet'])
    const comment_id = str(first(getPath(raw, ['snippet', 'topLevelComment', 'id']), getPath(raw, ['id'])))
    const text = str(first(getPath(top, ['textOriginal']), getPath(top, ['textDisplay'])))
    if (!comment_id || !text) return null

    return {
      client_id: ctx.clientId,
      run_id: ctx.runId,
      platform: 'youtube',
      video_id: video.video_id,
      comment_id,
      author: str(getPath(top, ['authorDisplayName'])),
      likes: num(getPath(top, ['likeCount'])),
      reply_count: num(getPath(raw, ['snippet', 'totalReplyCount'])),
      is_reply: false, // only top-level threads are fetched
      comment_date: toDateOnly(getPath(top, ['publishedAt'])),
      text,
    }
  },

  // commentCount exists but is unreliable for gating (disabled/hidden comments) —
  // scrape all found videos, same policy as the previous actor.
  commentThreshold: null,
}
