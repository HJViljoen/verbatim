import type { GatherConfig, PlatformAdapter } from '../types'
import { APIFY_ACTORS, COMMENT_THRESHOLD, IG_HASHTAG_DEADLINE_MS, IG_HASHTAG_MAX_PAGES, periodSince } from '../../config'
import { num, str, first, getPath, toDateOnly, cleanHashtag, engagementRate } from '../util'
import { tagVideo } from '../tagging'
import { fetchHashtagFeed } from '../providers/tikhub-instagram'

// Instagram adapter. Discovery runs on TikHub's hashtag feed first and the
// flagship apify/instagram-scraper last (2026-11-28, `fetchVideos` and
// `videoSearch` below). The actor (2026-09-09): hashtag pages by `directUrls`,
// one `resultsType` per call, `resultsLimit` per url, `onlyPostsNewerThan` for
// the window. IG exposes no share count; reels (only) carry plays; the id is
// the post shortcode.
//
// Comments (2026-07-05): moved off apify/instagram-comment-scraper (returned 0
// for every video) to the flagship apify/instagram-scraper in `comments` mode —
// far more used/maintained, same output field names. Root-cause suspect for the
// 0s: that actor only accepts POST urls (/p/…), and the hashtag scraper hands us
// /reel/… urls — so commentScrape now builds the canonical /p/{shortcode}/ form
// from the shortcode. ⚠️ Not yet re-run live (Apify was over-quota) — smoke-test
// one IG video's comments on the next paid run before trusting it.

/** `productType` → the format name the product speaks. The flagship actor
 *  reports 'clips' (a reel), 'feed' (a single photo/video post) and
 *  'carousel_container' (a multi-image post); `type` ('Video'/'Image'/'Sidecar')
 *  is the older, coarser field and stays as the fallback. */
function contentFormat(v: Record<string, unknown>): string {
  const productType = str(v.productType)
  if (productType === 'clips') return 'Reel'
  if (productType === 'feed') return 'Post'
  if (productType === 'carousel_container') return 'Carousel'
  const type = str(v.type)
  if (type === 'Video') return 'Reel'
  if (type === 'Sidecar') return 'Carousel'
  if (type === 'Image') return 'Post'
  return 'Reel'
}

/** The search's lower bound, 'YYYY-MM-DD': the run's frozen window when there
 *  is one, else the period's. ONE function for both sources (the Apify actor's
 *  `onlyPostsNewerThan`, TikHub's window filter), so they cannot drift. */
function searchSince(config: GatherConfig): string {
  return config.window?.start?.slice(0, 10) ?? periodSince(config.report_period)
}

export const instagram: PlatformAdapter = {
  platform: 'instagram',

  // Both halves of Instagram, dated at the source (2026-09-09). The flagship
  // actor answers a hashtag URL with EITHER reels OR feed posts per call, so a
  // keyword only gets its full surface from two searches — see `searchVariants`.
  // `onlyPostsNewerThan` moves the window into the search itself: the hashtag
  // scraper had no date input, so IG was the one platform paying for whatever
  // the tag page happened to show and then discarding most of it in the gate.
  //
  // Baseline (unwindowed) runs are dated here too, exactly as TikTok's
  // `dateRange` and YouTube's `publishedAfter` already are — a search bound is
  // the platform's, not the run's.
  //
  // 28 Nov 2026: this actor search is now the FALLBACK. From about 17 Nov its
  // `posts` mode returned 1 to 9 items a search, not 70, on every build
  // (Instagram's hashtag page stopped handing out a dense recent feed; tested
  // 24 Nov), so discovery collapsed. TikHub's hashtag feed, paged and filtered
  // to the window, recovered about seven times more recent posts in a live
  // test, so it runs first (`fetchVideos`) and this runs only when TikHub is
  // not set up, over budget, failing or empty. The variants, and so the step
  // ids, are unchanged.
  searchVariants: ['reels', 'posts'] as const,

  videoSearch(config, terms, limit, opts) {
    // resultsLimit is PER url. The orchestrator searches one keyword at a time
    // (terms is a single hashtag), so it is that keyword's quota — matching
    // TT/YT. (cleanHashtag strips '#'/spaces/punctuation — required.)
    const hashtags = terms.map(cleanHashtag).filter(Boolean)
    return {
      actor: APIFY_ACTORS.instagram.video,
      input: {
        directUrls: hashtags.map((t) => `https://www.instagram.com/explore/tags/${t}/`),
        resultsType: opts?.variant ?? 'reels',
        resultsLimit: limit,
        // The run's frozen window when there is one — the actor takes any date,
        // so it gets the exact lower bound. A baseline run has none: it keeps
        // the period-derived date, exactly as before (a search bound is the
        // platform's, not the run's).
        onlyPostsNewerThan: searchSince(config),
      },
    }
  },

  // The native source (28 Nov 2026): TikHub's hashtag feed, paged and kept to
  // the same lower bound the actor gets. searchOne routes Instagram's search
  // through the provider router, so this runs FIRST and `videoSearch` + Apify
  // only when it fails or finds nothing (lib/gather/providers/router.ts).
  // Variant `reels` asks for the reels feed and `posts` for the recent feed,
  // the pair that gave the most distinct recent posts on 28 Nov (the reels
  // feed carries photos and carousels too); the step ids keep their variants.
  async fetchVideos(config, terms, limit, opts) {
    const tag = cleanHashtag(terms[0] ?? '')
    if (!tag) return []
    const feed = (opts?.variant ?? 'reels') === 'posts' ? 'recent' : 'reels'
    const r = await fetchHashtagFeed({
      tag, feed, since: searchSince(config), limit,
      maxPages: IG_HASHTAG_MAX_PAGES, deadlineMs: IG_HASHTAG_DEADLINE_MS,
    })
    if (r.partial) opts?.note?.(r.partial)
    return r.items
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
    // -1 is Instagram's "likes hidden", not a count — floor it at 0 so it can
    // never subtract from an engagement rate or a leaderboard.
    const likes = Math.max(0, num(first(v.likesCount, v.likes)))
    const comments_count = Math.max(0, num(first(v.commentsCount, v.commentCount)))
    const views = Math.max(0, num(first(v.videoPlayCount, v.igPlayCount)))

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
      content_format: contentFormat(v),
      // The flagship actor DOES expose plays on reels (`videoPlayCount`) — the
      // hashtag scraper never did, hence the old hardcoded 0. Photo posts still
      // carry no count, and 0 views keeps engagement_rate null for them.
      views,
      likes,
      shares: 0,
      comments_count,
      engagement_rate: views > 0 ? engagementRate(views, likes, 0, comments_count) : null,
      upload_date: toDateOnly(v.timestamp, v.takenAt),
      audio_name: str(first(getPath(v, ['musicInfo', 'song_name']), v.musicName)),
      is_sponsored: Boolean(first(v.paidPartnership, v.isSponsored, v.isPaidPartnership, false)),
      duration_seconds: Math.round(num(first(v.videoDuration, v.duration))),
      ...tagVideo({ account_name, caption, hashtags }, ctx.config),
    }
  },

  // Verified live 2026-08-08: the flagship actor in `posts` mode returns the
  // same `videoUrl`/`audioUrl` pair the hashtag scraper does, so extractMedia
  // reads a refetched item unchanged. resultsLimit is PER url — 1 each.
  refetchByUrl(videoUrls) {
    return {
      actor: APIFY_ACTORS.instagram.post,
      input: {
        directUrls: videoUrls,
        resultsType: 'posts',
        resultsLimit: 1,
        addParentData: false,
      },
    }
  },

  // Transcript source (Step 1): the item carries a separate audio-only stream at
  // `audioUrl` alongside the full mp4 at `videoUrl` — no caption field, so IG is
  // always Whisper. Verified on real data 2026-07-23.
  //
  // audioUrl FIRST (2026-08-08): Whisper only ever hears the audio, and the mp4
  // blew the 25MB cap on 7 of 60 backfilled videos (one was 110MB) and returned
  // undecodable bytes on 5 more. Pulling the audio track alone fixes both and
  // cuts the download by an order of magnitude. videoUrl stays as the fallback.
  extractMedia(raw) {
    const v = raw as Record<string, unknown>
    return { mediaUrl: str(first(v.audioUrl, v.videoUrl)) || null, subtitleTracks: null }
  },

  // Cover frame (WP7b, 2026-09-12). Verified on real video_raw rows: `displayUrl`
  // is present on 60 of 60 sampled items — reels (type Video / productType
  // clips) included — and is the poster frame the grid shows. `images[0]` is the
  // same URL when the field is populated at all, kept only as drift tolerance;
  // there is no `thumbnailUrl` in this actor's output. Signed CDN link, expires
  // in days, so it is only ever read during the run that gathered it.
  coverUrl(raw) {
    const v = raw as Record<string, unknown>
    const images = Array.isArray(v.images) ? v.images : []
    return str(first(v.displayUrl, images[0])) || null
  },

  commentScrape(video, config) {
    return {
      actor: APIFY_ACTORS.instagram.comment,
      input: {
        // Flagship apify/instagram-scraper, comments mode. It only accepts POST
        // urls (/p/…), not /reel/… — build the canonical form from the shortcode
        // (video_id) rather than passing the hashtag scraper's /reel/ url.
        directUrls: [`https://www.instagram.com/p/${video.video_id}/`],
        resultsType: 'comments',
        resultsLimit: config.comment_depth,
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
      reply_count: num(first(c.repliesCount, c.replyCount)), // flagship exposes repliesCount
      is_reply: false,
      comment_date: toDateOnly(c.timestamp, c.createdAt),
    }
  },

  // A video needs COMMENT_THRESHOLD (5) comments for a comment scrape, the
  // same bar as TikTok. It was null (scrape every IG video) until comments were
  // proven working on the 2026-07-09 Sealand run (5,840 comments): on that run
  // a ≥5 gate skips ~35% of IG comment scrapes (the cost driver — one paid
  // actor run per video) while losing ~2.5% of comments.
  commentThreshold: COMMENT_THRESHOLD,
}
