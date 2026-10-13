import { describe, expect, it } from 'vitest'

import type { PlaybookVideo } from '../pages/playbook'
import { fakeDb } from '../test/fake-db'
import { isOwnedPost, ownedPosts, OWNED_SOURCE, summariseOwnedPosts, type OwnedPost } from './owned'

// The one "your posts" read (depth v2, T14), over Össur-shaped fixtures: its
// own accounts on three platforms, and creators' videos that name it.

type Row = Parameters<typeof summariseOwnedPosts>[0][number]

const row = (over: Partial<Row> & { id: string }): Row => ({
  video_id: `native-${over.id}`,
  platform: 'instagram',
  video_url: `https://example.com/${over.id}`,
  account_name: 'ossur',
  upload_date: '2026-10-05',
  caption: 'Meet the Navii',
  classified_type: null,
  hook_style: null,
  hook_text: null,
  engagement_rate: null,
  views: 0,
  likes: 0,
  comments_count: 0,
  topics: null,
  is_client: true,
  is_competitor: false,
  competitor_name: null,
  source: 'owned',
  sentiment: null,
  sentiment_source: null,
  analyzed_lane: null,
  ...over,
})

const OCTOBER = { from: '2026-10-01', to: '2026-11-01' }

describe('isOwnedPost', () => {
  it('is the source, and only the source', () => {
    expect(OWNED_SOURCE).toBe('owned')
    expect(isOwnedPost({ source: 'owned' })).toBe(true)
    expect(isOwnedPost({ source: 'discovered' })).toBe(false)
    expect(isOwnedPost({ source: 'competitor_owned' })).toBe(false)
    expect(isOwnedPost({ source: null })).toBe(false)
    expect(isOwnedPost({})).toBe(false)
  })
})

describe('summariseOwnedPosts', () => {
  it('does NOT count a creator’s video that names the brand (is_client, discovered)', () => {
    const creator = row({
      id: 'creator-review',
      account_name: 'amputee.coach',
      caption: 'My honest review of the Össur Navii knee',
      is_client: true,
      source: 'discovered',
    })
    const own = row({ id: 'own-1' })
    const out = summariseOwnedPosts([creator, own], OCTOBER)
    expect(out.posts.map((p) => p.id)).toEqual(['own-1'])
    expect(out.total).toBe(1)
    expect(out.byPlatform).toEqual([{ platform: 'instagram', posts: 1 }])
  })

  it('counts a post off the own account whatever is_client says (the pre-repair damage)', () => {
    const out = summariseOwnedPosts([row({ id: 'own-untagged', is_client: false })], OCTOBER)
    expect(out.total).toBe(1)
  })

  it('leaves a rival’s own post out', () => {
    const rival = row({ id: 'rival', source: 'competitor_owned', is_client: false, is_competitor: true, competitor_name: 'Ottobock' })
    expect(summariseOwnedPosts([rival], OCTOBER).total).toBe(0)
  })

  it('keeps the window half-open and never counts an undated post', () => {
    const out = summariseOwnedPosts([
      row({ id: 'first-day', upload_date: '2026-10-01' }),
      row({ id: 'last-day', upload_date: '2026-10-31' }),
      row({ id: 'next-month', upload_date: '2026-11-01' }),
      row({ id: 'last-month', upload_date: '2026-09-30' }),
      row({ id: 'undated', upload_date: null }),
    ], OCTOBER)
    expect(out.posts.map((p) => p.id)).toEqual(['last-day', 'first-day'])
  })

  it('takes instants as well as days for the window', () => {
    const out = summariseOwnedPosts(
      [row({ id: 'a', upload_date: '2026-10-01' }), row({ id: 'b', upload_date: '2026-11-01' })],
      { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' },
    )
    expect(out.window).toEqual(OCTOBER)
    expect(out.posts.map((p) => p.id)).toEqual(['a'])
  })

  it('counts by platform, most first, and orders posts newest first', () => {
    const out = summariseOwnedPosts([
      row({ id: 'ig-1', platform: 'instagram', upload_date: '2026-10-02' }),
      row({ id: 'ig-2', platform: 'instagram', upload_date: '2026-10-09' }),
      row({ id: 'ig-3', platform: 'instagram', upload_date: '2026-10-09' }),
      row({ id: 'yt-1', platform: 'youtube', upload_date: '2026-10-03' }),
      row({ id: 'tt-1', platform: 'tiktok', upload_date: '2026-10-07' }),
      row({ id: 'yt-2', platform: 'youtube', upload_date: '2026-10-08' }),
    ], OCTOBER)
    expect(out.basis).toBe('published')
    expect(out.total).toBe(6)
    expect(out.byPlatform).toEqual([
      { platform: 'instagram', posts: 3 },
      { platform: 'youtube', posts: 2 },
      { platform: 'tiktok', posts: 1 },
    ])
    expect(out.posts.map((p) => p.id)).toEqual(['ig-2', 'ig-3', 'yt-2', 'tt-1', 'yt-1', 'ig-1'])
  })

  it('reads numeric columns as numbers and keeps a missing rate null', () => {
    const [reel, photo] = summariseOwnedPosts([
      row({ id: 'reel', upload_date: '2026-10-05', engagement_rate: '4.25', views: '1200', likes: '48', comments_count: '3' }),
      row({ id: 'photo', upload_date: '2026-10-04', engagement_rate: null, views: 0, likes: 30 }),
    ], OCTOBER).posts
    expect(reel).toMatchObject({ engagement_rate: 4.25, views: 1200, likes: 48, comments_count: 3 })
    expect(photo.engagement_rate).toBeNull()
  })

  it('carries what the Content page prints for each post', () => {
    const [p] = summariseOwnedPosts([row({
      id: 'navii', classified_type: 'testimonial', hook_style: 'demonstration', hook_text: 'Meet the Navii',
      engagement_rate: 2.2, caption: 'Meet the Navii', platform: 'tiktok',
    })], OCTOBER).posts
    expect(p).toMatchObject({
      platform: 'tiktok', upload_date: '2026-10-05', caption: 'Meet the Navii',
      classified_type: 'testimonial', hook_style: 'demonstration', engagement_rate: 2.2,
    })
  })

  it('is a PlaybookVideo as it stands, so the playbook can take its posts', () => {
    const [p] = summariseOwnedPosts([row({ id: 'x' })], OCTOBER).posts
    const asPlaybook: PlaybookVideo = p satisfies OwnedPost
    expect(asPlaybook.source).toBe('owned')
  })
})

describe('ownedPosts · the read', () => {
  it('filters on source = owned and the window, never on is_client', async () => {
    const db = fakeDb({
      videos: [
        { ...row({ id: 'own' }), client_id: 'c1' },
        { ...row({ id: 'creator', source: 'discovered', account_name: 'amputee.coach' }), client_id: 'c1' },
        { ...row({ id: 'other-tenant' }), client_id: 'c2' },
        { ...row({ id: 'september', upload_date: '2026-09-30' }), client_id: 'c1' },
      ],
    })
    const out = await ownedPosts({ supabase: db.client, clientId: 'c1' }, { from: '2026-10-01T00:00:00Z', to: '2026-11-01' })
    expect(out.posts.map((p) => p.id)).toEqual(['own'])
    const [read] = db.calls
    expect(read.table).toBe('videos')
    expect(read.filters).toEqual(expect.arrayContaining(['client_id=c1', 'source=owned', 'upload_date>=2026-10-01', 'upload_date<2026-11-01']))
    expect(read.filters.some((f) => f.startsWith('is_client'))).toBe(false)
  })
})
