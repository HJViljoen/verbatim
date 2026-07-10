import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'
import { createAdminClient } from '../supabase-admin'
import { openai, samplingParams } from '../openai'
import { SYNTHESIS_MODEL, estimateCost } from '../config'
import { logAiCall } from './ai-log'
import type { InsightRow } from './types'

// Theme label-merge pass — the upstream fix for theme fragmentation (teardown
// 2026-07-09 §Run 1, defect 3: 258/280 themes single-source, median evidence 1).
// Embedding clustering at 0.62 keeps same-concern insights apart when their
// free-text slugs differ superficially, and the threshold experiment showed
// loosening builds mega-blobs (0.55 → 8 multi-video themes), not mid-size
// themes. So the merge is a judgment call, made where judgment lives: after
// clustering, the model reads ONE bucket's cluster labels and names which
// clusters describe the SAME consumer concern; code validates and applies the
// merges, and aggregation rolls the merged clusters up as usual.
//
// Output validation (the existence-vs-relevance lesson): cluster numbers must
// exist, appear in at most one group, and a group is capped at MAX_MERGE_GROUP
// — an over-eager "merge everything backpack-shaped" answer is rejected
// wholesale rather than trusted. When in doubt the pass keeps clusters apart:
// a false merge hides a real finding inside an unrelated pile.

const PROMPT_VERSION = 'theme_merge_v1'

/** A merge group larger than this is a topic, not a theme — rejected whole. */
const MAX_MERGE_GROUP = 8

const MergeSchema = z.object({
  merges: z.array(
    z.object({
      cluster_numbers: z.array(z.number().int()),
      reason: z.string(),
    }),
  ),
})

function buildSystemPrompt(): string {
  return [
    'You deduplicate clustered consumer-comment themes for a consumer-intelligence product.',
    '',
    'You are given the numbered theme clusters found in one entity bucket of one analysis run.',
    'Each line is one cluster: its working label, what the underlying comments say, and its size.',
    '',
    'Merge ONLY clusters that describe the SAME consumer concern, question, desire, or behaviour —',
    'the same finding phrased differently (e.g. "backpack strap discomfort" and "shoulder pain',
    'carrying bag"). The test: would an analyst report them as ONE finding? Then they are one theme.',
    '',
    'Do NOT merge clusters that are merely:',
    '- in the same product area or topic (comfort vs durability of the same bag are TWO themes)',
    '- about the same platform, content format, or brand',
    '- a cause and its effect, or two different concerns at different levels of generality',
    '',
    'Return merge groups of 2 or more cluster numbers; a cluster may appear in at most one group.',
    'Clusters you do not mention stay separate. When in doubt, do NOT merge — a false merge hides',
    'a real finding inside an unrelated pile, which is worse than a duplicate.',
  ].join('\n')
}

/** One cluster's line in the prompt: canonical slug + strongest description. */
function clusterLine(n: number, cluster: InsightRow[]): string {
  const canonical = cluster.reduce((a, b) => (b.strength_score > a.strength_score ? b : a))
  const videos = new Set(cluster.map((i) => i.source_video_id)).size
  const desc = canonical.description.replace(/\s+/g, ' ').slice(0, 160)
  return `[${n}] ${canonical.theme.replace(/_/g, ' ')} — ${desc} (${videos} video${videos === 1 ? '' : 's'})`
}

export interface ThemeMergeOptions {
  clientId: string
  runId: string
  bucket: string
  clusters: InsightRow[][]
  /** Model override for offline A/B (default SYNTHESIS_MODEL). */
  model?: string
  /** Write the call to ai_call_log — the pipeline path. Scripts leave it off. */
  logCall?: boolean
  /** ai_call_log call_index — one merge call per bucket, numbered by the caller. */
  callIndex?: number
}

export interface ThemeMergeResult {
  clusters: InsightRow[][]
  /** Applied merges (member slugs + the model's reason) — operator visibility. */
  applied: { members: string[]; reason: string }[]
  /** Model-proposed groups dropped by validation (bad/duplicate/oversize). */
  rejectedGroups: number
  promptTokens: number
  completionTokens: number
  costUsd: number
}

/**
 * Merge same-concern clusters within one bucket. An API failure throws (the
 * Inngest step retries); an unparseable response applies no merges — honest
 * fragmentation over silent guessing — and logs as parse_error.
 */
export async function mergeClusterLabels(opts: ThemeMergeOptions): Promise<ThemeMergeResult> {
  const { clientId, runId, bucket, clusters } = opts
  const model = opts.model ?? SYNTHESIS_MODEL
  const base: ThemeMergeResult = {
    clusters, applied: [], rejectedGroups: 0,
    promptTokens: 0, completionTokens: 0, costUsd: 0,
  }
  if (clusters.length < 2) return base

  const systemPrompt = buildSystemPrompt()
  const userPrompt = [
    `BUCKET: ${bucket} — ${clusters.length} theme clusters`,
    ...clusters.map((c, i) => clusterLine(i + 1, c)),
  ].join('\n')

  const startedAt = Date.now()
  let parsed: z.infer<typeof MergeSchema> | null = null
  let usage = { prompt_tokens: 0, completion_tokens: 0 }
  try {
    // Synthesis-default reasoning effort, deliberately: at run-1 scale low
    // effort found 6/31 merges (missed the high_price family) and merged an
    // opposite-sentiment pair — the quality cliff is real. Cost of medium at
    // that scale: ~$0.21, ~95s inside the 300s 'themes' step (A2+merge measured
    // 112s total; scripts/run-cd.ts is the no-cap fallback if a baseline-scale
    // corpus ever clips the step).
    const completion = await openai.chat.completions.parse({
      model,
      ...samplingParams(model),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: zodResponseFormat(MergeSchema, 'theme_merge'),
    })
    parsed = completion.choices[0]?.message?.parsed ?? null
    if (completion.usage) {
      usage = { prompt_tokens: completion.usage.prompt_tokens, completion_tokens: completion.usage.completion_tokens }
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    if (opts.logCall) {
      await logAiCall(createAdminClient(), { clientId, runId, pass: 'theme_merge', callIndex: opts.callIndex ?? 1, model, promptVersion: PROMPT_VERSION, systemPrompt, userPrompt, response: null, error, usage, durationMs: Date.now() - startedAt, validationStatus: 'parse_error' })
    }
    throw new Error(`theme merge (${bucket}) failed: ${error}`)
  }
  const durationMs = Date.now() - startedAt
  base.promptTokens = usage.prompt_tokens
  base.completionTokens = usage.completion_tokens
  base.costUsd = estimateCost(model, usage.prompt_tokens, usage.completion_tokens)

  // Validate the proposed groups: in-range, deduped, no cluster in two groups,
  // size 2..MAX_MERGE_GROUP after cleaning. Anything else is dropped, counted.
  const used = new Set<number>()
  const validGroups: { idxs: number[]; reason: string }[] = []
  for (const m of parsed?.merges ?? []) {
    const idxs = [...new Set(m.cluster_numbers)]
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= clusters.length)
      .map((n) => n - 1)
      .filter((i) => !used.has(i))
    if (idxs.length < 2 || idxs.length > MAX_MERGE_GROUP) {
      base.rejectedGroups++
      continue
    }
    for (const i of idxs) used.add(i)
    validGroups.push({ idxs, reason: m.reason })
  }

  if (validGroups.length) {
    // Merged group replaces its first member's slot; other members drop out.
    const mergedInto = new Map<number, number>() // member idx → group idx
    validGroups.forEach((g, gi) => g.idxs.forEach((i) => mergedInto.set(i, gi)))
    const emitted = new Set<number>()
    const out: InsightRow[][] = []
    clusters.forEach((cluster, i) => {
      const gi = mergedInto.get(i)
      if (gi === undefined) {
        out.push(cluster)
      } else if (!emitted.has(gi)) {
        emitted.add(gi)
        out.push(validGroups[gi].idxs.flatMap((idx) => clusters[idx]))
      }
    })
    base.clusters = out
    base.applied = validGroups.map((g) => ({
      members: g.idxs.map((i) => clusters[i].reduce((a, b) => (b.strength_score > a.strength_score ? b : a)).theme),
      reason: g.reason,
    }))
  }

  if (opts.logCall) {
    await logAiCall(createAdminClient(), {
      clientId, runId, pass: 'theme_merge', callIndex: opts.callIndex ?? 1, model, promptVersion: PROMPT_VERSION, systemPrompt, userPrompt,
      response: { bucket, clusters_before: clusters.length, clusters_after: base.clusters.length, merges: base.applied.length, rejected_groups: base.rejectedGroups },
      error: parsed ? null : 'no parsed output', usage, durationMs,
      validationStatus: !parsed ? 'parse_error' : base.rejectedGroups > 0 ? 'ref_rejected' : 'ok',
    })
  }
  return base
}
