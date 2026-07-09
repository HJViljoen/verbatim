// Gather (Branch 1) types. Gather is a pure data pipeline: search → normalise →
// store videos + comments. No GPT — classification/insights are the separate
// analysis pipeline (lib/pipeline). These shapes narrow only the columns gather
// writes; the live schema source of truth is Architecture/Schema-Actual.

export type Platform = 'tiktok' | 'youtube' | 'instagram'

/** The tracking_configs subset gather needs. */
export interface GatherConfig {
  brand_keywords: string[]
  competitor_keywords: string[]
  competitor_names: string[]
  industry_keywords: string[]
  platforms: string[]
  max_videos: number
  comment_depth: number
  report_period: string // 'daily' | 'weekly' | 'monthly'
}

/** A row ready to upsert into `videos`. Only gather-owned columns — Pass A
 *  later PATCHes classified_type / hook_style / sentiment / topics in place, so
 *  those are deliberately absent here (a re-gather merge must not clobber them). */
export interface VideoInsert {
  client_id: string
  run_id: string
  platform: Platform
  video_id: string
  video_url: string
  account_name: string
  account_followers: number
  caption: string
  hashtags: string[]
  content_format: string
  views: number | null
  likes: number
  shares: number
  comments_count: number
  engagement_rate: number | null
  upload_date: string | null // DATE column → 'YYYY-MM-DD'
  audio_name: string
  is_sponsored: boolean
  duration_seconds: number
  is_client: boolean
  is_competitor: boolean
  competitor_name: string | null
  /** Keyword(s) whose search surfaced this video. Set by the gather orchestrator
   *  (unioned across a run's per-keyword searches), not by the normalisers. */
  source_keywords?: string[]
}

/** A row ready to upsert into `comments`. `video_id` is the platform id (text),
 *  matching how analysis joins comments → videos by (platform, video_id). */
export interface CommentInsert {
  client_id: string
  run_id: string
  platform: Platform
  video_id: string
  comment_id: string
  author: string
  text: string
  likes: number
  reply_count: number
  is_reply: boolean
  comment_date: string | null
}

/** Raw Apify dataset item. Actor output is loosely and inconsistently shaped, so
 *  it's an unknown record and the adapters extract defensively. */
export type RawItem = Record<string, unknown>

/** Client/run ids + config threaded into the normalisers. */
export interface NormaliseCtx {
  clientId: string
  runId: string
  config: GatherConfig
}

/** The minimum a video needs for its comment scrape. */
export interface VideoRef {
  video_id: string
  video_url: string
  comments_count: number
}

/**
 * A platform's gather knowledge — the ONLY thing that differs across TT/YT/IG.
 * Everything else (search → normalise → upsert → comment loop) is
 * platform-agnostic in gather.ts. This is the clean replacement for n8n's three
 * near-duplicate workflows.
 */
export interface PlatformAdapter {
  platform: Platform
  /**
   * Apify actor slug + input for ONE video search over the given `terms`, capped
   * at `limit` results. The orchestrator calls this once per KEYWORD (so `terms`
   * is normally a single-element array) — every keyword gets its own equal-quota
   * search. This (a) levels the cross-platform volume skew (the IG actor applies
   * its limit per-hashtag while TT/YT applied it per combined group) and (b) makes
   * every video attributable to the keyword that found it, for keyword value scoring.
   *
   * Apify-sourced platforms (TikTok, Instagram) implement this; a platform on a
   * native API (YouTube) provides `fetchVideos` instead — see below.
   */
  videoSearch?(config: GatherConfig, terms: string[], limit: number): { actor: string; input: RawItem }
  /** Apify actor slug + input for scraping one video's comments. */
  commentScrape?(video: VideoRef, config: GatherConfig): { actor: string; input: RawItem }
  /**
   * Native (non-Apify) source: fetch a keyword's raw video items directly. When
   * present, the orchestrator uses this instead of `videoSearch` + Apify. YouTube
   * uses it to call the official Data API; the returned items feed `normaliseVideo`
   * exactly like Apify dataset items would.
   */
  fetchVideos?(config: GatherConfig, terms: string[], limit: number): Promise<RawItem[]>
  /** Native (non-Apify) source: fetch one video's raw comment items directly. */
  fetchComments?(video: VideoRef, config: GatherConfig): Promise<RawItem[]>
  /** Raw actor item → VideoInsert. null = skip (unparseable / no url). */
  normaliseVideo(raw: RawItem, ctx: NormaliseCtx): VideoInsert | null
  /** Raw actor item → CommentInsert. null = skip. */
  normaliseComment(raw: RawItem, video: VideoRef, ctx: NormaliseCtx): CommentInsert | null
  /**
   * Min comments_count before a video is worth a comment scrape. `null` = scrape
   * all of them (YouTube — its actor doesn't reliably report a comment count).
   */
  commentThreshold: number | null
}
