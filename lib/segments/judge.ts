import type OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'

import { estimateCost } from '../config'
import { dbSafeText } from '../db-text'
import { resolvedHints, segmentHintsFor, type SegmentHints } from './hints'
import type { Segment } from './rules'

// The segment judge (segments_v2, plan WP3.2; decision F; CQ F105).
//
// ONE QUESTION, ASKED PER VIDEO: who is this video's comment section, relative
// to the buyers of the tenant's market? buyer · buyer-adjacent · maker ·
// off-topic · other. The per-tenant hints (lib/segments/hints.ts) say what the
// five mean in that market. It reads what the relevance gate reads (account,
// caption, hashtags, lib/gather/relevance.ts buildUserPrompt) plus the
// platform, so its cost is the gate's order: about $0.50–1.00 once over every
// stored video and about $0.02 a run (decision L).
//
// A LABEL, NEVER A DELETION. Each role maps to a `video_segments` segment
// (ROLE_SEGMENT): a maker stays in every count, marked; off-topic is `noise`,
// set aside only where decision F says so. The row carries method 'judge' and
// rule_version 'segments_v2', and its reason keeps the role
// (`judge_role:buyer-adjacent`), so a later Buyers lens can tell a buyer from
// an "other" without a second call.
//
// NEVER FAIL OPEN. A batch that throws, times out or comes back unparsed labels
// nothing: its videos keep the label they had (the v1 rule row, or the rule
// computed inline) and are judged again next time. A video the model skipped is
// listed in `missing`, never guessed.
//
// ONE PINNED FUNCTION. `judgeSegmentBatch` judges one batch of at most
// SEGMENT_JUDGE_BATCH videos in one call, bounded at SEGMENT_JUDGE_TIMEOUT_MS
// with no SDK retry, so the run's segment-videos step (mf/s3-run, behind
// SEGMENT_JUDGE_ENABLED) can call it per batch and stay inside its 300 s:
// `segmentJudgeSteps` groups the batches so no step holds more than it can
// finish. The model client is PASSED IN, never built here: importing this file
// constructs no OpenAI client, so the step passes lib/openai.ts's `openai`, the
// script builds one only behind its spend flag, and the tests pass a mock.

export const SEGMENT_JUDGE_VERSION = 'segments_v2'
export const SEGMENT_JUDGE_MODEL = 'gpt-4.1-mini'
/** ai_call_log.prompt_version. Bump when the prompt below changes. */
export const SEGMENT_JUDGE_PROMPT_VERSION = 'segments_v2.p1'
/** ai_call_log.pass. */
export const SEGMENT_JUDGE_PASS = 'segment_judge'

/** The five roles, in the plan's words (CQ F105). */
export const JUDGE_ROLES = ['buyer', 'buyer-adjacent', 'maker', 'off-topic', 'other'] as const
export type JudgeRole = (typeof JUDGE_ROLES)[number]

/** Each role's `video_segments.segment`. Only maker and off-topic mark a video:
 *  buyer, buyer-adjacent and other stay the market (decision F sets aside
 *  off-topic videos, and groups makers; nothing else). */
export const ROLE_SEGMENT: Readonly<Record<JudgeRole, Segment>> = {
  buyer: 'market',
  'buyer-adjacent': 'market',
  maker: 'maker',
  'off-topic': 'noise',
  other: 'market',
}

/** `video_segments.reason` for a judged role. */
export const judgeReason = (role: JudgeRole): string => `judge_role:${role}`

/** The role a judge reason names, or null. */
export function roleOfReason(reason: string | null | undefined): JudgeRole | null {
  const m = /^judge_role:(.+)$/.exec(reason ?? '')
  return m && (JUDGE_ROLES as readonly string[]).includes(m[1]) ? (m[1] as JudgeRole) : null
}

// ---- The time bound ---------------------------------------------------------------

/** Videos per call: the gate's 60 less a margin, since each verdict here also
 *  carries a short why. */
export const SEGMENT_JUDGE_BATCH = 50
/** One call's ceiling. A call past it is a failed batch, not the SDK's default
 *  of ten minutes and two silent retries (lib/pipeline/pass-b.ts's lesson). */
export const SEGMENT_JUDGE_TIMEOUT_MS = 120_000
/** An Inngest step's HTTP invocation cap: the route's 300 s. */
export const SEGMENT_STEP_BUDGET_MS = 300_000
/** Batches one step may run one after another: 2 × 120 s = 240 s < 300 s. */
export const SEGMENT_JUDGE_BATCHES_PER_STEP = 2

/** The candidates in batches of at most SEGMENT_JUDGE_BATCH, in order. */
export function segmentJudgeBatches<T>(candidates: readonly T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < candidates.length; i += SEGMENT_JUDGE_BATCH) out.push(candidates.slice(i, i + SEGMENT_JUDGE_BATCH))
  return out
}

/** The batches grouped per step: at most SEGMENT_JUDGE_BATCHES_PER_STEP each,
 *  so the worst case of one step (every call running to its timeout) is inside
 *  SEGMENT_STEP_BUDGET_MS. */
export function segmentJudgeSteps<T>(candidates: readonly T[]): T[][][] {
  const batches = segmentJudgeBatches(candidates)
  const out: T[][][] = []
  for (let i = 0; i < batches.length; i += SEGMENT_JUDGE_BATCHES_PER_STEP) out.push(batches.slice(i, i + SEGMENT_JUDGE_BATCHES_PER_STEP))
  return out
}

// ---- The prompt -------------------------------------------------------------------

/** What the judge sees of one video: the gate's fields, plus the platform. */
export interface SegmentCandidate {
  /** videos.id (uuid): the row's key, never shown to the model. */
  id: string
  platform?: string | null
  account_name?: string | null
  caption?: string | null
  hashtags?: readonly string[] | null
}

/** Scraped text bound for the prompt: whitespace collapsed, clipped by CODE
 *  POINT (a UTF-16 cut can split an emoji, and one lone surrogate 400s the whole
 *  batch), then stripped of any lone surrogate it arrived with. The same rule
 *  as lib/gather/transcript.ts promptText, restated here because importing that
 *  module builds the OpenAI client at import. */
export function judgeText(s: string | null | undefined, max: number): string {
  const collapsed = `${s ?? ''}`.replace(/\s+/g, ' ').trim()
  const points = [...collapsed]
  return dbSafeText(points.length <= max ? collapsed : points.slice(0, max).join(''))
}

export function buildJudgeSystemPrompt(hints: SegmentHints, homonyms: readonly string[] = []): string {
  return [
    'You sort social videos by who their comment section is, relative to the buyers of one market.',
    `The market: ${hints.market}.`,
    '',
    'Give each video exactly one role:',
    `- buyer: ${hints.buyer}.`,
    `- buyer-adjacent: ${hints.buyerAdjacent}.`,
    `- maker: ${hints.maker}.`,
    `- off-topic: ${hints.offTopic}.`,
    `- other: ${hints.other}.`,
    '',
    'Judge from the platform, account, caption and hashtags you are given, and nothing else.',
    'A brand or place name alone does not make a video part of the market: a search word can match another sense of the word.',
    ...(homonyms.length > 0 ? [`For this market these are other senses of its names, not the brands: ${homonyms.join(', ')}.`] : []),
    'A finished item shown for sale is buyer content; a how-to, the making itself, or a maker showing their craft is maker content.',
    'Use maker and off-topic only when the video makes it plain. When unsure, choose other.',
    'For each video give a why of at most twelve words.',
  ].join('\n')
}

export function buildJudgeUserPrompt(candidates: readonly SegmentCandidate[]): string {
  const lines = ['VIDEOS (judge each by index):']
  candidates.forEach((c, i) => {
    const tags = (c.hashtags ?? []).slice(0, 8).map((h) => judgeText(h, 60)).filter(Boolean).join(' ')
    lines.push(
      `[${i}] platform=${judgeText(c.platform, 20) || '(none)'} | account=${judgeText(c.account_name, 100) || '(none)'}`
      + ` | caption=${judgeText(c.caption, 200) || '(none)'} | hashtags=${tags || '(none)'}`,
    )
  })
  return lines.join('\n')
}

const verdictSchema = z.object({
  index: z.number().int(),
  role: z.enum(JUDGE_ROLES),
  why: z.string(),
})
export const segmentJudgeSchema = z.object({ verdicts: z.array(verdictSchema) })

// ---- The call ---------------------------------------------------------------------

/** The model client, as the SDK types it: lib/openai.ts's `openai` fits, and so
 *  does a test double cast to it. */
export type SegmentJudgeClient = Pick<OpenAI, 'chat'>

export interface SegmentJudgement {
  videoId: string
  role: JudgeRole
  segment: Segment
  /** `judge_role:<role>`: what the row's reason column stores. */
  reason: string
  /** The model's own why, for the hand check. Never printed to a client. */
  why: string
}

export interface SegmentJudgeBatchResult {
  judgements: SegmentJudgement[]
  /** Videos in the batch the model returned no verdict for. */
  missing: string[]
  usage: { prompt_tokens: number; completion_tokens: number }
  costUsd: number
  durationMs: number
  /** Null when the call returned a parsed answer. Otherwise the whole batch is
   *  unlabelled (never fail-open). */
  error: string | null
  /** What the caller logs to ai_call_log (pass SEGMENT_JUDGE_PASS). */
  call: { model: string; promptVersion: string; systemPrompt: string; userPrompt: string; response: unknown }
}

export interface JudgeBatchArgs {
  clientId: string
  candidates: readonly SegmentCandidate[]
  client: SegmentJudgeClient
  /** tracking_configs.exclude_terms. */
  excludeTerms?: readonly string[] | null
  /** tracking_configs.market_description (MF3), once it exists. */
  marketDescription?: string | null
  /** Tests only: hints in place of the tenant's. */
  hints?: SegmentHints
  now?: () => number
}

/**
 * Judge ONE batch, in one model call. THE PINNED FUNCTION: mf/s3-run's
 * segment-videos step calls it per batch (segmentJudgeSteps), behind
 * SEGMENT_JUDGE_ENABLED, and inserts `judgeRows` of what comes back.
 *
 * Throws only on a caller's mistake (an oversized batch, a tenant with no
 * hints, a duplicated video): the model's failures come back as `error`, with
 * nothing labelled.
 */
export async function judgeSegmentBatch(args: JudgeBatchArgs): Promise<SegmentJudgeBatchResult> {
  const { candidates } = args
  if (candidates.length > SEGMENT_JUDGE_BATCH) {
    throw new Error(`segment judge: a batch holds at most ${SEGMENT_JUDGE_BATCH} videos, got ${candidates.length}`)
  }
  if (new Set(candidates.map((c) => c.id)).size !== candidates.length) throw new Error('segment judge: a video appears twice in one batch')
  const base = args.hints ?? segmentHintsFor(args.clientId)
  if (!base) throw new Error(`segment judge: no hints for client ${args.clientId} (lib/segments/hints.ts); it is not judged`)
  const { hints, homonyms } = resolvedHints(base, { excludeTerms: args.excludeTerms, marketDescription: args.marketDescription })

  const now = args.now ?? Date.now
  const systemPrompt = buildJudgeSystemPrompt(hints, homonyms)
  const userPrompt = buildJudgeUserPrompt(candidates)
  const result: SegmentJudgeBatchResult = {
    judgements: [], missing: [], usage: { prompt_tokens: 0, completion_tokens: 0 }, costUsd: 0, durationMs: 0, error: null,
    call: { model: SEGMENT_JUDGE_MODEL, promptVersion: SEGMENT_JUDGE_PROMPT_VERSION, systemPrompt, userPrompt, response: null },
  }
  if (candidates.length === 0) return result

  const started = now()
  let parsed: z.infer<typeof segmentJudgeSchema> | null | undefined
  try {
    const completion = await args.client.chat.completions.parse({
      model: SEGMENT_JUDGE_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: zodResponseFormat(segmentJudgeSchema, 'segments'),
    }, { timeout: SEGMENT_JUDGE_TIMEOUT_MS, maxRetries: 0 })
    if (completion.usage) {
      result.usage = { prompt_tokens: completion.usage.prompt_tokens, completion_tokens: completion.usage.completion_tokens }
      result.costUsd = estimateCost(SEGMENT_JUDGE_MODEL, completion.usage.prompt_tokens, completion.usage.completion_tokens)
    }
    parsed = completion.choices[0]?.message?.parsed
    result.call.response = parsed ?? completion.choices[0]?.message ?? null
    if (!parsed) result.error = completion.choices[0]?.message?.refusal ? `refused: ${completion.choices[0].message.refusal}` : 'no parsed answer'
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e)
  }
  result.durationMs = now() - started

  if (parsed && !result.error) {
    const seen = new Set<number>()
    for (const v of parsed.verdicts) {
      const c = candidates[v.index]
      if (!c || seen.has(v.index)) continue // out of range, or a second verdict for one index: the first stands
      seen.add(v.index)
      result.judgements.push({ videoId: c.id, role: v.role, segment: ROLE_SEGMENT[v.role], reason: judgeReason(v.role), why: judgeText(v.why, 120) })
    }
    result.missing = candidates.filter((_, i) => !seen.has(i)).map((c) => c.id)
  } else {
    result.missing = candidates.map((c) => c.id)
  }
  return result
}

// ---- The projection (no call) -----------------------------------------------------

/** Output tokens a verdict takes: index, role and a twelve-word why, in JSON. */
export const JUDGE_OUTPUT_TOKENS_PER_VIDEO = 30

/** A rough token count for English prompt text: four characters a token. */
export const roughTokens = (text: string): number => Math.ceil(text.length / 4)

export interface JudgeProjection { videos: number; batches: number; steps: number; promptTokens: number; completionTokens: number; usd: number }

/** What judging these videos would cost, from the prompts it would send, with
 *  no call made. The dry run prints it, and the spend flag is refused above
 *  the caller's cap before any call. */
export function projectJudgeCost(candidates: readonly SegmentCandidate[], hints: SegmentHints, homonyms: readonly string[] = []): JudgeProjection {
  const system = roughTokens(buildJudgeSystemPrompt(hints, homonyms))
  const batches = segmentJudgeBatches(candidates)
  let promptTokens = 0
  for (const b of batches) promptTokens += system + roughTokens(buildJudgeUserPrompt(b))
  const completionTokens = candidates.length * JUDGE_OUTPUT_TOKENS_PER_VIDEO
  return {
    videos: candidates.length,
    batches: batches.length,
    steps: Math.ceil(batches.length / SEGMENT_JUDGE_BATCHES_PER_STEP),
    promptTokens,
    completionTokens,
    usd: estimateCost(SEGMENT_JUDGE_MODEL, promptTokens, completionTokens),
  }
}
