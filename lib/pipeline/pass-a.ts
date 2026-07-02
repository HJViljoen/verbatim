import { zodResponseFormat } from 'openai/helpers/zod'
import { createAdminClient, selectAll } from '../supabase-admin'
import { openai } from '../openai'
import { ANALYSIS_MODEL, ANALYSIS_TEMPERATURE, estimateCost } from '../config'
import { PassAVideoSchema, type PassAVideoOutput, type PassAInsight } from './schemas'
import { filterComments } from './spam-filter'
import { computeQualityScore } from './metrics'
import type { VideoRow, CommentRow } from './types'

// Pass A — per-video analysis (Architecture/Analysis-Passes §Pass A), built in
// code per Architecture/Migration-to-Code. One GPT call per video (>=5 kept
// comments): classification + audience insights, each insight carrying verbatim
// evidence tied to a real comment. Validated post-parse and persisted to
// videos / audience_insights / insight_evidence, with one ai_call_log row.
//
// Budget note: $2.40 OpenAI ceiling — iterate with `dryRun` (free) and small
// `limit`/`videoIds` samples; only run the full corpus once the prompt is dialed.

const PROMPT_VERSION = 'pass_a_v2'
const DEFAULT_MIN_COMMENTS = 5

export interface RunPassAOptions {
  clientId: string
  platform?: string
  /** Analysis run id. Created (status 'analyzing') if omitted; returned in the summary. */
  runId?: string
  /** Process only these videos.id values. */
  videoIds?: string[]
  /** Cap number of videos processed (most-commented first). */
  limit?: number
  /** Min kept comments for a per-video call (default 5). Below this, skipped (metadata batch is a later step). */
  minComments?: number
  /** Assemble prompts + estimate tokens, no API calls, no writes. */
  dryRun?: boolean
  /** Write results to DB. Defaults to !dryRun. */
  persist?: boolean
}

export interface PerVideoResult {
  videoId: string
  videoUrl: string
  keptComments: number
  droppedLowSignal: number
  status: 'analyzed' | 'skipped_too_few' | 'dry_run' | 'refused' | 'error'
  insightsKept?: number
  insightsDropped?: number
  evidenceDropped?: number
  promptTokens?: number
  completionTokens?: number
  costUsd?: number
  estInputTokens?: number
  error?: string
}

export interface RunPassASummary {
  runId: string
  model: string
  dryRun: boolean
  videosProcessed: number
  videosAnalyzed: number
  videosSkipped: number
  insightsKept: number
  insightsDropped: number
  evidenceDropped: number
  promptTokens: number
  completionTokens: number
  costUsd: number
  estInputTokens: number
  perVideo: PerVideoResult[]
}

interface TrackingConfig {
  brand_keywords: string[] | null
  competitor_names: string[] | null
  industry_keywords: string[] | null
}

// ---- prompt building -------------------------------------------------------

function ownerLabel(v: VideoRow): string {
  if (v.is_client) return 'the CLIENT brand'
  if (v.is_competitor) return `a COMPETITOR (${v.competitor_name ?? 'unknown'})`
  return 'an industry/other account'
}

function buildSystemPrompt(tc: TrackingConfig): string {
  const brand = (tc.brand_keywords ?? []).join(', ') || '(none provided)'
  const competitors = (tc.competitor_names ?? []).join(', ') || '(none provided)'
  const industry = (tc.industry_keywords ?? []).join(', ') || '(none provided)'
  // competitor_keywords intentionally excluded (invariant 2 — search-only).
  return [
    'You are a media-based consumer intelligence analyst working for a brand.',
    '',
    'Given ONE social video and its comments, return:',
    '1. A classification of the video (type, hook style, hook text, topics, sentiment).',
    '2. Audience insights distilled STRICTLY from the comments — and ONLY insights that carry consumer-intelligence value for the brand.',
    '',
    'Client context:',
    `- Brand: ${brand}`,
    `- Competitors: ${competitors}`,
    `- Industry: ${industry}`,
    '',
    'Insight categories (apply these definitions strictly):',
    '- pain_point: a problem, frustration, or unmet need with a product, the category, or the lived experience. NOT general sadness or sympathy.',
    '- question: a genuine question about the product, the category, or how something works.',
    '- purchase_intent: a signal of wanting to buy, try, own, or where to get something.',
    '- feature_request: a suggested improvement or a desired capability.',
    '- praise: positive feedback about a product, brand, or result. NOT generic "so beautiful / inspiring" on human-interest content.',
    '- objection: a concern, criticism, or reason not to buy.',
    '- misinformation: a false or misleading claim worth flagging.',
    '- demographic_signal: who the audience is — age, condition, use-case, or location revealed in the comments.',
    '',
    'Rules:',
    '- Quote every piece of evidence VERBATIM from a comment. Never paraphrase.',
    '- For each quote, set comment_id to the bracket label of the source comment (e.g. "c3"), exactly as shown in the input. Use ONLY labels present in the input.',
    '- If a claim cannot be supported by a verbatim quote, do not make it.',
    '- Only extract insights with genuine consumer-intelligence value. IGNORE generic emotional reactions (sympathy, prayers, "so beautiful"), jokes, off-topic chatter, and subject-identity corrections. If the comments contain no such signal, return an empty "insights" array — do NOT manufacture insights.',
    '- strength_score: 1-3 = weak/incidental (one or two off-hand comments); 4-6 = clear signal from a few comments; 7-10 = strong, recurring signal across many comments. Base it on consumer-intelligence value and how many comments support it, NOT on emotional intensity.',
    '- Video sentiment must reflect how commenters received the video, not the title/caption. Use null only if the comments give no sentiment signal.',
    '- theme is a short snake_case slug, 2-4 words (e.g. stairs_difficulty). Reuse the same slug for the same underlying idea.',
    '- Do not invent counts or percentages.',
    '- Insights must come from the comments, not the metadata.',
  ].join('\n')
}

interface CommentRef {
  label: string
  realId: string
  text: string
}

function buildUserPrompt(v: VideoRow, refs: CommentRef[]): string {
  const lines: string[] = [
    'VIDEO',
    `- platform: ${v.platform}`,
    `- account: ${v.account_name}`,
    `- owner: ${ownerLabel(v)}`,
    `- caption: ${v.caption ?? '(none)'}`,
    `- hashtags: ${(v.hashtags ?? []).join(' ') || '(none)'}`,
    `- format: ${v.content_format ?? '(unknown)'}`,
    '',
    `COMMENTS (${refs.length})`,
  ]
  for (const r of refs) {
    const oneLine = r.text.replace(/\s+/g, ' ').trim()
    lines.push(`[${r.label}] ${oneLine}`)
  }
  return lines.join('\n')
}

// ---- validation ------------------------------------------------------------

function normForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

interface ValidatedInsight {
  insight: PassAInsight
  evidence: { realId: string; quote: string }[]
}

interface ValidationResult {
  kept: ValidatedInsight[]
  insightsDropped: number
  evidenceDropped: number
}

/** Map evidence refs -> real comment ids, drop unknown refs and quotes that
 *  don't appear (normalisation-tolerant) in the referenced comment. Drop any
 *  insight left with no valid evidence (invariant 3). */
function validateInsights(parsed: PassAVideoOutput, refs: CommentRef[]): ValidationResult {
  const byLabel = new Map(refs.map((r) => [r.label.toLowerCase(), r]))
  const kept: ValidatedInsight[] = []
  let evidenceDropped = 0
  let insightsDropped = 0

  for (const insight of parsed.insights) {
    const validEvidence: { realId: string; quote: string }[] = []
    for (const ev of insight.evidence) {
      const ref = byLabel.get((ev.comment_id ?? '').toLowerCase().trim())
      if (!ref) {
        evidenceDropped++
        continue
      }
      const haystack = normForMatch(ref.text)
      const needle = normForMatch(ev.quote)
      if (needle.length === 0 || !haystack.includes(needle)) {
        evidenceDropped++
        continue
      }
      validEvidence.push({ realId: ref.realId, quote: ev.quote })
    }
    if (validEvidence.length === 0) {
      insightsDropped++
      continue
    }
    kept.push({ insight, evidence: validEvidence })
  }
  return { kept, insightsDropped, evidenceDropped }
}

const clampScore = (n: number) => Math.max(1, Math.min(10, Math.round(n)))

// ---- main ------------------------------------------------------------------

export async function runPassA(opts: RunPassAOptions): Promise<RunPassASummary> {
  const {
    clientId,
    platform,
    videoIds,
    limit,
    minComments = DEFAULT_MIN_COMMENTS,
    dryRun = false,
  } = opts
  const persist = opts.persist ?? !dryRun
  const admin = createAdminClient()

  // 1. Client context.
  const { data: tc } = await admin
    .from('tracking_configs')
    .select('brand_keywords, competitor_names, industry_keywords')
    .eq('client_id', clientId)
    .maybeSingle()
  const trackingConfig: TrackingConfig = tc ?? { brand_keywords: null, competitor_names: null, industry_keywords: null }
  const systemPrompt = buildSystemPrompt(trackingConfig)

  // 2. Videos (most-commented first so samples hit the richest content).
  //    Paginated past the 1000-row cap unless an explicit --limit caps the run.
  const buildVideos = () => {
    let q = admin.from('videos').select('*').eq('client_id', clientId)
    if (platform) q = q.eq('platform', platform)
    if (videoIds && videoIds.length) q = q.in('id', videoIds)
    return q
      .order('comments_count', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
  }
  let videoRows: VideoRow[]
  if (limit) {
    const { data, error: vErr } = await buildVideos().limit(limit)
    if (vErr) throw new Error(`load videos: ${vErr.message}`)
    videoRows = (data ?? []) as VideoRow[]
  } else {
    videoRows = await selectAll<VideoRow>(buildVideos)
  }

  // 3. Comments for those videos, grouped by (platform, video_id). Paginated —
  //    a busy client easily has >1000 comments, and a silent truncation here
  //    starves the per-video comment counts (the analysable-corpus bug).
  //    Load the client's comments in one scan (optionally platform-scoped) and
  //    filter to the wanted videos IN MEMORY — a `.in('video_id', [all ids])`
  //    filter blows the URL length limit once the corpus grows to ~1k+ videos
  //    ("fetch failed"), so we never send the giant IN clause.
  const wanted = new Set(videoRows.map((v) => `${v.platform}::${v.video_id}`))
  const commentsByVideo = new Map<string, CommentRow[]>()
  if (wanted.size) {
    const comments = await selectAll<CommentRow>(() => {
      let q = admin
        .from('comments')
        .select('id, client_id, run_id, platform, video_id, comment_id, author, text, likes')
        .eq('client_id', clientId)
        .order('id', { ascending: true })
      if (platform) q = q.eq('platform', platform)
      return q
    })
    for (const c of comments) {
      const key = `${c.platform}::${c.video_id}`
      if (!wanted.has(key)) continue
      const arr = commentsByVideo.get(key)
      if (arr) arr.push(c)
      else commentsByVideo.set(key, [c])
    }
  }

  // 4. Resolve analysis run id (create one if not supplied).
  let runId = opts.runId
  if (!runId && persist) {
    const { data: run, error: rErr } = await admin
      .from('pipeline_runs')
      .insert({ client_id: clientId, status: 'analyzing' })
      .select('id')
      .single()
    if (rErr) throw new Error(`create run: ${rErr.message}`)
    runId = run.id as string
  }
  runId = runId ?? '(dry-run, no run created)'

  const summary: RunPassASummary = {
    runId,
    model: ANALYSIS_MODEL,
    dryRun,
    videosProcessed: 0,
    videosAnalyzed: 0,
    videosSkipped: 0,
    insightsKept: 0,
    insightsDropped: 0,
    evidenceDropped: 0,
    promptTokens: 0,
    completionTokens: 0,
    costUsd: 0,
    estInputTokens: 0,
    perVideo: [],
  }

  let callIndex = 0
  for (const v of videoRows) {
    summary.videosProcessed++
    const all = commentsByVideo.get(`${v.platform}::${v.video_id}`) ?? []
    const { kept, lowSignal } = filterComments(all)

    // Flag low-signal comments (don't delete) — invariant: still visible in drill-down.
    if (persist && lowSignal.length) {
      await admin.from('comments').update({ is_low_signal: true }).in('id', lowSignal.map((l) => l.id))
    }

    const res: PerVideoResult = {
      videoId: v.id,
      videoUrl: v.video_url,
      keptComments: kept.length,
      droppedLowSignal: lowSignal.length,
      status: 'skipped_too_few',
    }

    if (kept.length < minComments) {
      summary.videosSkipped++
      summary.perVideo.push(res)
      continue
    }

    const refs: CommentRef[] = kept.map((c, i) => ({ label: `c${i + 1}`, realId: c.id, text: c.text ?? '' }))
    const userPrompt = buildUserPrompt(v, refs)

    if (dryRun) {
      const estInputTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4)
      summary.estInputTokens += estInputTokens
      res.status = 'dry_run'
      res.estInputTokens = estInputTokens
      // Preview the first assembled prompt so it can be eyeballed for free.
      if (summary.perVideo.filter((r) => r.status === 'dry_run').length === 0) {
        console.log('\n--- PROMPT PREVIEW (first video) ---')
        console.log('[system]\n' + systemPrompt)
        console.log('\n[user]\n' + userPrompt)
        console.log('--- end preview ---\n')
      }
      summary.perVideo.push(res)
      continue
    }

    // ---- live GPT call ----
    callIndex++
    const startedAt = Date.now()
    let parsed: PassAVideoOutput | null = null
    let refusal: string | null = null
    let usage = { prompt_tokens: 0, completion_tokens: 0 }
    try {
      const completion = await openai.chat.completions.parse({
        model: ANALYSIS_MODEL,
        temperature: ANALYSIS_TEMPERATURE,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: zodResponseFormat(PassAVideoSchema, 'pass_a'),
      })
      const msg = completion.choices[0]?.message
      parsed = msg?.parsed ?? null
      refusal = msg?.refusal ?? null
      if (completion.usage) {
        usage = { prompt_tokens: completion.usage.prompt_tokens, completion_tokens: completion.usage.completion_tokens }
      }
    } catch (e) {
      res.status = 'error'
      res.error = e instanceof Error ? e.message : String(e)
      summary.perVideo.push(res)
      if (persist) await logCall(admin, { clientId, runId, callIndex, systemPrompt, userPrompt, response: null, error: res.error, usage, durationMs: Date.now() - startedAt, validationStatus: 'parse_error' })
      continue
    }

    const durationMs = Date.now() - startedAt
    const costUsd = estimateCost(ANALYSIS_MODEL, usage.prompt_tokens, usage.completion_tokens)
    summary.promptTokens += usage.prompt_tokens
    summary.completionTokens += usage.completion_tokens
    summary.costUsd += costUsd
    res.promptTokens = usage.prompt_tokens
    res.completionTokens = usage.completion_tokens
    res.costUsd = costUsd

    if (!parsed) {
      res.status = 'refused'
      res.error = refusal ?? 'no parsed output'
      summary.perVideo.push(res)
      if (persist) await logCall(admin, { clientId, runId, callIndex, systemPrompt, userPrompt, response: { refusal }, error: res.error, usage, durationMs, validationStatus: 'parse_error' })
      continue
    }

    const validation = validateInsights(parsed, refs)
    summary.insightsKept += validation.kept.length
    summary.insightsDropped += validation.insightsDropped
    summary.evidenceDropped += validation.evidenceDropped
    res.status = 'analyzed'
    res.insightsKept = validation.kept.length
    res.insightsDropped = validation.insightsDropped
    res.evidenceDropped = validation.evidenceDropped
    summary.videosAnalyzed++

    if (persist) {
      await persistVideo(admin, {
        video: v,
        runId,
        parsed,
        validated: validation.kept,
        qualityScore: computeQualityScore(all),
      })
      await logCall(admin, {
        clientId,
        runId,
        callIndex,
        systemPrompt,
        userPrompt,
        response: { classification: parsed.classification, insights_kept: validation.kept.length, insights_dropped: validation.insightsDropped, evidence_dropped: validation.evidenceDropped },
        error: null,
        usage,
        durationMs,
        validationStatus: validation.insightsDropped > 0 || validation.evidenceDropped > 0 ? 'quote_not_found' : 'ok',
      })
    }

    // Live burn log.
    console.log(
      `  [c${callIndex}] ${v.video_url} — ${validation.kept.length} insights ` +
        `(${validation.insightsDropped} dropped, ${validation.evidenceDropped} evidence dropped) · ` +
        `${usage.prompt_tokens}+${usage.completion_tokens} tok · $${costUsd.toFixed(5)}`,
    )

    summary.perVideo.push(res)
  }

  return summary
}

// ---- persistence helpers ---------------------------------------------------

interface PersistArgs {
  video: VideoRow
  runId: string
  parsed: PassAVideoOutput
  validated: ValidatedInsight[]
  qualityScore: number | null
}

async function persistVideo(admin: ReturnType<typeof createAdminClient>, args: PersistArgs): Promise<void> {
  const { video, runId, parsed, validated, qualityScore } = args
  const c = parsed.classification

  // Idempotent at the step level (invariant 6): clear this video's prior insights for the run.
  await admin.from('audience_insights').delete().eq('client_id', video.client_id).eq('run_id', runId).eq('source_video_id', video.id)

  // Classification onto the video row.
  await admin
    .from('videos')
    .update({
      classified_type: c.classified_type,
      hook_style: c.hook_style,
      hook_text: c.hook_text,
      topics: c.topics,
      sentiment: c.sentiment,
      comment_quality_score: qualityScore,
    })
    .eq('id', video.id)

  // Insights + evidence.
  for (const { insight, evidence } of validated) {
    const { data: row, error } = await admin
      .from('audience_insights')
      .insert({
        client_id: video.client_id,
        run_id: runId,
        platform: video.platform,
        source_video_id: video.id,
        category: insight.category,
        theme: insight.theme,
        description: insight.description,
        strength_score: clampScore(insight.strength_score),
        emotion: insight.emotion,
        sentiment_impact: insight.sentiment_impact,
      })
      .select('id')
      .single()
    if (error || !row) continue
    const insightId = row.id as string
    await admin.from('insight_evidence').insert(
      evidence.map((e, i) => ({
        audience_insight_id: insightId,
        comment_id: e.realId,
        quote: e.quote,
        relevance_rank: i + 1,
      })),
    )
  }
}

interface LogArgs {
  clientId: string
  runId: string
  callIndex: number
  systemPrompt: string
  userPrompt: string
  response: unknown
  error: string | null
  usage: { prompt_tokens: number; completion_tokens: number }
  durationMs: number
  validationStatus: string
}

async function logCall(admin: ReturnType<typeof createAdminClient>, a: LogArgs): Promise<void> {
  await admin.from('ai_call_log').insert({
    client_id: a.clientId,
    run_id: a.runId,
    pass: 'pass_a',
    call_index: a.callIndex,
    model: ANALYSIS_MODEL,
    prompt_version: PROMPT_VERSION,
    request: { system: a.systemPrompt, user: a.userPrompt },
    response: a.response,
    error_message: a.error,
    prompt_tokens: a.usage.prompt_tokens,
    completion_tokens: a.usage.completion_tokens,
    cost_usd: estimateCost(ANALYSIS_MODEL, a.usage.prompt_tokens, a.usage.completion_tokens),
    duration_ms: a.durationMs,
    validation_status: a.validationStatus,
  })
}
