import { createAdminClient, selectAll } from '../supabase-admin'
import { periodWindowDays, RECHECK_MIN_GROWTH, RECHECK_CAP, RECHECK_WINDOW_DAYS } from '../config'
import { runActor } from './apify'
import { adapters } from './platforms'
import { dedupeBy, round2 } from './util'
import { classifyRelevance, type RelevanceMethod } from './relevance'
import { attributeVideos, type AttributionMethod } from './attribution'
import { splitDelta, pickRechecks, scrapeBaseline, type KnownVideoState, type RecheckCandidate } from './delta'
import type {
  GatherConfig,
  Platform,
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
//
// Delta-scraping (2026-07-16, delta.ts): known videos skip the gate and only
// re-scrape comments when their count grew — unchanged re-finds stop costing a
// paid actor run, and still-active videos keep contributing their new comments
// after they age out of the search window (~27% of lifetime comments arrive
// after a video's first week, measured on the stored corpus).

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

// ---- baseline vs flow (teardown 2026-07-09 §Run 1, defect 6) ------------------

/** The run's gather window. `since` is inclusive, 'YYYY-MM-DD', UTC-day granular. */
export interface GatherWindow {
  /** True on a client's first data-producing run — deep, unwindowed. */
  baseline: boolean
  /** Flow runs: content older than this is out of the period. Null on baseline. */
  since: string | null
}

const sinceDateFor = (period: string): string =>
  new Date(Date.now() - periodWindowDays(period) * 86_400_000).toISOString().slice(0, 10)

/** True when a row belongs to the window. Null/unknown dates STAY — only
 *  content KNOWN older than the window is excluded, so a platform with patchy
 *  dates can never be blanked. Shared by the gather filter and the
 *  period-metrics slice (one source of truth for "in this period"). */
export const inWindow = (date: string | null | undefined, since: string | null): boolean =>
  !since || !date || date >= since

/**
 * Baseline-vs-flow: a client's first MAP-BUILDING run is the baseline — deep
 * and unwindowed. Every later run is a flow run and only this period's content
 * counts: TikTok/YouTube already window at the source, but Instagram's hashtag
 * actor has no date input, so the window is enforced post-search (gatePlatform)
 * — which also stops old-viral IG videos from burning a paid comment-scrape
 * actor run each week. The same window drives the period-metrics slice in the
 * synthesis half.
 *
 * "The map exists" = an earlier run produced a run_summary (synthesis closed),
 * NOT merely an earlier completed pipeline_runs row — Sealand's June runs on
 * the old pipeline are status 'completed' with zero analysis, and a failed or
 * empty run must not cost the client their one deep baseline.
 */
export async function resolveGatherWindow(clientId: string, runId: string, period: string): Promise<GatherWindow> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('run_summary')
    .select('run_id')
    .eq('client_id', clientId)
    .neq('run_id', runId)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`resolve gather window: ${error.message}`)
  return data ? { baseline: false, since: sinceDateFor(period) } : { baseline: true, since: null }
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

  // Native-API platforms (YouTube) fetch their own items; Apify platforms build
  // an actor+input the orchestrator runs. Exactly one path exists per adapter.
  let raw: RawItem[]
  if (adapter.fetchVideos) {
    raw = await adapter.fetchVideos(config, [opts.keyword], config.max_videos)
  } else if (adapter.videoSearch) {
    const { actor, input } = adapter.videoSearch(config, [opts.keyword], config.max_videos)
    raw = await runActor(actor, input)
  } else {
    throw new Error(`adapter ${opts.platform} has no video source`)
  }
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
  /** Override the client's configured report_period (matches searchOne). */
  period?: string
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
  const merged = [...byId.values()]

  // Delta layer (delta.ts): split this run's results against what's already
  // stored. Fresh videos take the full path below; resurfaced ones skip the
  // gate + attribution (they passed once — re-gated content gets deleted, so
  // presence in the DB means kept) and instead feed the growth comparison that
  // decides which comment scrapes are worth re-paying for. Whole-platform scan
  // + in-memory map, same URL-overflow avoidance as everywhere else.
  const knownRows = await selectAll<KnownVideoState>(() =>
    admin
      .from('videos')
      .select('video_id, video_url, comments_count, comments_count_at_scrape, upload_date, is_client, is_competitor, competitor_name')
      .eq('client_id', opts.clientId)
      .eq('platform', adapter.platform)
      .order('id', { ascending: true }),
  )
  const known = new Map(knownRows.map((r) => [r.video_id, r]))
  const { fresh, resurfaced } = splitDelta(merged, known)

  // Flow-run window: drop FRESH content older than the report period BEFORE the
  // relevance gate (saves its GPT call) and before the upsert. Baseline runs
  // pass everything — the first run builds the map. Only content KNOWN to be
  // old is dropped: a null upload_date stays, so a platform with patchy dates
  // can't be blanked by the window. (Resurfaced videos are windowed separately
  // below — old-but-active ones stay out of the corpus refresh but may still
  // earn a comment re-check.)
  const window = await resolveGatherWindow(opts.clientId, opts.runId, opts.period ?? config.report_period)
  const videos = fresh.filter((v) => inWindow(v.upload_date, window.since))
  if (videos.length < fresh.length) {
    console.log(`[${adapter.platform}] flow window dropped ${fresh.length - videos.length}/${fresh.length} fresh videos older than ${window.since}`)
  }

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

  // Resurfaced-in-window videos re-upsert too (metrics refresh + run_id
  // restamp, so the period slice still sees a video found by an earlier run in
  // the same window — e.g. a manual midweek run before the scheduled one). The
  // stored GPT entity tags are grafted over normalise's naive substring tags so
  // the re-upsert can't clobber attribution. Survived-credit matches: they're
  // proven corpus members, so keywords keep their ROI credit across re-runs.
  const resurfacedInWindow = resurfaced.filter((r) => inWindow(r.video.upload_date, window.since))
  for (const r of resurfacedInWindow) {
    r.video.is_client = r.state.is_client
    r.video.is_competitor = r.state.is_competitor
    r.video.competitor_name = r.state.competitor_name
    for (const kw of r.video.source_keywords ?? []) { const s = stats.get(kw); if (s) s.survived++ }
  }
  const toUpsert = [...kept, ...resurfacedInWindow.map((r) => r.video)]

  // Upsert kept videos (merge on natural key — preserves Pass A columns).
  if (!opts.dryRun && toUpsert.length) {
    const { error } = await admin
      .from('videos')
      .upsert(toUpsert, { onConflict: 'client_id,platform,video_id' })
    if (error) errors.push(`videos upsert: ${error.message}`)
  }

  // Eligible-for-comments (stats credit spans fresh + resurfaced so keyword ROI
  // stays comparable across re-runs) + optional cost cap. Only FRESH videos
  // scrape unconditionally — known videos go through the growth rule below.
  const eligibleVideos = toUpsert.filter(
    (v) => adapter.commentThreshold == null || v.comments_count >= adapter.commentThreshold,
  )
  for (const v of eligibleVideos) for (const kw of v.source_keywords ?? []) { const s = stats.get(kw); if (s) s.eligible++ }
  const freshEligible = kept.filter(
    (v) => adapter.commentThreshold == null || v.comments_count >= adapter.commentThreshold,
  )
  const toScrape = opts.videoLimit ? freshEligible.slice(0, opts.videoLimit) : freshEligible

  // Delta re-checks: known videos whose comment count grew earn a re-scrape —
  // even outside the window (their NEW comments are this period's conversation;
  // comment_date keeps the period slice honest). Candidates come free from the
  // search results; platforms with a free count API (YouTube) also check stored
  // recent videos the search didn't resurface. Unchanged videos are the Part-1
  // saving: no growth → no paid scrape.
  const candidates: RecheckCandidate[] = resurfaced.map((r) => ({
    video_id: r.video.video_id,
    video_url: r.video.video_url || r.state.video_url,
    freshCount: r.video.comments_count,
    baseline: scrapeBaseline(r.state),
  }))
  if (adapter.fetchCommentCounts) {
    const resurfacedIds = new Set(resurfaced.map((r) => r.video.video_id))
    const cutoff = new Date(Date.now() - RECHECK_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
    const dormant = knownRows.filter(
      (r) => !resurfacedIds.has(r.video_id) && r.upload_date != null && r.upload_date >= cutoff,
    )
    if (dormant.length) {
      try {
        const counts = await adapter.fetchCommentCounts(dormant.map((d) => d.video_id))
        for (const d of dormant) {
          const freshCount = counts.get(d.video_id)
          if (freshCount != null) {
            candidates.push({ video_id: d.video_id, video_url: d.video_url, freshCount, baseline: scrapeBaseline(d) })
          }
        }
      } catch (e) {
        // Best-effort: a count-API hiccup must never fail the gather.
        errors.push(`recheck counts: ${(e as Error).message}`)
      }
    }
  }
  const rechecks = pickRechecks(candidates, {
    minGrowth: RECHECK_MIN_GROWTH,
    threshold: adapter.commentThreshold,
    cap: RECHECK_CAP,
  })
  if (candidates.length) {
    console.log(`[${adapter.platform}] delta: ${candidates.length} known videos checked → ${rechecks.length} re-scrapes, ${candidates.length - rechecks.length} skipped (no growth)`)
  }

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
    videosKept: toUpsert.length,
    // Fresh first-time scrapes + growth re-checks. Disjoint by construction:
    // toScrape is fresh-only, rechecks are known-only.
    eligible: [
      ...toScrape.map((v) => ({ video_id: v.video_id, video_url: v.video_url, comments_count: v.comments_count })),
      ...rechecks,
    ],
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
      let rawComments: RawItem[]
      if (adapter.fetchComments) {
        rawComments = await adapter.fetchComments(ref, config)
      } else if (adapter.commentScrape) {
        const { actor: cActor, input: cInput } = adapter.commentScrape(ref, config)
        rawComments = await runActor(cActor, cInput)
      } else {
        throw new Error(`adapter ${opts.platform} has no comment source`)
      }
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
      // Stamp the delta-scraping baseline: this video's comments were captured
      // at this observed count (even if the scrape returned few/none — checked
      // is checked). Later runs compare their fresh count against it to decide
      // whether a re-scrape is worth paying for (delta.ts).
      if (!opts.dryRun) {
        const { error } = await admin
          .from('videos')
          .update({ comments_count: ref.comments_count, comments_count_at_scrape: ref.comments_count })
          .eq('client_id', opts.clientId)
          .eq('platform', opts.platform)
          .eq('video_id', ref.video_id)
        if (error) errors.push(`scrape baseline stamp (${ref.video_id}): ${error.message}`)
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
        videoLimit: opts.videoLimit, period: opts.period, relevance: opts.relevance,
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
