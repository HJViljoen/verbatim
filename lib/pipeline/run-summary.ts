import { createAdminClient } from '../supabase-admin'
import type { CiSummary } from './schemas'
import type { VideoRow, Step2aMetrics } from './types'

// run_summary writer. The table existed unwritten since v4.1; the pipeline back
// half now populates one row per run (Redesign Spec §8): deterministic corpus
// metrics (Step 2a), the video-sentiment distribution, and Pass D-a's
// consumer_intelligence_summary. Consecutive rows are the data source for the
// weekly-email delta block (§7) and the dashboard's state snapshot (§2).

export interface WriteRunSummaryArgs {
  clientId: string
  runId: string
  metrics: Step2aMetrics
  /** The corpus videos — sentiment distribution comes from Pass A's per-video sentiment. */
  videos: VideoRow[]
  ciSummary: CiSummary | null
  /** tracking_configs.report_period ('weekly' | 'monthly' | …), if known. */
  period?: string | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

export async function writeRunSummary(args: WriteRunSummaryArgs): Promise<void> {
  const { clientId, runId, metrics, videos, ciSummary, period } = args
  const admin = createAdminClient()

  // Sentiment distribution over videos Pass A gave a sentiment (comment-derived).
  // 'mixed' counts toward the denominator but no single share — the three shares
  // deliberately don't sum to 100 on a corpus with mixed-reception videos; raw
  // counts live in sentiment_drivers for the honest breakdown.
  const counts = { positive: 0, neutral: 0, negative: 0, mixed: 0 }
  let judged = 0
  for (const v of videos) {
    if (v.sentiment && v.sentiment in counts) {
      counts[v.sentiment as keyof typeof counts]++
      judged++
    }
  }
  const share = (n: number) => (judged > 0 ? round1((n / judged) * 100) : null)

  const { error: delErr } = await admin.from('run_summary').delete().eq('client_id', clientId).eq('run_id', runId)
  if (delErr) throw new Error(`clear run_summary: ${delErr.message}`)

  const { error } = await admin.from('run_summary').insert({
    client_id: clientId,
    run_id: runId,
    total_videos: metrics.total_videos,
    total_comments: metrics.total_comments,
    client_videos: metrics.client_videos,
    competitor_videos: metrics.competitor_videos,
    platforms_covered: metrics.platforms_covered,
    avg_engagement_rate: metrics.avg_engagement_rate,
    top_video_id: metrics.top_video_id,
    top_video_views: metrics.top_video_views,
    top_video_platform: metrics.top_video_platform,
    share_of_voice: metrics.share_of_voice,
    platforms_summary: metrics.platforms_summary,
    overall_sentiment_positive: share(counts.positive),
    overall_sentiment_neutral: share(counts.neutral),
    overall_sentiment_negative: share(counts.negative),
    sentiment_drivers: { video_sentiment_counts: counts, videos_judged: judged },
    consumer_intelligence_summary: ciSummary,
    period: period ?? null,
    run_date: new Date().toISOString(),
  })
  if (error) throw new Error(`persist run_summary: ${error.message}`)
}
