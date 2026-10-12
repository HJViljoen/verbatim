import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'
import { createAdminClient } from '../supabase-admin'
import { openai, samplingParams } from '../openai'
import { SYNTHESIS_MODEL, MERGE_CHUNK_MAX, estimateCost } from '../config'
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
//
// A BIG BUCKET IS MERGED IN PARTS (12 Oct). The one call's latency grows with
// the bucket's cluster count, and `industry-other` outgrew the step's budget on
// both tenants (lib/config.ts MERGE_CHUNK_MAX has the measurements). Over
// MERGE_CHUNK_MAX clusters, the bucket is split into parts of semantically
// close clusters (`partitionByCentroid`) and each part is one call, all in
// parallel under the step's one deadline. Close, because the duplicates this
// pass exists to find are close in embedding space by construction: the
// clustering kept them apart at its threshold, but only just. A cluster can
// still only fuse with clusters in its own part; that is deliberately NOT in
// the clustering key (lib/pipeline/clustering.ts, at `mp`, says why). A bucket
// at or under the size makes today's one call with today's prompt, byte for
// byte.

/** The prompt that decides which clusters fuse. Part of a run's clustering
 *  regime (lib/pipeline/clustering.ts `mp=`), not just of its audit log: a
 *  reworded merge prompt re-partitions the corpus exactly as a moved threshold
 *  does. Exported as a plain string so open-run can stamp it without the
 *  clustering module importing this one. */
export const PROMPT_VERSION = 'theme_merge_v1'

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
  /** One unit centroid per cluster, in `clusters` order
   *  (cluster.ts `clusterInsightsWithCentroids`). Read only when the bucket is
   *  over MERGE_CHUNK_MAX, to split it into parts of close clusters. Absent
   *  (the 'string' method embeds nothing), a big bucket is split in its
   *  original cluster order instead: still inside the time, but a duplicate
   *  pair may then land in two parts and stay apart. */
  centroids?: readonly ArrayLike<number>[]
  /** Model override for offline A/B (default SYNTHESIS_MODEL). */
  model?: string
  /** Write the call to ai_call_log — the pipeline path. Scripts leave it off. */
  logCall?: boolean
  /** ai_call_log call_index — one merge call per bucket, numbered by the
   *  caller (the bucket's 1-based place in the run's bucket list). A bucket
   *  merged in parts logs one row a part at `callIndex * 1000 + part` (part
   *  1-based), so bucket 3's parts are 3001, 3002, … and can collide neither
   *  with another bucket's parts nor with a one-call bucket's index (a run has
   *  tens of buckets and a bucket tens of parts at most, 22 for Sealand's
   *  1,879 clusters, never a thousand).
   *  Nothing keys on the column (no constraint; run-costs and the Costs page
   *  sum cost by pass); the spacing is for a person reading the ledger. */
  callIndex?: number
  /** The pipeline's deadline for the call (epoch ms; the step's start plus
   *  THEME_MERGE_STEP_BUDGET_MS). One abort signal covers the call and its one
   *  SDK retry, so a brief 429 or 5xx is retried inside the step and the total
   *  never runs past the deadline. A bucket merged in parts gives every part's
   *  call its own such signal off this same deadline, so the parts run in
   *  parallel and all of them end by it. Scripts leave it unset and keep the
   *  SDK's defaults. */
  deadline?: number
  /** A failed or timed-out call applies no merges and returns, instead of
   *  throwing. The pipeline sets it on the step's LAST attempt only. In parts,
   *  a failed part keeps its own clusters unmerged and the parts that answered
   *  apply theirs. */
  failSoft?: boolean
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
  /** Merge calls the bucket took: 1 at or under MERGE_CHUNK_MAX, its number of
   *  parts over it, 0 when there was nothing to merge (under two clusters). */
  chunks: number
  /** Calls that failed under failSoft; their clusters stayed unmerged. */
  failedChunks: number
  /** Every call failed and failSoft kept the WHOLE bucket unmerged. A bucket
   *  only some of whose parts failed is not skipped (`failedChunks` says how
   *  much of it stayed apart). */
  skipped?: boolean
}

export interface ProposedMerge {
  cluster_numbers: number[]
  reason: string
}

/**
 * Validate + apply the model's proposed merge groups — the pure core of the
 * pass, split out so the invariants are unit-testable without an API call.
 * Rules: 1-based numbers must be in range; deduped; a cluster may join at most
 * one group (first group wins); a cleaned group must have 2..MAX_MERGE_GROUP
 * members or it is rejected whole. A merged cluster takes its first member's
 * position; later members drop out of the list.
 */
export function applyMergeGroups(
  clusters: InsightRow[][],
  proposed: ProposedMerge[],
): Pick<ThemeMergeResult, 'clusters' | 'applied' | 'rejectedGroups'> {
  const used = new Set<number>()
  const validGroups: { idxs: number[]; reason: string }[] = []
  let rejectedGroups = 0
  for (const m of proposed) {
    const idxs = [...new Set(m.cluster_numbers)]
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= clusters.length)
      .map((n) => n - 1)
      .filter((i) => !used.has(i))
    if (idxs.length < 2 || idxs.length > MAX_MERGE_GROUP) {
      rejectedGroups++
      continue
    }
    for (const i of idxs) used.add(i)
    validGroups.push({ idxs, reason: m.reason })
  }

  if (!validGroups.length) return { clusters, applied: [], rejectedGroups }

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
  return {
    clusters: out,
    applied: validGroups.map((g) => ({
      members: g.idxs.map((i) => clusters[i].reduce((a, b) => (b.strength_score > a.strength_score ? b : a)).theme),
      reason: g.reason,
    })),
    rejectedGroups,
  }
}

/** Lloyd iterations per bisection. Spherical 2-means settles in a handful on
 *  embedding centroids; the cap only bounds a pathological input. */
const BISECT_ITERATIONS = 10

/** Two unit vectors closer than this (cosine) are one point to the bisection. */
const SAME_POINT = 1 - 1e-6

function dotOf(u: ArrayLike<number>, v: ArrayLike<number>): number {
  let s = 0
  for (let d = 0; d < u.length; d++) s += u[d] * v[d]
  return s
}

/** The L2-normalised mean of `vecs[idxs]` (zero stays zero). */
function unitMeanOf(vecs: readonly ArrayLike<number>[], idxs: readonly number[]): Float64Array {
  const dim = vecs[idxs[0]].length
  const sum = new Float64Array(dim)
  for (const i of idxs) {
    const v = vecs[i]
    for (let d = 0; d < dim; d++) sum[d] += v[d]
  }
  let norm = 0
  for (let d = 0; d < dim; d++) norm += sum[d] * sum[d]
  norm = Math.sqrt(norm)
  if (norm > 0) for (let d = 0; d < dim; d++) sum[d] /= norm
  return sum
}

/** The point of `idxs` least similar to `to`; ties go to the earliest. */
function farthestFrom(vecs: readonly ArrayLike<number>[], idxs: readonly number[], to: ArrayLike<number>): number {
  let best = idxs[0]
  let bestSim = Infinity
  for (const i of idxs) {
    const s = dotOf(vecs[i], to)
    if (s < bestSim) {
      bestSim = s
      best = i
    }
  }
  return best
}

function halves(idxs: readonly number[]): [number[], number[]] {
  const mid = Math.ceil(idxs.length / 2)
  return [idxs.slice(0, mid), idxs.slice(mid)]
}

/**
 * Split `idxs` (two or more) in two by spherical 2-means on cosine. Seeded
 * without randomness: the point farthest from the set's mean, then the point
 * farthest from that one — the two ends of the set's widest spread. Both sides
 * always come back non-empty. A set with no spread (every point the same
 * direction, or zero) has nothing to split by, so it splits by position.
 */
function bisect(vecs: readonly ArrayLike<number>[], idxs: readonly number[]): [number[], number[]] {
  const a = farthestFrom(vecs, idxs, unitMeanOf(vecs, idxs))
  const b = farthestFrom(vecs, idxs, vecs[a])
  if (a === b || dotOf(vecs[a], vecs[b]) >= SAME_POINT) return halves(idxs)
  let ca: ArrayLike<number> = vecs[a]
  let cb: ArrayLike<number> = vecs[b]
  const side = new Uint8Array(idxs.length) // 0 → a's side, 1 → b's
  for (let it = 0; it < BISECT_ITERATIONS; it++) {
    let moved = it === 0
    for (let k = 0; k < idxs.length; k++) {
      const v = vecs[idxs[k]]
      const s = dotOf(v, cb) > dotOf(v, ca) ? 1 : 0 // a tie stays on a's side
      if (s !== side[k]) moved = true
      side[k] = s
    }
    if (!moved) break
    const left = idxs.filter((_, k) => side[k] === 0)
    const right = idxs.filter((_, k) => side[k] === 1)
    if (!left.length || !right.length) return halves(idxs)
    ca = unitMeanOf(vecs, left)
    cb = unitMeanOf(vecs, right)
  }
  const left = idxs.filter((_, k) => side[k] === 0)
  const right = idxs.filter((_, k) => side[k] === 1)
  return left.length && right.length ? [left, right] : halves(idxs)
}

/**
 * Split a bucket's clusters into parts of at most `max`, keeping close
 * clusters together. Pure and deterministic; returns every index of
 * `centroids` exactly once, each part ascending (so a part's prompt lists its
 * clusters in the bucket's own order).
 *
 * Recursive bisection (`bisect`) of any set over `max`, so the cut between two
 * parts runs where the set is widest apart. Then the leaves are packed: a run
 * of consecutive leaves (siblings, or near it, in the bisection) whose sizes
 * sum to `max` or less goes into one part. Packing only ever joins whole
 * leaves, so it never separates two clusters the bisection kept together, and
 * a call that reads more clusters can find more duplicates, never fewer; what
 * it saves is a call per small leaf that a lopsided split (an outlier peeled
 * off) would otherwise cost.
 */
export function partitionByCentroid(centroids: readonly ArrayLike<number>[], max: number): number[][] {
  if (!Number.isInteger(max) || max < 1) throw new Error(`partitionByCentroid: max must be a positive integer, got ${max}`)
  const leaves: number[][] = []
  const split = (idxs: number[]): void => {
    if (idxs.length <= max) {
      if (idxs.length) leaves.push(idxs)
      return
    }
    const [left, right] = bisect(centroids, idxs)
    split(left)
    split(right)
  }
  split(Array.from({ length: centroids.length }, (_, i) => i))
  const parts: number[][] = []
  for (const leaf of leaves) {
    const last = parts[parts.length - 1]
    if (last && last.length + leaf.length <= max) last.push(...leaf)
    else parts.push([...leaf])
  }
  return parts.map((p) => p.sort((x, y) => x - y))
}

/** The 'string' method's split, which has no vectors to split by: the
 *  clusters in their own order, cut into the fewest parts of at most `max`,
 *  sized evenly (1,884 at 120 is sixteen parts of 117-118, not fifteen of 120
 *  and one of 84). */
export function partitionByOrder(n: number, max: number): number[][] {
  if (!Number.isInteger(max) || max < 1) throw new Error(`partitionByOrder: max must be a positive integer, got ${max}`)
  const count = Math.ceil(n / max)
  const parts: number[][] = []
  for (let p = 0; p < count; p++) {
    const start = Math.floor((p * n) / count)
    const end = Math.floor(((p + 1) * n) / count)
    parts.push(Array.from({ length: end - start }, (_, i) => start + i))
  }
  return parts
}

/** A part's proposed groups, renumbered from the part's own 1..k to the
 *  bucket's 1..n. A number outside the part becomes 0, which applyMergeGroups
 *  drops as out of range — so a part's answer is held to exactly the rules a
 *  whole-bucket answer is. */
export function toBucketNumbers(proposed: readonly ProposedMerge[], part: readonly number[]): ProposedMerge[] {
  return proposed.map((m) => ({
    reason: m.reason,
    cluster_numbers: m.cluster_numbers.map((n) => (Number.isInteger(n) && n >= 1 && n <= part.length ? part[n - 1] + 1 : 0)),
  }))
}

/** What one part's call came back with: its proposed groups in the part's own
 *  numbering (none, for an unparseable answer — honest fragmentation, as
 *  ever), or the error it failed on. */
export type PartAnswer = { merges: ProposedMerge[] } | { error: string }

/**
 * Apply a bucket's part answers — pure, so the failure semantics are tested
 * without an API call. Off the step's last attempt (`failSoft` false), any
 * failed part throws, so the step retries, as one failed call always has. On
 * it, the parts that answered apply their merges, the failed parts' clusters
 * stay as they are, and `skipped` is set only when nothing answered. Groups
 * are mapped to the bucket's numbering and applied through applyMergeGroups
 * in one pass, part order then the model's own order, so range, dedupe, one
 * group per cluster and MAX_MERGE_GROUP hold over the whole bucket.
 */
export function settleParts(
  bucket: string,
  clusters: InsightRow[][],
  parts: readonly (readonly number[])[],
  answers: readonly PartAnswer[],
  failSoft: boolean,
): Pick<ThemeMergeResult, 'clusters' | 'applied' | 'rejectedGroups' | 'chunks' | 'failedChunks' | 'skipped'> {
  const failed = answers.flatMap((a, p) => ('error' in a ? [{ part: p + 1, error: a.error }] : []))
  if (failed.length && !failSoft) {
    const where = parts.length > 1 ? `${failed.length} of ${parts.length} parts (first, part ${failed[0].part}): ` : ''
    throw new Error(`theme merge (${bucket}) failed: ${where}${failed[0].error}`)
  }
  const proposed = answers.flatMap((a, p) => ('merges' in a ? toBucketNumbers(a.merges, parts[p]) : []))
  const outcome = applyMergeGroups(clusters, proposed)
  return {
    ...outcome,
    chunks: parts.length,
    failedChunks: failed.length,
    ...(failed.length > 0 && failed.length === parts.length ? { skipped: true } : {}),
  }
}

interface PartCall {
  answer: PartAnswer
  usage: { prompt_tokens: number; completion_tokens: number }
  durationMs: number
}

/** One merge call over `partClusters`, logged, never throwing: a failure
 *  comes back as the part's answer for settleParts to judge. `label` is null
 *  for a bucket that fits in one call, whose prompt and log row stay exactly
 *  what they were before parts existed. */
async function askPart(
  opts: ThemeMergeOptions,
  model: string,
  systemPrompt: string,
  partClusters: InsightRow[][],
  label: { part: number; parts: number } | null,
  callIndex: number,
): Promise<PartCall> {
  const { clientId, runId, bucket } = opts
  const header = label
    ? `BUCKET: ${bucket} (part ${label.part} of ${label.parts}) — ${partClusters.length} theme clusters`
    : `BUCKET: ${bucket} — ${partClusters.length} theme clusters`
  const userPrompt = [header, ...partClusters.map((c, i) => clusterLine(i + 1, c))].join('\n')
  const partFields = label ? { part: label.part, parts: label.parts } : {}

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
    }, opts.deadline ? { signal: AbortSignal.timeout(Math.max(1_000, opts.deadline - Date.now())), maxRetries: 1 } : undefined)
    parsed = completion.choices[0]?.message?.parsed ?? null
    if (completion.usage) {
      usage = { prompt_tokens: completion.usage.prompt_tokens, completion_tokens: completion.usage.completion_tokens }
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    const durationMs = Date.now() - startedAt
    if (opts.logCall) {
      await logAiCall(createAdminClient(), { clientId, runId, pass: 'theme_merge', callIndex, model, promptVersion: PROMPT_VERSION, systemPrompt, userPrompt, response: label ? { bucket, ...partFields } : null, error, usage, durationMs, validationStatus: 'parse_error' })
    }
    if (label) console.error(`[theme-merge] ${bucket} part ${label.part} of ${label.parts}: ${partClusters.length} clusters, failed after ${(durationMs / 1000).toFixed(1)} s: ${error}`)
    return { answer: { error }, usage, durationMs }
  }
  const durationMs = Date.now() - startedAt
  const merges = parsed?.merges ?? []
  // The part's own outcome, for its log row; the bucket's is applied once,
  // over every part, in settleParts.
  const own = applyMergeGroups(partClusters, merges)
  if (opts.logCall) {
    await logAiCall(createAdminClient(), {
      clientId, runId, pass: 'theme_merge', callIndex, model, promptVersion: PROMPT_VERSION, systemPrompt, userPrompt,
      response: { bucket, ...partFields, clusters_before: partClusters.length, clusters_after: own.clusters.length, merges: own.applied.length, rejected_groups: own.rejectedGroups },
      error: parsed ? null : 'no parsed output', usage, durationMs,
      validationStatus: !parsed ? 'parse_error' : own.rejectedGroups > 0 ? 'ref_rejected' : 'ok',
    })
  }
  if (label) console.log(`[theme-merge] ${bucket} part ${label.part} of ${label.parts}: ${partClusters.length} clusters, ${own.applied.length} merges, ${own.rejectedGroups} rejected, ${(durationMs / 1000).toFixed(1)} s`)
  return { answer: { merges }, usage, durationMs }
}

/**
 * Merge same-concern clusters within one bucket. An API failure throws (the
 * Inngest step retries), except under failSoft, where the failed call's
 * clusters stay unmerged and the result says so; an unparseable response
 * applies no merges — honest fragmentation over silent guessing — and logs as
 * parse_error. Over MERGE_CHUNK_MAX clusters the bucket is merged in parallel
 * parts (the header above); at or under it, in one call, as always.
 */
export async function mergeClusterLabels(opts: ThemeMergeOptions): Promise<ThemeMergeResult> {
  const { bucket, clusters } = opts
  const model = opts.model ?? SYNTHESIS_MODEL
  const base: ThemeMergeResult = {
    clusters, applied: [], rejectedGroups: 0,
    promptTokens: 0, completionTokens: 0, costUsd: 0,
    chunks: 0, failedChunks: 0,
  }
  if (clusters.length < 2) return base

  const callIndex = opts.callIndex ?? 1
  const inParts = clusters.length > MERGE_CHUNK_MAX
  const byMeaning = opts.centroids?.length === clusters.length
  const parts = !inParts
    ? [clusters.map((_, i) => i)]
    : byMeaning
      ? partitionByCentroid(opts.centroids!, MERGE_CHUNK_MAX)
      : partitionByOrder(clusters.length, MERGE_CHUNK_MAX)
  if (inParts) {
    console.log(`[theme-merge] ${bucket}: ${clusters.length} clusters, over ${MERGE_CHUNK_MAX}, so ${parts.length} parts ${byMeaning ? 'by meaning' : 'in order'} (${parts.map((p) => p.length).join(' · ')})`)
  }

  const systemPrompt = buildSystemPrompt()
  const calls = await Promise.all(parts.map((part, p) => askPart(
    opts, model, systemPrompt, part.map((i) => clusters[i]),
    inParts ? { part: p + 1, parts: parts.length } : null,
    inParts ? callIndex * 1000 + p + 1 : callIndex,
  )))
  for (const c of calls) {
    base.promptTokens += c.usage.prompt_tokens
    base.completionTokens += c.usage.completion_tokens
    base.costUsd += estimateCost(model, c.usage.prompt_tokens, c.usage.completion_tokens)
  }

  const settled = settleParts(bucket, clusters, parts, calls.map((c) => c.answer), Boolean(opts.failSoft))
  if (settled.skipped) {
    const first = calls.find((c) => 'error' in c.answer)?.answer
    const error = first && 'error' in first ? first.error : 'failed'
    console.error(inParts
      ? `[theme-merge] ${bucket}: all ${parts.length} parts failed (first: ${error}); last attempt, so the bucket keeps its ${clusters.length} clusters unmerged`
      : `[theme-merge] ${bucket}: ${error}; last attempt, so the bucket keeps its ${clusters.length} clusters unmerged`)
  } else if (settled.failedChunks) {
    console.error(`[theme-merge] ${bucket}: ${settled.failedChunks} of ${parts.length} parts failed; last attempt, so their clusters stay unmerged and the other parts' merges apply`)
  }
  return { ...base, ...settled }
}
