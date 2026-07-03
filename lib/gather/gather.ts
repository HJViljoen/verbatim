import { createAdminClient } from '../supabase-admin'
import { runActor } from './apify'
import { adapters } from './platforms'
import { dedupeBy, round2 } from './util'
import { classifyRelevance, type RelevanceMethod } from './relevance'
import { attributeVideos, type AttributionMethod } from './attribution'
import type {
  GatherConfig,
  Platform,
  NormaliseCtx,
  VideoInsert,
  CommentInsert,
  VideoRef,
} from './types'

// Gather orchestrator. For each platform: search → normalise → upsert videos →
// scrape comments for eligible videos → upsert comments. Platform-agnostic — all
// the per-platform knowledge is in the adapter. Pure data: no GPT, no analysis.
//
// Split into step-sized pieces (2026-07-03, after the first cloud run proved a
// whole platform never fits one 300s function call — dominated by the per-video
// Apify comment scrape): planGatherSearches → searchOne (per keyword) →
// gatePlatform (merge + relevance/attribution + video upsert) →
// scrapeCommentsBatch. The Inngest pipeline runs each piece as its own
// retryable step; the CLI runGather composes the same pieces sequentially.
//
// Idempotent: upserts on the natural keys (client_id, platform, video_id) and
// (client_id, platform, comment_id), so a re-run merges rather than duplicates.
// The videos upsert deliberately omits Pass A's classification columns, so a
// re-gather refreshes metrics without clobbering existing analysis.

type Admin = ReturnType<typeof createAdminClient>

export type KeywordBucket = 'brand' | 'competitor' | 'industry'
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

// ---- step-sized pieces -------------------------------------------------------

/** One planned keyword search — the unit of the Inngest search fan-out. */
export interface SearchTask {
  platform: Platform
  keyword: string
  bucket: KeywordBucket
}

/** One keyword search's normalised output (videos tagged with the keyword). */
export interface SearchResult {
  keyword: string
  bucket: KeywordBucket
  videos: VideoInsert[]
}

/** What a platform's gate hands the comment-scrape steps. */
export interface GateResult {
  platform: Platform
  videosKept: number
  eligible: VideoRef[]
  errors: string[]
}

/** The full run's search plan: platform × keyword. Platforms without an adapter
 *  are skipped (the orchestrator has nothing to run for them). */
export async function planGatherSearches(clientId: string, platforms?: Platform[]): Promise<SearchTask[]> {
  const admin = createAdminClient()
  const config = await loadConfig(admin, clientId)
  const wanted = platforms ?? (config.platforms as Platform[])
  const tasks: SearchTask[] = []
  for (const platform of wanted) {
    if (!adapters[platform]) continue
    for (const group of buildSearchPlan(config)) {
      tasks.push({ platform, keyword: group.keyword, bucket: group.bucket })
    }
  }
  return tasks
}

/** Run ONE keyword search on one platform: Apify actor → normalise → tag with
 *  the surfacing keyword. No writes — the gate merges and upserts. */
export async function searchOne(opts: {
  clientId: string
  runId: string
  platform: Platform
  keyword: string
  bucket: KeywordBucket
  maxVideos?: number
  period?: string
}): Promise<SearchResult> {
  const admin = createAdminClient()
  const config = await loadConfig(admin, opts.clientId)
  if (opts.maxVideos) config.max_videos = opts.maxVideos
  if (opts.period) config.report_period = opts.period
  const adapter = adapters[opts.platform]
  if (!adapter) throw new Error(`no adapter for ${opts.platform}`)
  const ctx: NormaliseCtx = { clientId: opts.clientId, runId: opts.runId, config }

  const { actor, input } = adapter.videoSearch(config, [opts.keyword], config.max_videos)
  const raw = await runActor(actor, input)
  const videos = dedupeBy(
    raw.map((r) => adapter.normaliseVideo(r, ctx)).filter((v): v is VideoInsert => v !== null),
    (v) => v.video_id,
  )
  for (const v of videos) v.source_keywords = [opts.keyword]
  return { keyword: opts.keyword, bucket: opts.bucket, videos }
}

/** Merge a platform's keyword searches (unioning source_keywords), run the
 *  relevance gate + entity attribution, upsert kept videos, persist per-keyword
 *  performance, and return the comment-eligible refs (videoLimit applied). */
export async function gatePlatform(opts: {
  clientId: string
  runId: string
  platform: Platform
  searches: SearchResult[]
  videoLimit?: number
  relevance?: RelevanceMethod
  attribution?: AttributionMethod
  dryRun?: boolean
}): Promise<GateResult> {
  const admin = createAdminClient()
  const config = await loadConfig(admin, opts.clientId)
  const adapter = adapters[opts.platform]
  if (!adapter) throw new Error(`no adapter for ${opts.platform}`)
  const errors: string[] = []

  // Per-keyword value tracking: found (pre-gate) per surfacing keyword, then
  // credit gate-survival + comment-eligibility below.
  const stats = new Map<string, { bucket: KeywordBucket; found: Set<string>; survived: number; eligible: number }>()
  const byId = new Map<string, VideoInsert>()
  for (const search of opts.searches) {
    const s = stats.get(search.keyword) ?? { bucket: search.bucket, found: new Set<string>(), survived: 0, eligible: 0 }
    stats.set(search.keyword, s)
    for (const v of search.videos) {
      s.found.add(v.video_id)
      const existing = byId.get(v.video_id)
      if (existing) {
        if (!existing.source_keywords?.includes(search.keyword)) existing.source_keywords?.push(search.keyword)
      } else {
        v.source_keywords = [search.keyword]
        byId.set(v.video_id, v)
      }
    }
  }
  const videos = [...byId.values()]

  // Relevance gate (BEFORE the expensive comment scrape). Judge market
  // relevance from cheap metadata so off-market noise (SFX/movie "prosthetics",
  // viral human-interest, news) never enters the corpus or burns a comment
  // scrape. Fails open — kept videos are everything not explicitly dropped.
  const method = opts.relevance ?? 'gpt'
  const { verdicts } = await classifyRelevance(videos, { method, config })
  const kept = videos.filter((v) => verdicts.get(v.video_id)?.relevant !== false)
  const dropped = videos.length - kept.length
  if (dropped > 0) {
    const reasons = videos
      .filter((v) => verdicts.get(v.video_id)?.relevant === false)
      .map((v) => `    - ${v.account_name}: ${verdicts.get(v.video_id)?.reason}`)
    console.log(`[${adapter.platform}] relevance gate (${method}) dropped ${dropped}/${videos.length}:\n${reasons.join('\n')}`)
  }
  for (const v of kept) for (const kw of v.source_keywords ?? []) { const s = stats.get(kw); if (s) s.survived++ }

  // Attribute brand/competitor tags by CONTENT. Adapters set naive substring
  // tags during normalise; this overwrites them with the GPT-confirmed entity so
  // homonym hits ("Freitag"=Friday, "Patagonia"=a region) don't pollute the
  // competitor buckets. Industry videos skip GPT internally, so the call is small.
  const attribution = opts.attribution ?? 'gpt'
  const { tags: entityTags } = await attributeVideos(kept, { method: attribution, config })
  for (const v of kept) {
    const t = entityTags.get(v.video_id)
    if (t) {
      v.is_client = t.is_client
      v.is_competitor = t.is_competitor
      v.competitor_name = t.competitor_name
    }
  }

  // Upsert kept videos (merge on natural key — preserves Pass A columns).
  if (!opts.dryRun && kept.length) {
    const { error } = await admin
      .from('videos')
      .upsert(kept, { onConflict: 'client_id,platform,video_id' })
    if (error) errors.push(`videos upsert: ${error.message}`)
  }

  // Eligible-for-comments + optional cost cap.
  const eligibleVideos = kept.filter(
    (v) => adapter.commentThreshold == null || v.comments_count >= adapter.commentThreshold,
  )
  for (const v of eligibleVideos) for (const kw of v.source_keywords ?? []) { const s = stats.get(kw); if (s) s.eligible++ }
  const toScrape = opts.videoLimit ? eligibleVideos.slice(0, opts.videoLimit) : eligibleVideos

  // Persist per-keyword performance for this run — the raw signal for keyword value
  // scoring + add/remove suggestions (v5-Ideas). Service-role write, bypasses RLS.
  if (!opts.dryRun && stats.size) {
    const kpRows = [...stats.entries()].map(([keyword, s]) => ({
      client_id: opts.clientId,
      run_id: opts.runId,
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

  return {
    platform: adapter.platform,
    videosKept: kept.length,
    eligible: toScrape.map((v) => ({ video_id: v.video_id, video_url: v.video_url, comments_count: v.comments_count })),
    errors,
  }
}

/** Scrape + upsert comments for a batch of eligible videos. One video failing
 *  keeps the loop going. Batch size is the orchestrator's concern — size it to
 *  the function-duration cap (each video is its own Apify actor run). */
export async function scrapeCommentsBatch(opts: {
  clientId: string
  runId: string
  platform: Platform
  refs: VideoRef[]
  dryRun?: boolean
}): Promise<{ comments: number; errors: string[] }> {
  const admin = createAdminClient()
  const config = await loadConfig(admin, opts.clientId)
  const adapter = adapters[opts.platform]
  if (!adapter) throw new Error(`no adapter for ${opts.platform}`)
  const ctx: NormaliseCtx = { clientId: opts.clientId, runId: opts.runId, config }
  const errors: string[] = []

  let commentCount = 0
  for (const ref of opts.refs) {
    try {
      const { actor: cActor, input: cInput } = adapter.commentScrape(ref, config)
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
        if (error) errors.push(`comments upsert (${ref.video_id}): ${error.message}`)
      }
      commentCount += comments.length
    } catch (e) {
      errors.push(`comment scrape (${ref.video_id}): ${(e as Error).message}`)
    }
  }
  return { comments: commentCount, errors }
}

// ---- CLI composition ---------------------------------------------------------

/** Sequential composition of the step pieces — the CLI path (run-gather.ts).
 *  Behaviour matches the pre-split orchestrator: one platform failing must not
 *  stop the others; one search failing must not stop the platform. */
export async function runGather(opts: GatherOptions): Promise<PlatformResult[]> {
  const admin = createAdminClient()
  const config = await loadConfig(admin, opts.clientId)
  const platforms = opts.platforms ?? (config.platforms as Platform[])

  const results: PlatformResult[] = []
  for (const platform of platforms) {
    if (!adapters[platform]) {
      results.push({ platform, videos: 0, comments: 0, errors: [`no adapter for ${platform}`] })
      continue
    }
    const errors: string[] = []
    try {
      const searches: SearchResult[] = []
      for (const group of buildSearchPlan(config)) {
        try {
          searches.push(await searchOne({
            clientId: opts.clientId, runId: opts.runId, platform,
            keyword: group.keyword, bucket: group.bucket,
            maxVideos: opts.maxVideos, period: opts.period,
          }))
        } catch (e) {
          errors.push(`search ${group.bucket}:${group.keyword}: ${(e as Error).message}`)
          searches.push({ keyword: group.keyword, bucket: group.bucket, videos: [] })
        }
      }
      const gate = await gatePlatform({
        clientId: opts.clientId, runId: opts.runId, platform, searches,
        videoLimit: opts.videoLimit, relevance: opts.relevance,
        attribution: opts.attribution, dryRun: opts.dryRun,
      })
      errors.push(...gate.errors)
      const scraped = await scrapeCommentsBatch({
        clientId: opts.clientId, runId: opts.runId, platform,
        refs: gate.eligible, dryRun: opts.dryRun,
      })
      errors.push(...scraped.errors)
      results.push({ platform, videos: gate.videosKept, comments: scraped.comments, errors })
    } catch (e) {
      errors.push((e as Error).message)
      results.push({ platform, videos: 0, comments: 0, errors })
    }
  }
  return results
}
