// Pipeline configuration constants. Centralised so the model and thresholds
// are a one-line change — see Analysis-Passes invariants 8–9 and Step A2.

/**
 * OpenAI model for all analysis passes. v4.1 chose gpt-4.1-mini (2026-04);
 * invariant 9 says re-evaluate the cheap-model landscape at build time before
 * the first Pass A run. Swapping is a one-line change here.
 */
export const ANALYSIS_MODEL = 'gpt-4.1-mini'

/**
 * Minimum distinct source videos for a theme to survive Step A2 aggregation.
 * Configurable because the floor collides with thin corpora — a demo/thin-data
 * run may drop this to 1 and badge single-source themes rather than ship empty.
 */
export const EVIDENCE_FLOOR = 2

/** Sampling temperature for analysis calls. 0 for reproducible iteration. */
export const ANALYSIS_TEMPERATURE = 0

/**
 * Embedding model for Step A2 theme clustering (Analysis-Passes §Step A2 — the
 * pre-approved fallback when string-match clustering fails, which the first real
 * run confirmed it does: free-text slugs almost never collide exactly).
 */
export const EMBEDDING_MODEL = 'text-embedding-3-small'

/**
 * Cosine-similarity threshold for merging two insights into one theme cluster.
 * Higher = stricter (more, smaller clusters); lower = looser (fewer, broader).
 * Retuned 2026-06-28 on the full 3-platform Ossur run (84 insights): 0.55 fused
 * unrelated questions into one incoherent "cost" mega-cluster (22 slugs incl.
 * socket_comfort/amputation_cause), so drill-downs showed off-topic quotes. 0.62
 * splits that into a genuine cost theme + a functionality theme while preserving
 * the strong creative_design theme; 0.68+ starts dissolving creative_design.
 */
export const CLUSTER_SIMILARITY_THRESHOLD = 0.62

/**
 * USD per 1M tokens, per model. APPROXIMATE — verify against OpenAI's current
 * pricing page and your usage dashboard; used only to estimate ai_call_log.cost_usd
 * and the live burn log. Actual billing is the source of truth.
 */
export const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'gpt-4.1-mini': { inputPer1M: 0.4, outputPer1M: 1.6 },
  'gpt-4.1-nano': { inputPer1M: 0.1, outputPer1M: 0.4 },
  'gpt-4.1': { inputPer1M: 2.0, outputPer1M: 8.0 },
  'text-embedding-3-small': { inputPer1M: 0.02, outputPer1M: 0 },
}

/** Estimate USD cost from token usage for a given model. Returns 0 if unknown. */
export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const p = MODEL_PRICING[model]
  if (!p) return 0
  return (promptTokens / 1e6) * p.inputPer1M + (completionTokens / 1e6) * p.outputPer1M
}

// --- Gather (Apify) configuration -------------------------------------------
// The n8n gather called Apify *tasks* (actor + input saved in the console). In
// code we call the underlying store actors directly by their Apify actor id (the
// API accepts the id form as well as the username~name slug). These ids were
// confirmed from Heinrich's Apify account on 2026-06-28; env-overridable per
// deployment. Set APIFY_TOKEN before the first live run.
export const APIFY_ACTORS = {
  tiktok: {
    video: process.env.APIFY_TT_VIDEO_ACTOR ?? '5K30i8aFccKNF5ICs',
    comment: process.env.APIFY_TT_COMMENT_ACTOR ?? 'XomSRf7d0qf3mVj1y',
  },
  youtube: {
    video: process.env.APIFY_YT_VIDEO_ACTOR ?? '1p1aa7gcSydPkAE0d',
    comment: process.env.APIFY_YT_COMMENT_ACTOR ?? 'mExYO4A2k9976zMfA',
  },
  instagram: {
    video: process.env.APIFY_IG_VIDEO_ACTOR ?? 'reGe1ST3OBgYZSsZJ',
    comment: process.env.APIFY_IG_COMMENT_ACTOR ?? 'SbK00X0JYCPblD2wp',
  },
} as const

/** Default min comments before a video is worth a comment scrape (TikTok/Instagram). */
export const COMMENT_THRESHOLD = 5

/** report_period → TikTok actor `dateRange` (Technical.md scrape-window mapping). */
export function periodToTikTokRange(period: string): string {
  return period === 'daily' ? 'TODAY' : period === 'monthly' ? 'THIS_MONTH' : 'THIS_WEEK'
}

/** report_period → YouTube actor `uploadDate`. */
export function periodToYouTubeUploadDate(period: string): string {
  return period === 'daily' ? 'd' : period === 'monthly' ? 'm' : 'w'
}
