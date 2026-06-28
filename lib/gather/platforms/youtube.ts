import type { PlatformAdapter } from '../types'
import { APIFY_ACTORS, periodToYouTubeUploadDate } from '../../config'
import { num, str, first, getPath, toDateOnly, engagementRate, searchTerms } from '../util'
import { tagAccount } from '../tagging'

// YouTube adapter. Quirks baked in from Technical.md: subscriberCount is a string
// like "35.3K subscribers" (unparseable → 0), the actor often omits a comment
// count (so commentThreshold is null = scrape all), shares don't exist, and
// like/reply counts on comments come back as strings.

export const youtube: PlatformAdapter = {
  platform: 'youtube',

  videoSearch(config) {
    return {
      actor: APIFY_ACTORS.youtube.video,
      input: {
        keywords: searchTerms(config),
        uploadDate: periodToYouTubeUploadDate(config.report_period),
        maxItems: config.max_videos,
        includeShorts: true,
        duration: 'all',
        features: 'all',
        getTrending: false,
        sort: 'r',
        customMapFunction: '(object) => { return {...object} }',
      },
    }
  },

  normaliseVideo(raw, ctx) {
    const v = raw as Record<string, unknown>

    const video_url = str(first(v.url, v.videoUrl))
    if (!video_url) return null
    const video_id = str(first(v.id, v.videoId)) || video_url.match(/[?&]v=([^&]+)/)?.[1] || ''
    if (!video_id) return null

    const account_name = str(first(getPath(v, ['channel', 'name']), v.channelName))
    const title = str(first(v.title))
    const description = str(first(v.description, v.text))
    const caption = [title, description].filter(Boolean).join(' ')
    const views = num(first(v.viewCount, v.views))
    const likes = num(first(v.likes, v.likeCount))
    const comments_count = num(first(v.comments, v.commentsCount, v.commentCount))
    const duration = num(first(v.duration, v.durationSeconds))

    const rawTags = Array.isArray(v.keywords) ? v.keywords : Array.isArray(v.tags) ? v.tags : []
    const hashtags = rawTags.map((t: unknown) => str(t)).filter(Boolean)

    return {
      client_id: ctx.clientId,
      run_id: ctx.runId,
      platform: 'youtube',
      video_id,
      video_url,
      account_name,
      // subscriberCount is a formatted string ("35.3K subscribers") — not parseable; default 0.
      account_followers: num(first(getPath(v, ['channel', 'subscriberCount']), v.subscriberCount)),
      caption,
      hashtags,
      content_format: duration > 0 && duration <= 60 ? 'short' : 'long-form',
      views,
      likes,
      shares: 0, // YouTube doesn't expose shares
      comments_count,
      engagement_rate: engagementRate(views, likes, 0, comments_count),
      upload_date: toDateOnly(v.uploadDate, v.uploadDateRaw, v.date),
      audio_name: '',
      is_sponsored: false,
      duration_seconds: Math.round(duration),
      ...tagAccount(account_name, ctx.config),
    }
  },

  commentScrape(video, config) {
    return {
      actor: APIFY_ACTORS.youtube.comment,
      input: {
        startUrls: [video.video_url],
        maxItems: config.comment_depth,
        sort: 'top',
        includeReplies: false,
        customMapFunction: '(object) => { return {...object} }',
      },
    }
  },

  normaliseComment(raw, video, ctx) {
    const c = raw as Record<string, unknown>
    const comment_id = str(first(c.id, c.commentId, c.cid))
    const text = str(first(c.text, c.comment, c.commentText))
    if (!comment_id || !text) return null

    return {
      client_id: ctx.clientId,
      run_id: ctx.runId,
      platform: 'youtube',
      video_id: video.video_id,
      comment_id,
      author: str(first(getPath(c, ['author', 'name']), c.author, c.authorName)),
      likes: num(first(c.likeCount, c.votes, c.likes)), // string in the actor output → num()
      reply_count: num(first(c.replyCount, c.replies)),
      is_reply: Boolean(first(c.isReply, false)),
      comment_date: toDateOnly(c.publishedTime, c.publishedAt, c.date),
      text,
    }
  },

  // The YouTube actor doesn't reliably return a comment count → scrape all videos.
  commentThreshold: null,
}
