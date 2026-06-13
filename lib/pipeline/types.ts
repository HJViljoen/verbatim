// Minimal DB row shapes for the analysis pipeline. Supabase admin queries
// return untyped rows; these narrow to the columns the passes actually read.
// Source of truth for the schema: Architecture/Schema-Actual.

export interface VideoRow {
  id: string
  client_id: string
  run_id: string | null
  platform: string
  video_id: string
  video_url: string
  account_name: string
  is_client: boolean
  is_competitor: boolean
  competitor_name: string | null
  caption: string | null
  hashtags: string[] | null
  content_format: string | null
  views: number | null
  likes: number | null
  shares: number | null
  comments_count: number | null
  engagement_rate: number | null
  account_followers: number | null
}

export interface CommentRow {
  id: string
  client_id: string
  run_id: string | null
  platform: string
  video_id: string
  comment_id: string | null
  author: string | null
  text: string | null
  likes: number | null
}

/** One bucket of the share-of-voice breakdown. */
export interface SovEntry {
  videos: number
  views: number
  pct_videos: number
}

/** Per-platform sub-metrics. `avg_engagement_rate` is null for view-less
 *  platforms (Instagram) — its likes-per-follower rate lives in `eng_note`. */
export interface PlatformSummary {
  videos: number
  comments: number
  views: number
  avg_engagement_rate: number | null
}

/** A Pass A insight joined to its source video's entity flags, as Step A2 reads
 *  it. The entity (client / competitor / industry-other) is derived here from
 *  the video, never stored on the insight (invariant 7). */
export interface InsightRow {
  id: string
  category: string
  theme: string
  description: string
  strength_score: number
  emotion: string
  sentiment_impact: string
  source_video_id: string
  platform: string
  is_client: boolean
  is_competitor: boolean
  competitor_name: string | null
}

/** One clustered theme produced by Step A2 and consumed (in memory) by Pass
 *  C/D. `theme` is the canonical label = the highest-strength member's slug
 *  (Pass B deferred to v5). `evidenceCount` = distinct supporting videos — the
 *  value the evidence floor checks. */
export interface AggregatedTheme {
  bucket: string
  category: string
  theme: string
  memberThemes: string[]
  supportingVideoIds: string[]
  supportingInsightIds: string[]
  evidenceCount: number
  strengthScore: number
  dominantEmotion: string
  dominantSentimentImpact: string
}

/** Output of Step 2a (metrics). Held in memory for Pass A / Step 2b. */
export interface Step2aMetrics {
  total_videos: number
  total_comments: number
  client_videos: number
  competitor_videos: number
  platforms_covered: string[]
  avg_engagement_rate: number
  top_video_id: string | null
  top_video_views: number
  top_video_platform: string | null
  share_of_voice: Record<string, SovEntry>
  platforms_summary: Record<string, PlatformSummary>
  /** Per video.id quality score (1–5, or null when <5 comments). */
  comment_quality_scores: Record<string, number | null>
}
