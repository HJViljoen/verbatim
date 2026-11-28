import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// TikHub's Instagram hashtag feed (28 Nov 2026), with an injected fetch: no
// network. The items are real ones from the 28 Nov probes through treg
// (#sustainablefashion, recent feed, page 0: a reel, a carousel with a video
// in it, a photo), TRIMMED to the fields the translation reads and a few of
// their neighbours, structure and field names exact. Codes, user ids,
// usernames, names, captions and every media URL are placeholders.

const h = vi.hoisted(() => ({ record: vi.fn(async () => {}) }))
vi.mock('./ledger', () => ({ recordProviderCall: h.record }))

import { fetchHashtagFeed, toApifyInstagramItem, captionHashtags } from './tikhub-instagram'
import { ProviderError } from './transport'
import { instagram } from '../platforms/instagram'
import type { GatherConfig, NormaliseCtx } from '../types'

const CLIP = {
  code: 'DfCLIP00001',
  pk: '1000000000000000001',
  id: '1000000000000000001',
  taken_at: 1794990674, // 2026-11-18
  media_type: 2,
  product_type: 'clips',
  like_count: 20673,
  comment_count: 44,
  play_count: 540527,
  ig_play_count: 540527,
  video_duration: 6.666,
  is_paid_partnership: false,
  media_name: 'reel',
  permalink: 'https://www.instagram.com/reel/DfCLIP00001/',
  caption: { pk: '2000000000000000001', user_id: '3000000000000000001', text: 'A placeholder caption about a market day #SlowFashion #Thrift', created_at: 1794990676, hashtags: ['#SlowFashion', '#Thrift'] },
  user: { id: '3000000000000000001', username: 'creator_one', full_name: 'Creator One', follower_count: 173724, is_verified: false, is_private: false },
  video_versions: [
    { height: 1280, id: '4000000000000001', type: 101, url: 'https://media.example/clip-720.mp4', width: 720 },
    { height: 1280, id: '4000000000000002', type: 102, url: 'https://media.example/clip-720b.mp4', width: 720 },
  ],
  video_url: 'https://media.example/clip-720.mp4',
  image_versions: { items: [{ height: 640, url: 'https://media.example/clip-cover-360.jpg', width: 360 }] },
  thumbnail_url: 'https://media.example/clip-cover-360.jpg',
  clips_metadata: { audio_type: 'original_sounds', music_info: null, original_sound_info: { audio_id: '5000000000000001', original_audio_title: 'Original audio' } },
  music_metadata: null,
  carousel_media: null,
}

const CAROUSEL = {
  code: 'DgCARO00002',
  pk: '1000000000000000002',
  id: '1000000000000000002',
  taken_at: 1795502061, // 2026-11-24
  media_type: 8,
  product_type: 'carousel_container',
  like_count: 6463,
  comment_count: 239,
  play_count: null,
  video_duration: null,
  is_paid_partnership: false,
  carousel_media_count: 2,
  media_name: 'album',
  caption: { pk: '2000000000000000002', user_id: '3000000000000000002', text: 'Placeholder words, two photos', created_at: 1795502063, hashtags: [] },
  user: { id: '3000000000000000002', username: 'creator_two', full_name: 'Creator Two', follower_count: 1116313, is_verified: true, is_private: false },
  image_versions: { items: [{ height: 480, url: 'https://media.example/album-360.jpg', width: 360 }, { height: 1440, url: 'https://media.example/album-1080.jpg', width: 1080 }] },
  thumbnail_url: 'https://media.example/album-360.jpg',
  carousel_media: [
    { id: '1000000000000000021', media_type: 1, image_versions: { items: [{ height: 1440, url: 'https://media.example/album-1-1080.jpg', width: 1080 }] }, video_versions: null, video_duration: null },
    { id: '1000000000000000022', media_type: 2, image_versions: { items: [{ height: 480, url: 'https://media.example/album-2-360.jpg', width: 360 }] }, video_versions: [{ height: 960, id: '4000000000000003', type: 101, url: 'https://media.example/album-2.mp4', width: 720 }], video_url: 'https://media.example/album-2.mp4', video_duration: 2.933 },
  ],
  music_metadata: { music_info: { music_asset_info: { audio_id: '5000000000000002', title: 'A Placeholder Song', display_artist: 'A Placeholder Artist' } }, original_sound_info: null },
  clips_metadata: null,
}

const PHOTO = {
  code: 'DaPHOT00003',
  pk: '1000000000000000003',
  id: '1000000000000000003',
  taken_at: 1784275104, // 2026-07-17: outside a November window
  media_type: 1,
  product_type: 'feed',
  like_count: 297,
  comment_count: 37,
  play_count: null,
  video_duration: null,
  is_paid_partnership: false,
  media_name: 'post',
  caption: { pk: '2000000000000000003', user_id: '3000000000000000003', text: 'Placeholder photo caption #Upcycled', created_at: 1784275106, hashtags: ['#Upcycled'] },
  user: { id: '3000000000000000003', username: 'creator_three', full_name: 'Creator Three', follower_count: 2727, is_verified: false, is_private: false },
  image_versions: { items: [{ height: 1440, url: 'https://media.example/photo-1080.jpg', width: 1080 }, { height: 480, url: 'https://media.example/photo-360.jpg', width: 360 }] },
  thumbnail_url: 'https://media.example/photo-1080.jpg',
  video_versions: null,
  carousel_media: null,
  music_metadata: null,
  clips_metadata: null,
}

/** A clip with a given code and day, for the paging tests. */
const clip = (code: string, takenAt = CLIP.taken_at) => ({ ...CLIP, code, pk: code, id: code, taken_at: takenAt })

/** A page as TikHub sends it (top level trimmed; the cache link included,
 *  since the transport removes it). */
const page = (items: unknown[], token: string | null) => ({
  code: 200,
  message: 'Request successful. This request will incur a charge.',
  cache_url: 'https://cache.tikhub.io/api/v1/cache/public/placeholder',
  router: '/api/v1/instagram/v2/fetch_hashtag_posts',
  params: { keyword: 'sustainablefashion', feed_type: 'recent' },
  data: { data: { additional_data: [], count: items.length, items }, pagination_token: token },
})

/** A fetch that answers from a script, one entry a call; every answer bills
 *  $0.002 through treg's header. */
function scripted(...answers: (unknown | Response | Error)[]) {
  const urls: string[] = []
  const impl = (async (url: string | URL | Request) => {
    urls.push(String(url))
    const next = answers.shift()
    if (next === undefined) throw new Error('no scripted answer left')
    if (next instanceof Error) throw next
    if (next instanceof Response) return next
    return new Response(JSON.stringify(next), { status: 200, headers: { 'X-Treg-Cost-Micro': '2000' } })
  }) as typeof fetch
  return { impl, urls }
}

const ARGS = { tag: 'sustainablefashion', feed: 'recent' as const, since: '2026-11-01', limit: 100, maxPages: 8, deadlineMs: 200_000 }

let savedTreg: string | undefined
let savedTikhub: string | undefined
beforeEach(() => {
  savedTreg = process.env.TREG_API_KEY
  savedTikhub = process.env.TIKHUB_API_KEY
  process.env.TREG_API_KEY = 'treg-test'
  delete process.env.TIKHUB_API_KEY
  h.record.mockClear()
})
afterEach(() => {
  if (savedTreg === undefined) delete process.env.TREG_API_KEY
  else process.env.TREG_API_KEY = savedTreg
  if (savedTikhub === undefined) delete process.env.TIKHUB_API_KEY
  else process.env.TIKHUB_API_KEY = savedTikhub
})

describe('toApifyInstagramItem — TikHub item → the Apify actor’s field names', () => {
  it('translates a reel', () => {
    expect(toApifyInstagramItem(CLIP)).toEqual({
      provider: 'tikhub',
      shortCode: 'DfCLIP00001',
      url: 'https://www.instagram.com/p/DfCLIP00001/',
      ownerUsername: 'creator_one',
      ownerId: '3000000000000000001',
      ownerFollowers: 173724,
      likesCount: 20673,
      commentsCount: 44,
      videoPlayCount: 540527,
      caption: 'A placeholder caption about a market day #SlowFashion #Thrift',
      hashtags: ['SlowFashion', 'Thrift'],
      timestamp: '2026-11-18T08:31:14.000Z',
      productType: 'clips',
      type: 'Video',
      videoUrl: 'https://media.example/clip-720.mp4',
      displayUrl: 'https://media.example/clip-cover-360.jpg',
      videoDuration: 6.666,
      musicInfo: { song_name: 'Original audio' },
      paidPartnership: false,
    })
  })

  it('translates a carousel: its first video, its widest cover, its track', () => {
    const t = toApifyInstagramItem(CAROUSEL)!
    expect(t.type).toBe('Sidecar')
    expect(t.productType).toBe('carousel_container')
    expect(t.videoUrl).toBe('https://media.example/album-2.mp4')
    expect(t.displayUrl).toBe('https://media.example/album-1080.jpg')
    expect(t.musicInfo).toEqual({ song_name: 'A Placeholder Song', artist_name: 'A Placeholder Artist' })
    // No plays and no duration on a carousel: absent, not invented.
    expect(t).not.toHaveProperty('videoPlayCount')
    expect(t).not.toHaveProperty('videoDuration')
    expect(t.hashtags).toEqual([])
  })

  it('translates a photo, with no video and no track', () => {
    const t = toApifyInstagramItem(PHOTO)!
    expect(t.type).toBe('Image')
    expect(t.productType).toBe('feed')
    expect(t.displayUrl).toBe('https://media.example/photo-1080.jpg')
    expect(t).not.toHaveProperty('videoUrl')
    expect(t).not.toHaveProperty('musicInfo')
  })

  it('is null with no code, and keeps none of the provider’s other fields', () => {
    expect(toApifyInstagramItem({ ...CLIP, code: '' })).toBeNull()
    expect(toApifyInstagramItem(null)).toBeNull()
    const t = toApifyInstagramItem(CLIP)!
    for (const k of ['user', 'video_versions', 'image_versions', 'clips_metadata', 'pk', 'permalink']) expect(t).not.toHaveProperty(k)
    // `caption` is the Apify name too, and is the text alone.
    expect(typeof t.caption).toBe('string')
  })

  it('reads hashtags out of a caption, once each, letters of any script', () => {
    expect(captionHashtags('#Össur run #ossur, #ossur and #登山! #a_b2')).toEqual(['Össur', 'ossur', '登山', 'a_b2'])
    expect(captionHashtags('no tags here')).toEqual([])
  })
})

describe('the translated item through the real Instagram adapter', () => {
  const config: GatherConfig = {
    brand_keywords: ['sealand gear'], competitor_keywords: [], competitor_names: [], industry_keywords: ['sustainable fashion'],
    exclude_terms: [], platforms: ['instagram'], max_videos: 100, comment_depth: 100, report_period: 'weekly', own_handles: {}, subreddits: [],
  }
  const ctx: NormaliseCtx = { clientId: 'c1', runId: 'r1', config }

  it('normalises a reel into the row the Apify item made', () => {
    const v = instagram.normaliseVideo(toApifyInstagramItem(CLIP)!, ctx)!
    expect(v).toMatchObject({
      video_id: 'DfCLIP00001',
      video_url: 'https://www.instagram.com/p/DfCLIP00001/',
      account_name: 'creator_one',
      account_followers: 173724,
      likes: 20673,
      comments_count: 44,
      views: 540527,
      shares: 0,
      content_format: 'Reel',
      upload_date: '2026-11-18',
      audio_name: 'Original audio',
      is_sponsored: false,
      duration_seconds: 7,
      hashtags: ['SlowFashion', 'Thrift'],
    })
    expect(v.engagement_rate).toBeCloseTo(3.83, 2) // (20673 + 44) / 540527
  })

  it('normalises a carousel and a photo, with no views', () => {
    const c = instagram.normaliseVideo(toApifyInstagramItem(CAROUSEL)!, ctx)!
    expect(c).toMatchObject({ video_id: 'DgCARO00002', content_format: 'Carousel', views: 0, engagement_rate: null, upload_date: '2026-11-24', account_followers: 1116313 })
    const p = instagram.normaliseVideo(toApifyInstagramItem(PHOTO)!, ctx)!
    expect(p).toMatchObject({ video_id: 'DaPHOT00003', content_format: 'Post', upload_date: '2026-07-17', likes: 297 })
  })

  it('hands the transcript and cover steps the media they read', () => {
    expect(instagram.extractMedia!(toApifyInstagramItem(CLIP)!)).toEqual({ mediaUrl: 'https://media.example/clip-720.mp4', subtitleTracks: null })
    expect(instagram.coverUrl!(toApifyInstagramItem(PHOTO)!)).toBe('https://media.example/photo-1080.jpg')
    expect(instagram.extractMedia!(toApifyInstagramItem(PHOTO)!).mediaUrl).toBeNull()
  })
})

describe('fetchHashtagFeed — paging', () => {
  it('pages with the token it was given, and stops on an empty page', async () => {
    const f = scripted(page([clip('A1'), clip('A2')], 'T1'), page([clip('B1')], 'T2'), page([], 'T3'))
    const r = await fetchHashtagFeed({ ...ARGS, fetchImpl: f.impl })
    expect(f.urls).toHaveLength(3)
    expect(f.urls[0]).toBe('https://treg.to/call/tikhub.x.instagram-v2-fetch-hashtag-posts?keyword=sustainablefashion&feed_type=recent')
    expect(f.urls[1]).toContain('&pagination_token=T1')
    expect(f.urls[2]).toContain('&pagination_token=T2')
    expect(r).toMatchObject({ pages: 3, seen: 3, partial: null })
    expect(r.items.map((i) => i.shortCode)).toEqual(['A1', 'A2', 'B1'])
    expect(r.costUsd).toBeCloseTo(0.006, 9)
  })

  it('stops on a null token', async () => {
    const f = scripted(page([clip('A1')], null))
    const r = await fetchHashtagFeed({ ...ARGS, fetchImpl: f.impl })
    expect(f.urls).toHaveLength(1)
    expect(r.pages).toBe(1)
  })

  it('stops at the page cap', async () => {
    const f = scripted(page([clip('A1')], 'T1'), page([clip('B1')], 'T2'), page([clip('C1')], 'T3'))
    const r = await fetchHashtagFeed({ ...ARGS, maxPages: 2, fetchImpl: f.impl })
    expect(f.urls).toHaveLength(2)
    expect(r.items).toHaveLength(2)
  })

  it('stops at the limit, and returns no more than it', async () => {
    const f = scripted(page([clip('A1'), clip('A2'), clip('A3')], 'T1'), page([clip('B1')], null))
    const r = await fetchHashtagFeed({ ...ARGS, limit: 2, fetchImpl: f.impl })
    expect(f.urls).toHaveLength(1)
    expect(r.items.map((i) => i.shortCode)).toEqual(['A1', 'A2'])
  })

  it('keeps the window: older posts are seen, not kept, and do not count toward the limit', async () => {
    const old = 1784275104 // 2026-07-17
    const f = scripted(page([clip('A1'), clip('OLD1', old), PHOTO], 'T1'), page([clip('OLD2', old), clip('B1')], null))
    const r = await fetchHashtagFeed({ ...ARGS, limit: 2, fetchImpl: f.impl })
    expect(r.items.map((i) => i.shortCode)).toEqual(['A1', 'B1'])
    expect(r.seen).toBe(5)
    expect(f.urls).toHaveLength(2)
  })

  it('keeps everything with no lower bound', async () => {
    const r = await fetchHashtagFeed({ ...ARGS, since: null, fetchImpl: scripted(page([clip('A1'), PHOTO], null)).impl })
    expect(r.items).toHaveLength(2)
  })

  it('de-duplicates by code across pages', async () => {
    const r = await fetchHashtagFeed({ ...ARGS, fetchImpl: scripted(page([clip('A1'), clip('A2')], 'T1'), page([clip('A2'), clip('B1')], null)).impl })
    expect(r.items.map((i) => i.shortCode)).toEqual(['A1', 'A2', 'B1'])
    expect(r.seen).toBe(3)
  })

  it('returns an empty first page as an empty answer, not an error', async () => {
    const r = await fetchHashtagFeed({ ...ARGS, fetchImpl: scripted(page([], null)).impl })
    expect(r).toMatchObject({ items: [], pages: 1, seen: 0, partial: null })
    expect(h.record).toHaveBeenCalledTimes(1)
    expect(h.record.mock.calls[0]).toMatchObject([{ outcome: 'empty', calls: 1 }])
  })
})

describe('fetchHashtagFeed — the first page decides, after it nothing throws', () => {
  it('throws a schema error when the first page is not in the shape we read', async () => {
    const drifted = { ...page([], null), data: { posts: [clip('A1')], next: null } }
    const e = await fetchHashtagFeed({ ...ARGS, fetchImpl: scripted(drifted).impl }).catch((x) => x)
    expect(e).toBeInstanceOf(ProviderError)
    expect(e.kind).toBe('schema')
  })

  it('throws a schema error when most first-page items lack a code or a date', async () => {
    const items = [clip('A1'), { ...clip('X'), code: undefined }, { ...clip('Y'), taken_at: '2026-11-18' }]
    const e = await fetchHashtagFeed({ ...ARGS, fetchImpl: scripted(page(items, null)).impl }).catch((x) => x)
    expect(e.kind).toBe('schema')
  })

  it('throws a soft error on a 200 that says it failed', async () => {
    const soft = { code: 200, router: '/api/v1/instagram/v2/fetch_hashtag_posts', data: { status: false, errorMessage: 'The requested resource does not exist.', attempts: '1' } }
    const e = await fetchHashtagFeed({ ...ARGS, fetchImpl: scripted(soft).impl }).catch((x) => x)
    expect(e).toMatchObject({ kind: 'soft', message: 'TikHub said the request failed: The requested resource does not exist.' })
    // Charged all the same, and on the ledger.
    expect(h.record.mock.calls[0]).toMatchObject([{ outcome: 'error', calls: 1, cost_usd: 0.002 }])
  })

  it('throws on a first-page HTTP error, and records it', async () => {
    const bad = new Response(JSON.stringify({ detail: { code: 400, message: 'Request failed.' } }), { status: 400 })
    const e = await fetchHashtagFeed({ ...ARGS, fetchImpl: scripted(bad).impl }).catch((x) => x)
    expect(e).toMatchObject({ kind: 'http', status: 400 })
    expect(h.record).toHaveBeenCalledTimes(1)
    expect(h.record.mock.calls[0]).toMatchObject([{ outcome: 'error', calls: 1, cost_usd: 0, items: 0 }])
  })

  it('keeps pages 1 and 2 when page 3 fails, and says so', async () => {
    const bad = () => new Response('bad gateway', { status: 400 })
    const f = scripted(page([clip('A1'), clip('A2')], 'T1'), page([clip('B1')], 'T2'), bad())
    const r = await fetchHashtagFeed({ ...ARGS, fetchImpl: f.impl })
    expect(r.items.map((i) => i.shortCode)).toEqual(['A1', 'A2', 'B1'])
    expect(r.pages).toBe(2)
    expect(r.partial).toBe('TikHub failed partway through a hashtag feed (TikHub answered HTTP 400), and the search kept the posts it had found')
    expect(h.record.mock.calls[0]).toMatchObject([{ outcome: 'partial', calls: 3, items: 3, items_seen: 3 }])
  })

  it('keeps what it has when a later page drifts in shape', async () => {
    const r = await fetchHashtagFeed({ ...ARGS, fetchImpl: scripted(page([clip('A1')], 'T1'), { data: { nope: true } }).impl })
    expect(r.items).toHaveLength(1)
    expect(r.partial).toMatch(/^TikHub failed partway through a hashtag feed \(TikHub’s answer was not in the shape/)
  })

  it('stops at the deadline after the first page, and says so', async () => {
    const slow = (async () => {
      await new Promise((r) => setTimeout(r, 15))
      return new Response(JSON.stringify(page([clip('A1')], 'T1')), { status: 200 })
    }) as unknown as typeof fetch
    const r = await fetchHashtagFeed({ ...ARGS, deadlineMs: 10, fetchImpl: slow })
    expect(r.pages).toBe(1)
    expect(r.items).toHaveLength(1)
    expect(r.partial).toBe('TikHub ran out of time partway through a hashtag feed, and the search kept the posts it had found')
  })

  it('writes ONE ledger row with the summed cost and calls', async () => {
    await fetchHashtagFeed({ ...ARGS, fetchImpl: scripted(page([clip('A1')], 'T1'), page([clip('B1'), clip('OLD', 1784275104)], 'T2'), page([], null)).impl })
    expect(h.record).toHaveBeenCalledTimes(1)
    const [row] = h.record.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(row).toMatchObject({ provider: 'tikhub', transport: 'treg', job: 'instagram.hashtag', target: 'sustainablefashion:recent', calls: 3, items_seen: 3, items: 2, outcome: 'ok', error: null })
    expect(row.cost_usd).toBeCloseTo(0.006, 9)
  })

  it('makes no call and writes no row when TikHub is not set up', async () => {
    delete process.env.TREG_API_KEY
    const f = scripted(page([clip('A1')], null))
    const e = await fetchHashtagFeed({ ...ARGS, fetchImpl: f.impl }).catch((x) => x)
    expect(e.kind).toBe('unavailable')
    expect(f.urls).toHaveLength(0)
    expect(h.record).not.toHaveBeenCalled()
  })
})
