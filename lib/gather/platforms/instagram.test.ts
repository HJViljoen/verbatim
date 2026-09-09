import { describe, it, expect } from 'vitest'
import { instagram } from './instagram'
import type { GatherConfig, NormaliseCtx } from '../types'

// Instagram's dated dual search (2026-09-09). The flagship actor returns EITHER
// reels OR feed posts per call, so the two variants are the whole surface; the
// fixtures below are real items from the live verification runs against
// /explore/tags/cotopaxi (reels) and a posts-mode tag search, trimmed to the
// fields the normaliser reads.

const config: GatherConfig = {
  brand_keywords: ['sealand gear'],
  competitor_keywords: [],
  competitor_names: ['Cotopaxi'],
  industry_keywords: ['upcycled bag'],
  platforms: ['instagram'],
  max_videos: 100,
  comment_depth: 100,
  report_period: 'monthly',
  own_handles: {},
  subreddits: [],
}
const ctx: NormaliseCtx = { clientId: 'c1', runId: 'r1', config }

// 3 reels-mode items + 2 posts-mode items, verbatim from the live runs.
const REELS = [
  {
    url: 'https://www.instagram.com/p/DckqNSpJQk5/',
    shortCode: 'DckqNSpJQk5',
    type: 'Video',
    productType: 'clips',
    ownerUsername: 'bliee_',
    likesCount: -1, // likes hidden
    commentsCount: 33,
    videoPlayCount: 22098,
    timestamp: '2026-08-28T05:59:38.000Z',
    videoDuration: 13.442000389099121,
    paidPartnership: false,
    hashtags: ['유타원정대', '코토팍시'],
    caption: '#유타원정대',
    musicInfo: { artist_name: 'The Ventures', song_name: "Let's Go" },
  },
  {
    url: 'https://www.instagram.com/p/DcZPaIzxwGp/',
    shortCode: 'DcZPaIzxwGp',
    type: 'Video',
    productType: 'clips',
    ownerUsername: 'alisha_maeee',
    likesCount: 777,
    commentsCount: 64,
    videoPlayCount: 12634,
    timestamp: '2026-08-23T19:34:55.000Z',
    videoDuration: 29.465999603271484,
    paidPartnership: true,
    hashtags: ['myakkastatepark', 'cotopaxi'],
    caption: '🌴 Myakka River State Park | Sarasota, FL',
    musicInfo: { song_name: 'Original audio' },
  },
  {
    url: 'https://www.instagram.com/p/DcGFVGCTiys/',
    shortCode: 'DcGFVGCTiys',
    type: 'Video',
    productType: 'clips',
    ownerUsername: 'sagarpardikar',
    likesCount: 1314,
    commentsCount: 20,
    videoPlayCount: 11083,
    timestamp: '2026-08-16T09:00:28.000Z',
    videoDuration: 14,
    paidPartnership: false,
    hashtags: ['Cotopaxi', 'Ecuador'],
    caption: 'Every step was worth this view. 🏔️🇪🇨',
    musicInfo: { song_name: 'One Day (Epic Cover)' },
  },
]

const POSTS = [
  {
    url: 'https://www.instagram.com/p/DdEi8_gFOFx/',
    shortCode: 'DdEi8_gFOFx',
    type: 'Image',
    productType: 'feed',
    ownerUsername: 'katari.financiera',
    likesCount: 2,
    commentsCount: 0,
    timestamp: '2026-09-09T15:07:31.000Z',
    paidPartnership: false,
    hashtags: ['Katari', 'Cotopaxi'],
    caption: 'AHORRA CON KATARI',
  },
  {
    url: 'https://www.instagram.com/p/DdEe3doHDP_/',
    shortCode: 'DdEe3doHDP_',
    type: 'Sidecar',
    productType: 'carousel_container',
    ownerUsername: 'grupo_cai',
    likesCount: 1,
    commentsCount: 0,
    timestamp: '2026-09-09T14:31:48.000Z',
    paidPartnership: false,
    hashtags: ['Machachi', 'Cotopaxi'],
    caption: 'EL HOGAR QUE ESTABAS BUSCANDO',
  },
]

describe('instagram.videoSearch — dated hashtag search, one variant per call', () => {
  it('asks the flagship actor for a tag URL with a date bound', () => {
    // cleanHashtag strips '#', spaces and punctuation; case is the actor's
    // problem (Instagram tag URLs are case-insensitive).
    const { input } = instagram.videoSearch!(config, ['#upcycled bag'], 40, { variant: 'reels' })
    expect(input.directUrls).toEqual(['https://www.instagram.com/explore/tags/upcycledbag/'])
    expect(input.resultsType).toBe('reels')
    expect(input.resultsLimit).toBe(40)
    expect(input.onlyPostsNewerThan).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('switches surface on the variant, and defaults to reels', () => {
    expect(instagram.videoSearch!(config, ['bag'], 10, { variant: 'posts' }).input.resultsType).toBe('posts')
    expect(instagram.videoSearch!(config, ['bag'], 10).input.resultsType).toBe('reels')
  })

  it('declares both variants so the planner fans a keyword out over the whole surface', () => {
    expect(instagram.searchVariants).toEqual(['reels', 'posts'])
  })
})

describe('instagram.normaliseVideo — flagship item mapping', () => {
  it('reads plays, engagement and the paid-partnership flag off a reel', () => {
    const v = instagram.normaliseVideo(REELS[1], ctx)!
    expect(v.video_id).toBe('DcZPaIzxwGp')
    expect(v.account_name).toBe('alisha_maeee')
    expect(v.views).toBe(12634)
    expect(v.likes).toBe(777)
    expect(v.comments_count).toBe(64)
    expect(v.content_format).toBe('Reel')
    expect(v.engagement_rate).toBeCloseTo(6.66, 2) // (777 + 64) / 12634
    expect(v.is_sponsored).toBe(true)
    expect(v.upload_date).toBe('2026-08-23')
    expect(v.duration_seconds).toBe(29)
    expect(v.audio_name).toBe('Original audio')
  })

  it('floors hidden likes (-1) at zero rather than subtracting them', () => {
    const v = instagram.normaliseVideo(REELS[0], ctx)!
    expect(v.likes).toBe(0)
    expect(v.views).toBe(22098)
    expect(v.engagement_rate).toBeCloseTo(0.15, 2) // 33 / 22098
  })

  it('maps productType to the format the product speaks', () => {
    expect(instagram.normaliseVideo(REELS[2], ctx)!.content_format).toBe('Reel')
    expect(instagram.normaliseVideo(POSTS[0], ctx)!.content_format).toBe('Post')
    expect(instagram.normaliseVideo(POSTS[1], ctx)!.content_format).toBe('Carousel')
  })

  it('leaves photo posts without views or an engagement rate', () => {
    const v = instagram.normaliseVideo(POSTS[0], ctx)!
    expect(v.views).toBe(0)
    expect(v.engagement_rate).toBeNull()
    expect(v.duration_seconds).toBe(0)
  })

  it('still normalises the older hashtag-scraper shape (type, no productType)', () => {
    const legacy = { url: 'https://www.instagram.com/p/ABC123/', shortCode: 'ABC123', type: 'Video', ownerUsername: 'x', likesCount: 10, commentsCount: 2, timestamp: '2026-09-01T00:00:00.000Z' }
    const v = instagram.normaliseVideo(legacy, ctx)!
    expect(v.content_format).toBe('Reel')
    expect(v.views).toBe(0)
  })
})

describe('instagram.extractMedia — a photo post has nothing to transcribe', () => {
  it('returns no media URL for a feed image (→ transcript no_media)', () => {
    expect(instagram.extractMedia!(POSTS[0]).mediaUrl).toBeNull()
  })
})
