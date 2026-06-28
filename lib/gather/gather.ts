import { createAdminClient } from '../supabase-admin'
import { runActor } from './apify'
import { adapters } from './platforms'
import { dedupeBy } from './util'
import type {
  GatherConfig,
  Platform,
  PlatformAdapter,
  NormaliseCtx,
  VideoInsert,
  CommentInsert,
  VideoRef,
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

  // 1. Search + 2. Normalise videos.
  const { actor, input } = adapter.videoSearch(ctx.config)
  const rawVideos = await runActor(actor, input)
  const videos = dedupeBy(
    rawVideos
      .map((r) => adapter.normaliseVideo(r, ctx))
      .filter((v): v is VideoInsert => v !== null),
    (v) => v.video_id,
  )

  // 3. Upsert videos (merge on natural key — preserves Pass A columns).
  if (!opts.dryRun && videos.length) {
    const { error } = await admin
      .from('videos')
      .upsert(videos, { onConflict: 'client_id,platform,video_id' })
    if (error) errors.push(`videos upsert: ${error.message}`)
  }

  // 4. Eligible-for-comments + optional cost cap.
  const eligible = videos.filter(
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

  return { platform: adapter.platform, videos: videos.length, comments: commentCount, errors }
}
