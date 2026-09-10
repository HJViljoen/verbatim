import { describe, expect, it } from 'vitest'
import { computeMetrics, isDiscoveredVideo } from './metrics'
import type { VideoRow, CommentRow } from './types'

// Share rule (2026-09-10): share of tracked conversation counts everything
// relating to a brand — videos the market posted ABOUT it and the brand's OWN
// account posts — for the client and every tracked competitor alike. The
// bucket comes from IDENTITY (is_client / is_competitor + competitor_name),
// which lib/gather/owned.ts stamps onto census rows, so a post read off a
// profile lands under its own brand instead of 'industry-other'.

let n = 0
function video(v: Partial<VideoRow>): VideoRow {
  n += 1
  return {
    id: `v${n}`,
    client_id: 'c1',
    run_id: 'r1',
    platform: 'tiktok',
    video_id: `tt${n}`,
    video_url: `https://tiktok.com/${n}`,
    account_name: 'someone',
    is_client: false,
    is_competitor: false,
    competitor_name: null,
    caption: null,
    hashtags: null,
    content_format: null,
    views: 1000,
    likes: 0,
    shares: 0,
    comments_count: 0,
    engagement_rate: null,
    account_followers: null,
    upload_date: '2026-09-08',
    sentiment: null,
    source: 'discovered',
    ...v,
  } as VideoRow
}

function comment(videoId: string, text: string): CommentRow {
  n += 1
  return {
    id: `cm${n}`,
    client_id: 'c1',
    run_id: 'r1',
    platform: 'tiktok',
    video_id: videoId,
    comment_id: `x${n}`,
    author: 'a',
    text,
    likes: 0,
    comment_date: '2026-09-08',
  } as CommentRow
}

describe('computeMetrics buckets census rows by identity, not source', () => {
  const marketAboutClient = video({ video_id: 'm1', is_client: true, source: 'discovered' })
  const clientOwnPost = video({ video_id: 'o1', is_client: true, source: 'owned', account_name: 'theclient' })
  const competitorOwnPost = video({
    video_id: 'o2', is_competitor: true, competitor_name: 'Freitag', source: 'competitor_owned', account_name: 'freitag',
  })
  const marketAboutCompetitor = video({ video_id: 'm2', is_competitor: true, competitor_name: 'Freitag' })
  const category = video({ video_id: 'm3' })
  const videos = [marketAboutClient, clientOwnPost, competitorOwnPost, marketAboutCompetitor, category]

  it('counts an owned client post in the client bucket', () => {
    const m = computeMetrics(videos, [])
    expect(m.share_of_voice.client.videos).toBe(2)
    expect(m.client_videos).toBe(2)
  })

  it('counts a competitor_owned post in that competitor’s bucket', () => {
    const m = computeMetrics(videos, [])
    expect(m.share_of_voice['competitor:Freitag'].videos).toBe(2)
    expect(m.competitor_videos).toBe(2)
    // Never the catch-all: an own post is not wider-category content.
    expect(m.share_of_voice['industry-other'].videos).toBe(1)
  })

  it('divides share over the whole tracked corpus, census rows included', () => {
    const m = computeMetrics(videos, [])
    expect(m.total_videos).toBe(5)
    expect(m.share_of_voice.client.pct_videos).toBe(40)
    expect(m.share_of_voice['competitor:Freitag'].pct_videos).toBe(40)
  })

  it('keeps the comments of census videos in the comment counts', () => {
    const comments = [
      comment('m1', 'the market talking about the client'),
      comment('o1', 'a fan under the client’s own post'),
      comment('o2', 'someone under the competitor’s own post'),
    ]
    const m = computeMetrics(videos, comments)
    expect(m.total_comments).toBe(3)
    expect(m.platforms_summary.tiktok.comments).toBe(3)
  })
})

describe('isDiscoveredVideo — the filter market-only readers apply', () => {
  it('keeps discovered rows and drops both census sources', () => {
    expect(isDiscoveredVideo({ source: 'discovered' })).toBe(true)
    expect(isDiscoveredVideo({ source: null })).toBe(true)
    expect(isDiscoveredVideo({ source: 'owned' })).toBe(false)
    expect(isDiscoveredVideo({ source: 'competitor_owned' })).toBe(false)
  })
})
