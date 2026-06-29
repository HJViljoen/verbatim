import { createAdminClient, selectAll } from '../supabase-admin'
import { EVIDENCE_FLOOR, CLUSTER_SIMILARITY_THRESHOLD } from '../config'
import { clusterInsights, type ClusterMethod } from './cluster'
import type { InsightRow, AggregatedTheme } from './types'

// Step A2 — theme aggregation (Architecture/Analysis-Passes §Step A2). No new
// GPT call (one cheap embeddings call inside the clustering seam). Buckets Pass A
// insights by entity, clusters within (bucket, category), rolls each cluster up
// into an AggregatedTheme, then drops themes below the evidence floor. Output is
// held in memory for Pass C/D — aggregated themes are not separately persisted
// (the audience_insights rows already exist from Pass A; cluster identity is
// implicit via theme + bucket).

export interface RunStepA2Options {
  clientId: string
  runId: string
  method?: ClusterMethod
  threshold?: number
  /** Min distinct supporting videos for a theme to survive. Default EVIDENCE_FLOOR. */
  evidenceFloor?: number
}

export interface StepA2Result {
  runId: string
  totalInsights: number
  totalClusters: number
  themes: AggregatedTheme[]
  droppedBelowFloor: AggregatedTheme[]
}

/** A homogeneous (one bucket, one category) group of insights — the unit
 *  clustering operates on. Exported so the debug inspector can reuse the exact
 *  same grouping the pipeline uses. */
export interface InsightGroup {
  bucket: string
  category: string
  insights: InsightRow[]
}

function bucketOf(v: { is_client: boolean; is_competitor: boolean; competitor_name: string | null }): string {
  if (v.is_client) return 'client'
  if (v.is_competitor) return `competitor:${v.competitor_name ?? 'unknown'}`
  return 'industry-other'
}

/** Most frequent value, ties broken by first-seen order. */
function mode(values: string[]): string {
  const counts = new Map<string, number>()
  let best = values[0] ?? ''
  let bestN = 0
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1
    counts.set(v, n)
    if (n > bestN) {
      bestN = n
      best = v
    }
  }
  return best
}

function aggregate(cluster: InsightRow[], bucket: string, category: string): AggregatedTheme {
  // Canonical label = highest-strength member's slug (Pass B deferred to v5).
  const canonical = cluster.reduce((a, b) => (b.strength_score > a.strength_score ? b : a))
  const supportingVideoIds = [...new Set(cluster.map((i) => i.source_video_id))]
  return {
    bucket,
    category,
    theme: canonical.theme,
    memberThemes: [...new Set(cluster.map((i) => i.theme))],
    supportingVideoIds,
    supportingInsightIds: cluster.map((i) => i.id),
    evidenceCount: supportingVideoIds.length,
    strengthScore: canonical.strength_score,
    dominantEmotion: mode(cluster.map((i) => i.emotion)),
    dominantSentimentImpact: mode(cluster.map((i) => i.sentiment_impact)),
  }
}

/**
 * Load a run's Pass A insights, attach each one's entity bucket (derived from
 * its source video), and group by (bucket, category). Shared by runStepA2 and
 * the debug inspector so both see identical grouping.
 */
export async function loadGroupedInsights(clientId: string, runId: string): Promise<InsightGroup[]> {
  const admin = createAdminClient()

  // 1. Pull this run's insights (paginated past the 1000-row cap).
  const insightsBase = await selectAll<{
    id: string; category: string; theme: string; description: string
    strength_score: number; emotion: string | null; sentiment_impact: string | null
    source_video_id: string; platform: string
  }>(() =>
    admin
      .from('audience_insights')
      .select('id, category, theme, description, strength_score, emotion, sentiment_impact, source_video_id, platform')
      .eq('client_id', clientId)
      .eq('run_id', runId)
      .order('id', { ascending: true }),
  )

  // 2. Fetch the referenced videos for entity flags; join in code (avoids
  //    PostgREST FK-name ambiguity on source_video_id).
  const videoIds = [...new Set(insightsBase.map((i) => i.source_video_id).filter(Boolean))]
  const videoEntity = new Map<string, { is_client: boolean; is_competitor: boolean; competitor_name: string | null }>()
  if (videoIds.length) {
    const videos = await selectAll<{ id: string; is_client: boolean; is_competitor: boolean; competitor_name: string | null }>(() =>
      admin
        .from('videos')
        .select('id, is_client, is_competitor, competitor_name')
        .in('id', videoIds)
        .order('id', { ascending: true }),
    )
    for (const v of videos) {
      videoEntity.set(v.id, { is_client: v.is_client, is_competitor: v.is_competitor, competitor_name: v.competitor_name })
    }
  }

  const insights: InsightRow[] = insightsBase.map((i) => {
    const ent = videoEntity.get(i.source_video_id) ?? { is_client: false, is_competitor: false, competitor_name: null }
    return { ...i, ...ent } as InsightRow
  })

  // 3. Group by (bucket, category) — bucket/category kept on the group value so
  //    the map key is never parsed back (competitor names can contain spaces).
  const groups = new Map<string, InsightGroup>()
  for (const ins of insights) {
    const bucket = bucketOf(ins)
    const key = [bucket, ins.category].join('|')
    const g = groups.get(key)
    if (g) g.insights.push(ins)
    else groups.set(key, { bucket, category: ins.category, insights: [ins] })
  }
  return [...groups.values()]
}

export async function runStepA2(opts: RunStepA2Options): Promise<StepA2Result> {
  const { clientId, runId, method, threshold } = opts
  const floor = opts.evidenceFloor ?? EVIDENCE_FLOOR

  const groups = await loadGroupedInsights(clientId, runId)
  const totalInsights = groups.reduce((s, g) => s + g.insights.length, 0)

  // Cluster within each group, roll up to aggregated themes.
  const all: AggregatedTheme[] = []
  for (const grp of groups) {
    const clusters = await clusterInsights(grp.insights, { method, threshold })
    for (const cluster of clusters) all.push(aggregate(cluster, grp.bucket, grp.category))
  }

  // 5. Apply evidence floor. Sort by strength desc for readable output.
  all.sort((a, b) => b.strengthScore - a.strengthScore)
  const themes = all.filter((t) => t.evidenceCount >= floor)
  const droppedBelowFloor = all.filter((t) => t.evidenceCount < floor)

  return {
    runId,
    totalInsights,
    totalClusters: all.length,
    themes,
    droppedBelowFloor,
  }
}

export { CLUSTER_SIMILARITY_THRESHOLD }
