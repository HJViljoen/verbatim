import type { PlatformAdapter } from '../types'
import { APIFY_ACTORS } from '../../config'
import { num, str, first, getPath, toDateOnly, cleanHashtag } from '../util'
import { tagVideo } from '../tagging'

// Instagram adapter. Quirks from Technical.md: the search input uses `hashtags`
// (alphanumeric only) / `resultsLimit` / `resultsType`, not the TikTok shape;
// IG exposes neither views nor shares; the id is the post shortcode.
//
// ⚠️ Known-broken: comment scraping currently returns 0 comments for every IG
// video. This adapter is built faithfully but is NOT proven — the actual fix
// (right actor / input, or actor swap) needs a live Phase-0 diagnosis once Apify
// is back. Treat normaliseComment as provisional.

export const instagram: PlatformAdapter = {
  platform: 'instagram',

  videoSearch(config, terms, limit) {
    // This actor applies resultsLimit PER hashtag. The orchestrator now searches
    // one keyword at a time (terms is a single hashtag), so resultsLimit is that
    // keyword's quota — matching TT/YT and removing the old per-hashtag volume skew.
    // (cleanHashtag strips '#'/spaces/punctuation — required.)
    const hashtags = terms.map(cleanHashtag).filter(Boolean)
    return {
      actor: APIFY_ACTORS.instagram.video,
      input: {
        hashtags,
        resultsLimit: limit,
        // Reels (not photo posts) for V1: positioning is "media-based" (we analyse
        // the comments, not the video), so this is a comment-signal/consistency
        // call — reels are comment-dense and keep IG consistent with the other two
        // short-form-video V1 platforms. Revisit "all posts" if IG volume is thin.
        // Confirm the exact value the actor expects (could be 'reels' / 'clips').
        resultsType: 'reels',
        keywordSearch: false,
      },
    }
  },

  normaliseVideo(raw, ctx) {
    const v = raw as Record<string, unknown>

    const video_url = str(first(v.url, v.postUrl, v.inputUrl))
    const shortCode =
      str(first(v.shortCode, v.shortcode, v.code)) ||
      video_url.match(/\/(?:p|reel|tv)\/([^/?]+)/)?.[1] ||
      ''
    if (!shortCode) return null

    const account_name = str(first(v.ownerUsername, getPath(v, ['owner', 'username'])))
    const likes = num(first(v.likesCount, v.likes))
    const comments_count = num(first(v.commentsCount, v.commentCount))

    const rawTags = Array.isArray(v.hashtags) ? v.hashtags : []
    const hashtags = rawTags.map((t: unknown) => str(t)).filter(Boolean)
    const caption = str(first(v.caption, v.text))

    return {
      client_id: ctx.clientId,
      run_id: ctx.runId,
      platform: 'instagram',
      video_id: shortCode,
      video_url: video_url || `https://www.instagram.com/p/${shortCode}/`,
      account_name,
      account_followers: num(first(v.ownerFollowers, getPath(v, ['owner', 'followers']))),
      caption,
      hashtags,
      content_format: str(first(v.type, v.productType)) || 'Reel',
      views: 0, // IG doesn't expose view counts; 0 per the schema's count convention (engagement_rate stays null)
      likes,
      shares: 0,
      comments_count,
      engagement_rate: null, // no views → no blended engagement
      upload_date: toDateOnly(v.timestamp, v.takenAt),
      audio_name: str(first(getPath(v, ['musicInfo', 'song_name']), v.musicName)),
      is_sponsored: Boolean(first(v.isSponsored, v.isPaidPartnership, false)),
      duration_seconds: Math.round(num(first(v.videoDuration, v.duration))),
      ...tagVideo({ account_name, caption, hashtags }, ctx.config),
    }
  },

  commentScrape(video, config) {
    return {
      actor: APIFY_ACTORS.instagram.comment,
      input: {
        directUrls: [video.video_url],
        resultsLimit: config.comment_depth,
        includeNestedComments: false,
      },
    }
  },

  normaliseComment(raw, video, ctx) {
    const c = raw as Record<string, unknown>
    const comment_id = str(first(c.id, c.commentId, c.pk))
    const text = str(first(c.text, c.comment))
    if (!comment_id || !text) return null

    return {
      client_id: ctx.clientId,
      run_id: ctx.runId,
      platform: 'instagram',
      video_id: video.video_id,
      comment_id,
      author: str(first(c.ownerUsername, getPath(c, ['owner', 'username']))),
      text,
      likes: num(first(c.likesCount, c.likeCount)),
      reply_count: 0, // IG doesn't expose reply counts
      is_reply: false,
      comment_date: toDateOnly(c.timestamp, c.createdAt),
    }
  },

  // null = scrape comments for every IG video found (don't gate on comments_count).
  // IG comment counts are unreliable, and this is the broken-scraper we're
  // explicitly re-validating — gating would risk silently skipping the test.
  // Revisit to a threshold once IG comments are proven working.
  commentThreshold: null,
}
