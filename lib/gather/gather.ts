import { createAdminClient } from '../supabase-admin'
import { runActor } from './apify'
import { adapters } from './platforms'
import { dedupeBy } from './util'
import { classifyRelevance, type RelevanceMethod } from './relevance'
import type {
  GatherConfig,
  Platform,
  PlatformAdapter,
  NormaliseCtx,
  VideoInsert,
  CommentInsert,
  VideoRef,
  RawItem,
} from './types'

// Gather orchestrator. For each platform: search → normalise → upsert videos →
// scrape comments for eligible videos → upsert comments. Platform-agnostic — all
// the per-platform knowledge is in the adapter. Pure data: no GPT, no analysis.
//
// Idempotent: upserts on the natural keys (client_id, platform, video_id) and
// (client_id, platform, comment_id), so a re-run merges rather than duplicates.
// The videos upsert deliberately omits Pass A's classification columns, so a
// re-gather refreshes metrics without clobbering existing analysis.

type Admin = ReturnType<typeof createAdminClient>

interface SearchGroup { label: string; terms: string[]; limit: number }

// Per-keyword search plan: each VALUABLE keyword group gets its own guaranteed
// quota so brand + competitor terms aren't crowded out of one combined search by
// broad, high-volume industry terms — the crowding that starved the competitive
// pass (verified on Sealand: a combined search yielded 0 brand + 4 competitor of
// 101 videos). Brand variants are one entity → one search; each competitor is a
// distinct entity → its own search; industry terms are the broad net → combined.
function buildSearchPlan(config: GatherConfig): SearchGroup[] {
  const clean = (xs: string[] | undefined) => (xs ?? []).map((s) => `${s}`.trim()).filter(Boolean)
  const brand = clean(config.brand_keywords)
  const competitors = clean(config.competitor_keywords)
  const industry = clean(config.industry_keywords)
  const max = config.max_videos
  const plan: SearchGroup[] = []
  if (brand.length) plan.push({ label: 'brand', terms: brand, limit: max })
  const perCompetitor = competitors.length ? Math.max(5, Math.ceil(max / competitors.length)) : 0
  for (const c of competitors) plan.push({ label: `competitor:${c}`, terms: [c], limit: perCompetitor })
  if (industry.length) plan.push({ label: 'industry', terms: industry, limit: max })
  return plan
}

export interface GatherOptions {
  clientId: string
  runId: string
  /** Override the client's configured platforms. */
  platforms?: Platform[]
  /** Override tracking_configs.max_videos (handy for cheap test runs). */
  maxVideos?: number
  /** Cap how many eligible videos get comment-scraped per platform (cost control). */
  videoLimit?: number
  /** Override the client's configured report_period (scrape window), e.g. 'monthly'. */
  period?: string
  /** Relevance gate before comment-scraping: 'gpt' (default), 'heuristic', or 'off'. */
  relevance?: RelevanceMethod
  /** Run Apify + normalise but write nothing. */
  dryRun?: boolean
}

export interface PlatformResult {
  platform: Platform
  videos: number
  comments: number
  errors: string[]
}

const DEFAULT_CONFIG: Omit<GatherConfig, 'platforms'> = {
  brand_keywords: [],
  competitor_keywords: [],
  competitor_names: [],
  industry_keywords: [],
  max_videos: 25,
  comment_depth: 50,
  report_period: 'weekly',
}

async function loadConfig(admin: Admin, clientId: string): Promise<GatherConfig> {
  const { data, error } = await admin
    .from('tracking_configs')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw new Error(`load tracking_config: ${error.message}`)
  if (!data) throw new Error(`no tracking_config for client ${clientId}`)
  return {
    brand_keywords: data.brand_keywords ?? [],
    competitor_keywords: data.competitor_keywords ?? [],
    competitor_names: data.competitor_names ?? [],
    industry_keywords: data.industry_keywords ?? [],
    platforms: data.platforms ?? ['tiktok', 'youtube', 'instagram'],
    max_videos: data.max_videos ?? DEFAULT_CONFIG.max_videos,
    comment_depth: data.comment_depth ?? DEFAULT_CONFIG.comment_depth,
    report_period: data.report_period ?? DEFAULT_CONFIG.report_period,
  }
}

export async function runGather(opts: GatherOptions): Promise<PlatformResult[]> {
  const admin = createAdminClient()
  const config = await loadConfig(admin, opts.clientId)
  if (opts.maxVideos) config.max_videos = opts.maxVideos
  if (opts.period) config.report_period = opts.period

  const platforms = opts.platforms ?? (config.platforms as Platform[])
  const ctx: NormaliseCtx = { clientId: opts.clientId, runId: opts.runId, config }

  const results: PlatformResult[] = []
  for (const platform of platforms) {
    const adapter = adapters[platform]
    if (!adapter) {
      results.push({ platform, videos: 0, comments: 0, errors: [`no adapter for ${platform}`] })
      continue
    }
    // One platform failing must not stop the others (n8n had Continue-On-Fail here).
    try {
      results.push(await gatherPlatform(admin, adapter, ctx, opts))
    } catch (e) {
      results.push({ platform, videos: 0, comments: 0, errors: [(e as Error).message] })
    }
  }
  return results
}

async function gatherPlatform(
  admin: Admin,
  adapter: PlatformAdapter,
  ctx: NormaliseCtx,
  opts: GatherOptions,
): Promise<PlatformResult> {
  const errors: string[] = []

  // 1. Search per group (brand / each competitor / industry) + 2. Normalise.
  // One search group failing must not stop the others.
  const rawVideos: RawItem[] = []
  for (const group of buildSearchPlan(ctx.config)) {
    const { actor, input } = adapter.videoSearch(ctx.config, group.terms, group.limit)
    try {
      rawVideos.push(...(await runActor(actor, input)))
    } catch (e) {
      errors.push(`search ${group.label}: ${(e as Error).message}`)
    }
  }
  const videos = dedupeBy(
    rawVideos
      .map((r) => adapter.normaliseVideo(r, ctx))
      .filter((v): v is VideoInsert => v !== null),
    (v) => v.video_id,
  )

  // 2b. Relevance gate (BEFORE the expensive comment scrape). Judge market
  // relevance from cheap metadata so off-market noise (SFX/movie "prosthetics",
  // viral human-interest, news) never enters the corpus or burns a comment
  // scrape. Fails open — kept videos are everything not explicitly dropped.
  const method = opts.relevance ?? 'gpt'
  const { verdicts } = await classifyRelevance(videos, { method, config: ctx.config })
  const kept = videos.filter((v) => verdicts.get(v.video_id)?.relevant !== false)
  const dropped = videos.length - kept.length
  if (dropped > 0) {
    const reasons = videos
      .filter((v) => verdicts.get(v.video_id)?.relevant === false)
      .map((v) => `    - ${v.account_name}: ${verdicts.get(v.video_id)?.reason}`)
    console.log(`[${adapter.platform}] relevance gate (${method}) dropped ${dropped}/${videos.length}:\n${reasons.join('\n')}`)
  }

  // 3. Upsert kept videos (merge on natural key — preserves Pass A columns).
  if (!opts.dryRun && kept.length) {
    const { error } = await admin
      .from('videos')
      .upsert(kept, { onConflict: 'client_id,platform,video_id' })
    if (error) errors.push(`videos upsert: ${error.message}`)
  }

  // 4. Eligible-for-comments + optional cost cap.
  const eligible = kept.filter(
    (v) => adapter.commentThreshold == null || v.comments_count >= adapter.commentThreshold,
  )
  const toScrape = opts.videoLimit ? eligible.slice(0, opts.videoLimit) : eligible

  // 5. Per-video comment scrape + upsert. One video failing keeps the loop going.
  let commentCount = 0
  for (const v of toScrape) {
    const ref: VideoRef = { video_id: v.video_id, video_url: v.video_url, comments_count: v.comments_count }
    try {
      const { actor: cActor, input: cInput } = adapter.commentScrape(ref, ctx.config)
      const rawComments = await runActor(cActor, cInput)
      const comments = dedupeBy(
        rawComments
          .map((r) => adapter.normaliseComment(r, ref, ctx))
          .filter((c): c is CommentInsert => c !== null),
        (c) => c.comment_id,
      )
      if (!opts.dryRun && comments.length) {
        const { error } = await admin
          .from('comments')
          .upsert(comments, { onConflict: 'client_id,platform,comment_id' })
        if (error) errors.push(`comments upsert (${v.video_id}): ${error.message}`)
      }
      commentCount += comments.length
    } catch (e) {
      errors.push(`comment scrape (${v.video_id}): ${(e as Error).message}`)
    }
  }

  return { platform: adapter.platform, videos: kept.length, comments: commentCount, errors }
}
