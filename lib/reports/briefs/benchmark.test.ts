import { describe, expect, it } from 'vitest'

import type { PlaybookVideo } from '../../pages/playbook'
import { BEST_MIN_VIEWS, matchedKinds, matchedPosts, platformTypicals, type MatchedPostIn } from './benchmark'

// Content's measure platform by platform (benchmark.ts). Made-up videos.

const OCT = '2026-10-01'
let n = 0
const video = (platform: string, rate: number, o: Partial<PlaybookVideo> = {}): PlaybookVideo => ({
  id: `v${++n}`, upload_date: '2026-10-10', platform, classified_type: null, hook_style: null, engagement_rate: rate,
  is_client: false, is_competitor: false, competitor_name: null, source: 'discovered', sentiment: null, sentiment_source: null, analyzed_lane: 'full', ...o,
})
// TikTok's typical video at 6%, YouTube's at 1.5%: pooled, the category's
// median sits between them.
const CATEGORY = [
  ...[5, 6, 7].map((r) => video('tiktok', r, { classified_type: 'entertainment' })),
  ...[5.5, 6, 6.5].map((r) => video('tiktok', r, { classified_type: 'testimonial' })),
  ...[1, 1.5, 2].map((r) => video('youtube', r, { classified_type: 'testimonial' })),
  video('reddit', 40), // Reddit's rate is not comparable: never typical
  video('tiktok', 90, { upload_date: '2026-09-30' }), // another month
]
const post = (platform: string, rate: number, views: number, day = '2026-10-12'): MatchedPostIn => ({ id: `p${++n}`, platform, upload_date: day, classified_type: 'testimonial', engagement_rate: rate, views })

describe('platform by platform', () => {
  it('a typical video per platform, from the category\'s rated videos published in the month', () => {
    expect(Object.fromEntries(platformTypicals(CATEGORY, OCT))).toEqual({ tiktok: 6, youtube: 1.5 })
    // Under the floor of three rated videos, a platform has no typical video.
    expect(platformTypicals([video('instagram', 3), video('instagram', 4)], OCT).has('instagram')).toBe(false)
  })

  it('a kind made mostly on a high-rate platform does not read high for being there', () => {
    const t = platformTypicals(CATEGORY, OCT)
    const kinds = matchedKinds(CATEGORY, OCT, 'classified_type', t)
    expect(kinds.get('entertainment')).toEqual({ multiple: 1, rated: 3 })
    expect(kinds.get('testimonial')).toEqual({ multiple: 1, rated: 6 })
  })

  it('your posts each against their own platform; the best needs its views', () => {
    const t = platformTypicals(CATEGORY, OCT)
    const posts = [post('tiktok', 4.2, 600), post('tiktok', 3, 2_000), post('tiktok', 4.8, 1_500), post('youtube', 6, 105), post('reddit', 50, 9_000)]
    const m = matchedPosts(posts, t, 3)
    // 0.7, 0.5, 0.8 on TikTok and 4.0 on YouTube: the median of the four.
    expect(m.response).toEqual({ multiple: 0.8, rated: 4 })
    expect(m.platforms).toEqual([{ platform: 'tiktok', multiple: 0.7, rated: 3 }, { platform: 'youtube', multiple: 4, rated: 1 }])
    // The YouTube post's 4× rests on 105 views: not the best.
    expect(m.best?.post.views).toBeGreaterThanOrEqual(BEST_MIN_VIEWS)
    expect(m.best?.multiple).toBe(0.8)
    expect(matchedPosts(posts.slice(0, 2), t, 3).response).toBeNull()
  })
})
