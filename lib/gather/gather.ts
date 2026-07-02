import { createAdminClient } from '../supabase-admin'
import { runActor } from './apify'
import { adapters } from './platforms'
import { dedupeBy, round2 } from './util'
import { classifyRelevance, type RelevanceMethod } from './relevance'
import { attributeVideos, type AttributionMethod } from './attribution'
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

type KeywordBucket = 'brand' | 'competitor' | 'industry'
interface SearchGroup { label: string; bucket: KeywordBucket; keyword: string; terms: string[]; limit: number }

// Per-KEYWORD search plan: every keyword gets its own search with an equal quota
// (max_videos). Two reasons:
//   (1) Removes the cross-platform volume skew. The IG actor applies its limit
//       per-hashtag, but TT/YT applied `maxItems` to a whole combined group, so
//       combined brand/industry searches returned ~Nx more IG videos than TT/YT
//       (live corpus: 496 IG vs 138 TT / 103 YT). One keyword per search levels
//       TT/YT up to the same per-keyword multiplier IG always had.
//   (2) Makes every video attributable to the keyword(s) that surfaced it, so each
//       keyword's value can be scored and low-value terms pruned (v5-Ideas: Keyword
//       Value Tracking). Equal quotas keep the scores comparable across keywords.
// (Supersedes the 2026-06-28 per-bucket plan — brand/industry were still combined.)
function buildSearchPlan(config: GatherConfig): SearchGroup[] {
  const clean = (xs: string[] | undefined) => (xs ?? []).map((s) => `${s}`.trim()).filter(Boolean)
  const buckets: [KeywordBucket, string[]][] = [
    ['brand', clean(config.brand_keywords)],
    ['competitor', clean(config.competitor_keywords)],
    ['industry', clean(config.industry_keywords)],
  ]
  const plan: SearchGroup[] = []
  const seen = new Set<string>()
  for (const [bucket, keywords] of buckets) {
    for (const kw of keywords) {
      if (seen.has(kw)) continue // a keyword listed in two buckets searches only once
      seen.add(kw)
      plan.push({ label: `${bucket}:${kw}`, bucket, keyword: kw, terms: [kw], limit: config.max_videos })
    }
  }
  return plan
}

// Provisional keyword value: reward keywords that find RELEVANT, comment-rich
// videos, not just high raw volume (broad terms inflate volume but get gate-dropped).
// value = gate-survival rate × eligible videos. Refined later with insights_contributed.
function keywordValueScore(found: number, survived: number, eligible: number): number {
  const rate = found > 0 ? survived / found : 0
  return round2(rate * eligible)
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
  /** Content attribution of brand/competitor tags: 'gpt' (default) or 'substring'. */
  attribution?: AttributionMethod
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

  // Per-keyword value tracking: for each keyword accumulate the videos it found
  // (pre-gate), then credit gate-survival + comment-eligibility below.
  const stats = new Map<string, { bucket: KeywordBucket; found: Set<string>; survived: number; eligible: number }>()

  // 1. Search once per KEYWORD + 2. Normalise. One search failing must not stop the
  // others. Each returned video is tagged with the keyword that surfaced it; a video
  // found by several keywords is kept once with the keywords unioned.
  const byId = new Map<string, VideoInsert>()
  for (const group of buildSearchPlan(ctx.config)) {
    const s = stats.get(group.keyword) ?? { bucket: group.bucket, found: new Set<string>(), survived: 0, eligible: 0 }
    stats.set(group.keyword, s)
    const { actor, input } = adapter.videoSearch(ctx.config, group.terms, group.limit)
    let raw: RawItem[]
    try {
      raw = await runActor(actor, input)
    } catch (e) {
      errors.push(`search ${group.label}: ${(e as Error).message}`)
      continue
    }
    const found = dedupeBy(
      raw.map((r) => adapter.normaliseVideo(r, ctx)).filter((v): v is VideoInsert => v !== null),
      (v) => v.video_id,
    )
    for (const v of found) {
      s.found.add(v.video_id)
      const existing = byId.get(v.video_id)
      if (existing) {
        if (!existing.source_keywords?.includes(group.keyword)) existing.source_keywords?.push(group.keyword)
      } else {
        v.source_keywords = [group.keyword]
        byId.set(v.video_id, v)
      }
    }
  }
  const videos = [...byId.values()]

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
  // Credit each surfacing keyword with the videos it found that survived the gate.
  for (const v of kept) for (const kw of v.source_keywords ?? []) { const s = stats.get(kw); if (s) s.survived++ }

  // 2c. Attribute brand/competitor tags by CONTENT. Adapters set naive substring
  // tags during normalise; this overwrites them with the GPT-confirmed entity so
  // homonym hits ("Freitag"=Friday, "Patagonia"=a region) don't pollute the
  // competitor buckets. Industry videos skip GPT internally, so the call is small.
  const attribution = opts.attribution ?? 'gpt'
  const { tags: entityTags } = await attributeVideos(kept, { method: attribution, config: ctx.config })
  for (const v of kept) {
    const t = entityTags.get(v.video_id)
    if (t) {
      v.is_client = t.is_client
      v.is_competitor = t.is_competitor
      v.competitor_name = t.competitor_name
    }
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
  for (const v of eligible) for (const kw of v.source_keywords ?? []) { const s = stats.get(kw); if (s) s.eligible++ }
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

  // Persist per-keyword performance for this run — the raw signal for keyword value
  // scoring + add/remove suggestions (v5-Ideas). Service-role write, bypasses RLS.
  if (!opts.dryRun && stats.size) {
    const kpRows = [...stats.entries()].map(([keyword, s]) => ({
      client_id: ctx.clientId,
      run_id: ctx.runId,
      platform: adapter.platform,
      keyword,
      bucket: s.bucket,
      videos_found: s.found.size,
      gate_survived: s.survived,
      eligible_videos: s.eligible,
      value_score: keywordValueScore(s.found.size, s.survived, s.eligible),
    }))
    const { error } = await admin
      .from('keyword_performance')
      .upsert(kpRows, { onConflict: 'client_id,run_id,platform,keyword' })
    if (error) errors.push(`keyword_performance upsert: ${error.message}`)
  }

  return { platform: adapter.platform, videos: kept.length, comments: commentCount, errors }
}
