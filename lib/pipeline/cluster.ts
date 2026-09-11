import { openai } from '../openai'
import { chunk } from '../chunk'
import { EMBEDDING_MODEL, CLUSTER_SIMILARITY_THRESHOLD } from '../config'
import type { InsightRow } from './types'

// Step A2 clustering seam (Architecture/Analysis-Passes §Step A2). The pipeline
// only calls `clusterInsights`; the implementation behind it can swap without
// touching Step A2. v4.1 specced case-insensitive string match on the theme
// slug; the first real Ossur run showed near-zero exact collisions (free-text
// labels rarely match), so the pre-approved embedding-similarity merge is the
// default. `'string'` is retained for A/B and as a no-cost fallback.
//
// Input to clusterInsights is assumed homogeneous — one entity BUCKET, which
// is what the caller in step-a2.ts groups by. Categories deliberately merge
// inside a bucket (Redesign Spec §8 fix (a), 2026-07-03: a cost pain_point and
// a cost question are one concern), and the theme's category is the mode of
// its members'. (This comment said "one bucket + one category" until
// 2026-09-06; it had been wrong since that spec fix.)

export type ClusterMethod = 'embedding' | 'string'

export interface ClusterOptions {
  method?: ClusterMethod
  /** Cosine threshold for the embedding method. */
  threshold?: number
}

/** Inputs per embeddings request. The endpoint caps `input` at 2048 array
 *  items AND the request at 300k tokens, so the array cap alone is not a safe
 *  batch size — 2048 long descriptions would clear the item cap and fail on
 *  tokens instead. 512 × ~60 tokens (measured on Össur) ≈ 31k tokens, with
 *  headroom for descriptions ten times that long.
 *
 *  Batching lives HERE, below every caller, because the callers cannot know
 *  their own size: Step A2 hands over a whole entity bucket and the insight
 *  corpus is cumulative (incremental Pass A keeps every video's insights
 *  current), so a bucket grows every week. Össur's `industry-other` reached
 *  2283 on 2026-09-06 and the Sunday run died at 07:34 on
 *  `400 Invalid 'input': array length must be 2048 or less` — 93 minutes and
 *  $1.21 of gather and Pass A already spent, no email to the client. The same
 *  shape as the 2026-08-30 killer (`.in()` over the whole corpus), one seam
 *  over: any call whose size tracks the corpus needs a chunk loop. */
const EMBED_BATCH = 512

/** Embed texts, preserving input order. Returns [] for empty input.
 *  Chunked (EMBED_BATCH) and sequential: a bucket is a handful of requests,
 *  and the pipeline shares a 5-slot concurrency with everything else. A failed
 *  chunk throws — the Inngest step retries the whole step. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const out: number[][] = []
  for (const part of chunk(texts, EMBED_BATCH)) {
    const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: part })
    if (res.data.length !== part.length) {
      throw new Error(`embedTexts: ${EMBEDDING_MODEL} returned ${res.data.length} vectors for ${part.length} inputs`)
    }
    // The API returns items with an `index`; sort to be order-safe. The index
    // is per-REQUEST, so sort within the chunk and append — never across.
    for (const d of [...res.data].sort((a, b) => a.index - b.index)) out.push(d.embedding)
  }
  return out
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** Text fed to the embedder for one insight: the slug as words + its
 *  description, which carries far more semantic signal than the 2–4 word slug
 *  alone.
 *
 *  Exported because the Verbatim Agent's insight embeddings
 *  (scripts/embed-insights.ts) MUST be produced by this exact formula. Two
 *  copies of it would drift, and vectors built from different text are not
 *  comparable — a silent, invisible retrieval failure. */
export function embedInput(ins: Pick<InsightRow, 'theme' | 'description'>): string {
  return `${ins.theme.replace(/_/g, ' ')}. ${ins.description}`
}

/** Average-linkage agglomerative clustering: two clusters merge only while the
 *  AVERAGE similarity across all their cross-pairs clears the threshold.
 *
 *  Replaces the original union-find single-linkage (2026-07-11): single-linkage
 *  merges transitively on any ONE qualifying pair, and in a large bucket the
 *  generic bridge insights ("love this bag", "so beautiful") chain unrelated
 *  themes into one grab-bag — the Sealand run-1 corpus produced a 119-video
 *  "theme" that led the dashboard and inflated grounding counts. Average
 *  linkage is the standard chaining fix: one bridge pair can no longer fuse
 *  two unrelated groups. Cluster-cluster similarities update exactly via the
 *  size-weighted mean, so no pair is ever recomputed.
 *
 *  Nearest-neighbour chain (2026-09-11), replacing the O(n³) "scan every pair
 *  for the global best, merge, repeat" loop: grow a chain of nearest active
 *  neighbours until the last two are each other's nearest, then merge that pair
 *  — for a REDUCIBLE linkage (a merged cluster is never more similar to a third
 *  than the more similar of its two halves was, which the size-weighted mean
 *  guarantees) that pair is one the global-max loop would also have merged, so
 *  the clusters are identical, in O(n²) instead of O(n³).
 *  A reciprocal pair BELOW the threshold retires both: each one's best possible
 *  similarity is already under the line, and every later similarity involving
 *  it is a weighted mean of values ≤ that, so neither can ever clear it again.
 *
 *  "Identical to the old loop" holds for a TIE-FREE similarity matrix. Under
 *  exact ties the two break them differently (this one takes the lowest index,
 *  the old loop's `>=` took the last max pair), and both are valid average
 *  linkages — a constructed binary-vector case does diverge. The realistic tie
 *  source is duplicate insight text embedding identically, and 1200 seeded
 *  cases at dim 16 with 15% exact duplicates produced no divergence.
 */
export function averageLinkageClusters(vecs: number[][], threshold: number): number[][] {
  const n = vecs.length
  if (n === 0) return []

  // sim[a * n + b] = average cross-pair similarity between clusters a and b.
  // Flat and Float64 so a 2283-insight bucket is one 42MB buffer, not 2283
  // heap arrays. Only indices flagged active are meaningful.
  const sim = new Float64Array(n * n)
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const s = cosine(vecs[a], vecs[b])
      sim[a * n + b] = s
      sim[b * n + a] = s
    }
  }

  const members: number[][] = vecs.map((_, i) => [i])
  const size = new Int32Array(n).fill(1)
  const active = new Uint8Array(n).fill(1)
  const done: number[][] = []
  const chain: number[] = []
  let remaining = n

  while (remaining > 0) {
    if (chain.length === 0) {
      let start = 0
      while (!active[start]) start++
      chain.push(start)
    }
    const a = chain[chain.length - 1]

    // Nearest active neighbour of the chain's head. Ties go to the lowest
    // index — a fixed rule, so the chain cannot cycle between equal pairs.
    let best = -1
    let bestSim = -Infinity
    const rowA = a * n
    for (let b = 0; b < n; b++) {
      if (b === a || !active[b]) continue
      const s = sim[rowA + b]
      if (s > bestSim) {
        bestSim = s
        best = b
      }
    }
    if (best < 0) {
      // Last cluster standing.
      active[a] = 0
      remaining--
      done.push(members[a])
      chain.pop()
      continue
    }
    if (chain.length < 2 || chain[chain.length - 2] !== best) {
      chain.push(best)
      continue
    }

    // a and best are reciprocal nearest neighbours: merge or retire the pair.
    chain.pop()
    chain.pop()
    if (bestSim < threshold) {
      active[a] = 0
      active[best] = 0
      remaining -= 2
      done.push(members[a], members[best])
      continue
    }
    // Merge `best` into `a`; update average similarity by size-weighted mean.
    const sizeA = size[a]
    const sizeB = size[best]
    const rowB = best * n
    for (let c = 0; c < n; c++) {
      if (c === a || c === best || !active[c]) continue
      const s = (sizeA * sim[rowA + c] + sizeB * sim[rowB + c]) / (sizeA + sizeB)
      sim[rowA + c] = s
      sim[c * n + a] = s
    }
    members[a] = members[a].concat(members[best])
    size[a] = sizeA + sizeB
    active[best] = 0
    remaining--
  }

  // Deterministic output: members ascending, groups by smallest member. The
  // GROUP order is what the old loop also produced; the member order is not —
  // it emitted merge history ([0,5] merged with [2,3] came out [0,5,2,3]).
  // Member order is read downstream: step-a2's `aggregate` builds
  // `supportingInsightIds` and `memberThemes` in it (the first names the
  // theme's working slug, and Voice draws its ribbon quotes off the first few
  // insight ids), so those move once, on the next run, and are stable after.
  // The one place it could have moved a client-facing WORD — Pass B's label
  // prompt, which shows the top two descriptions by strength — no longer
  // depends on it: `aggregate` breaks that tie on insight id.
  for (const g of done) g.sort((x, y) => x - y)
  return done.sort((x, y) => x[0] - y[0])
}

/** Pairwise similarity matrix for a homogeneous group (debug/threshold tuning). */
export async function similarityMatrix(insights: InsightRow[]): Promise<number[][]> {
  const vecs = await embedTexts(insights.map(embedInput))
  return vecs.map((vi) => vecs.map((vj) => cosine(vi, vj)))
}

/**
 * Cluster a homogeneous list of insights (same bucket + category) into groups.
 * Returns arrays of the original InsightRows. A singleton stays its own group.
 */
export async function clusterInsights(
  insights: InsightRow[],
  opts: ClusterOptions = {},
): Promise<InsightRow[][]> {
  const method = opts.method ?? 'embedding'
  if (insights.length <= 1) return insights.map((i) => [i])

  if (method === 'string') {
    const byTheme = new Map<string, InsightRow[]>()
    for (const ins of insights) {
      const key = ins.theme.toLowerCase().trim()
      const g = byTheme.get(key)
      if (g) g.push(ins)
      else byTheme.set(key, [ins])
    }
    return [...byTheme.values()]
  }

  // embedding
  const threshold = opts.threshold ?? CLUSTER_SIMILARITY_THRESHOLD
  const vecs = await embedTexts(insights.map(embedInput))
  const groups = averageLinkageClusters(vecs, threshold)
  return groups.map((idxs) => idxs.map((i) => insights[i]))
}
