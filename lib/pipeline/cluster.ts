import { openai } from '../openai'
import { chunk } from '../chunk'
import { EMBEDDING_MODEL, CLUSTER_SIMILARITY_THRESHOLD } from '../config'
import type { InsightRow } from './types'

// Step A2 clustering seam (Architecture/Analysis-Passes §Step A2). The pipeline
// only calls `clusterInsights` (or `clusterInsightsWithCentroids`: the same
// clusters plus each one's centroid); the implementation behind them can swap
// without touching Step A2. v4.1 specced case-insensitive string match on the
// theme slug; the first real Ossur run showed near-zero exact collisions
// (free-text labels rarely match), so the pre-approved embedding-similarity
// merge is the default. `'string'` is retained for A/B and as a no-cost
// fallback.
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
 *  over: any call whose size tracks the corpus needs a chunk loop.
 *
 *  Exported (2026-09-15) because lib/pipeline/embed-insights.ts chunks at this
 *  size ITSELF before calling embedTexts, so one call is one embeddings request
 *  and it can write one ai_call_log row per request. A second copy of the
 *  number over there would drift the moment either moved. */
export const EMBED_BATCH = 512

/** Embed texts, preserving input order. Returns [] for empty input.
 *  Chunked (EMBED_BATCH) and sequential: a bucket is a handful of requests,
 *  and the pipeline shares a 5-slot concurrency with everything else. A failed
 *  chunk throws — the Inngest step retries the whole step. */
export async function embedTexts(texts: string[], request?: { timeout?: number; maxRetries?: number }): Promise<number[][]> {
  if (texts.length === 0) return []
  const out: number[][] = []
  for (const part of chunk(texts, EMBED_BATCH)) {
    // `request`: the SDK's per-call options, where a caller holds the call to
    // time (the week read's step, lib/written/deadline.ts); absent, its defaults.
    const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: part }, request)
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

/** The identity of the formula above, stamped on every stored vector's
 *  ai_call_log row as its prompt_version.
 *
 *  An embeddings call has no prompt, but it does have the thing that decides
 *  whether two vectors can be compared at all: the text. Change the line above
 *  — or EMBEDDING_MODEL — and every vector already in audience_insights.embedding
 *  becomes incomparable with every vector written after, which is a silent
 *  retrieval failure, not an error. Bump this at the same time, so the ledger
 *  says which rows belong to which formula and the repair is a query rather
 *  than an archaeology. Nothing reads it yet; that is the point of writing it
 *  down now. */
export const EMBED_INPUT_VERSION = 'embed_input_v1'

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
 *
 *  The similarities (18 Nov): an upper triangle, filled several pairs a pass.
 *  The n×n matrix this replaced held every pair twice and recomputed both
 *  norms for every pair. At Sealand's 10,743-insight industry-other (run
 *  d8a15862) that was a 923 MB buffer and about 150 s of the step (193 s
 *  before the first merge call, less about 45 s of load and embeddings), so
 *  57 of its last two attempts' 76 merge calls were aborted at the deadline.
 *  On the same vectors on an M4 the fill took 68.1 s and now takes 11.7 s,
 *  in a 461 MB triangle (scripts/cluster-bench.ts). The output is the old
 *  code's bit for bit, not merely its clusters: every pair's value is the same
 *  IEEE arithmetic in the same order, and the loop the same decisions
 *  (cluster-oracle.ts holds the old code, cluster.test.ts holds the two
 *  together).
 */
export function averageLinkageClusters(vecs: number[][], threshold: number): number[][] {
  const n = vecs.length
  if (n === 0) return []
  return linkTriangle(similarityTriangle(vecs), n, threshold)
}

/** Columns of the triangle the fill holds in cache while every row above them
 *  passes over: 32 vectors of 1,536 doubles are 384 KB, inside the L2 of any
 *  server core, so each column is read from memory once a block, not once a
 *  row. Changes speed only, never a value. */
const FILL_BLOCK = 32

/** Where pair (a, b), a < b, sits in the upper triangle: `rowOffsets(n)[a] + b`.
 *  Row a holds b = a+1 … n-1, so the triangle is n(n-1)/2 long. An Int32
 *  holds every offset up to n = 65,535, whose triangle is 17 GB, past any
 *  instance's memory; past it the offsets would wrap, so it refuses. */
function rowOffsets(n: number): Int32Array {
  if (n > 65_535) throw new Error(`rowOffsets: ${n} vectors is past the triangle's index (65,535)`)
  const off = new Int32Array(n)
  for (let a = 0; a < n; a++) off[a] = a * n - (a * (a + 1)) / 2 - a - 1
  return off
}

/**
 * Every pair's `cosine`, as the upper triangle `linkTriangle` reads, and equal
 * to `cosine(vecs[a], vecs[b])` in every bit.
 *
 * Why it is the same number: `cosine` sums `a[i] * a[i]`, `b[i] * b[i]` and
 * `a[i] * b[i]` in three separate accumulators, each in index order, and
 * returns `dot / (sqrt(na) * sqrt(nb))`, or 0 where either sum is 0. Here each
 * vector's sum of squares is the first accumulator, computed once in the same
 * order; each dot product is the third, also in index order and starting from
 * 0; and the last line is the same expression. Nothing is normalised in
 * advance (a unit vector's dot product is a DIFFERENT rounding of the same
 * number, which can sit either side of the threshold).
 *
 * Why it is faster: one dot product is a chain of dependent adds, so the CPU
 * waits on each add before the next. The kernel runs eight such chains at
 * once, two rows by four columns, each still in index order, and reads each
 * row and column value once for four or two pairs; the column blocks keep the
 * columns in cache. Two by four needs eleven live registers, inside the
 * sixteen an x86-64 core has. It reads `vecs` where they are: a copy into one
 * flat buffer measured no faster and would hold the bucket's vectors twice.
 */
export function similarityTriangle(vecs: number[][]): Float64Array {
  const n = vecs.length
  const dim = n > 0 ? vecs[0].length : 0
  const sq = new Float64Array(n)
  const root = new Float64Array(n)
  for (let a = 0; a < n; a++) {
    const v = vecs[a]
    if (v.length !== dim) throw new Error(`similarityTriangle: vector ${a} has ${v.length} dimensions, vector 0 has ${dim}`)
    let s = 0
    for (let d = 0; d < dim; d++) s += v[d] * v[d]
    sq[a] = s
    root[a] = Math.sqrt(s)
  }
  const off = rowOffsets(n)
  const tri = new Float64Array((n * (n - 1)) / 2)

  const put = (a: number, b: number, dot: number) => {
    tri[off[a] + b] = sq[a] === 0 || sq[b] === 0 ? 0 : dot / (root[a] * root[b])
  }
  const one = (a: number, b: number) => {
    const x = vecs[a]
    const y = vecs[b]
    let dot = 0
    for (let d = 0; d < dim; d++) dot += x[d] * y[d]
    put(a, b, dot)
  }
  // Rows r and r+1 against columns j … j+3, all above both rows.
  const twoByFour = (r: number, j: number) => {
    const x = vecs[r]
    const y = vecs[r + 1]
    const c0 = vecs[j]
    const c1 = vecs[j + 1]
    const c2 = vecs[j + 2]
    const c3 = vecs[j + 3]
    let p0 = 0, p1 = 0, p2 = 0, p3 = 0, q0 = 0, q1 = 0, q2 = 0, q3 = 0
    for (let d = 0; d < dim; d++) {
      const xd = x[d]
      const yd = y[d]
      let w = c0[d]
      p0 += xd * w
      q0 += yd * w
      w = c1[d]
      p1 += xd * w
      q1 += yd * w
      w = c2[d]
      p2 += xd * w
      q2 += yd * w
      w = c3[d]
      p3 += xd * w
      q3 += yd * w
    }
    put(r, j, p0); put(r, j + 1, p1); put(r, j + 2, p2); put(r, j + 3, p3)
    put(r + 1, j, q0); put(r + 1, j + 1, q1); put(r + 1, j + 2, q2); put(r + 1, j + 3, q3)
  }

  // Each block of columns [lo, hi), against every row below its end: row r
  // takes columns max(lo, r+1) … hi-1, so every pair a < b is filled once.
  for (let lo = 0; lo < n; lo += FILL_BLOCK) {
    const hi = Math.min(n, lo + FILL_BLOCK)
    let r = 0
    for (; r + 2 < hi; r += 2) {
      if (r + 1 >= lo) one(r, r + 1) // the one column row r has and row r+1 does not
      let j = Math.max(lo, r + 2)
      for (; j + 3 < hi; j += 4) twoByFour(r, j)
      for (; j < hi; j++) {
        one(r, j)
        one(r + 1, j)
      }
    }
    for (; r < hi - 1; r++) for (let j = Math.max(lo, r + 1); j < hi; j++) one(r, j)
  }
  return tri
}

/**
 * The nearest-neighbour chain over a `similarityTriangle`, which it consumes
 * (merged clusters' similarities are written over it). The 11 Sep loop line
 * for line, with each `sim[a * n + b]` read from or written to the one place
 * the triangle keeps that pair: a neighbour is still sought in ascending
 * index order with the same strict `>`, and a merge still writes the same
 * size-weighted mean, once where the matrix wrote it twice.
 */
export function linkTriangle(tri: Float64Array, n: number, threshold: number): number[][] {
  if (n === 0) return []
  if (tri.length !== (n * (n - 1)) / 2) throw new Error(`linkTriangle: a triangle of ${tri.length} is not n=${n}'s`)
  const off = rowOffsets(n)

  const members: number[][] = Array.from({ length: n }, (_, i) => [i])
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
    // Below a, the pair is in row b's column a; above it, in row a.
    let best = -1
    let bestSim = -Infinity
    for (let b = 0; b < a; b++) {
      if (!active[b]) continue
      const s = tri[off[b] + a]
      if (s > bestSim) {
        bestSim = s
        best = b
      }
    }
    const rowA = off[a]
    for (let b = a + 1; b < n; b++) {
      if (!active[b]) continue
      const s = tri[rowA + b]
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
    for (let c = 0; c < n; c++) {
      if (c === a || c === best || !active[c]) continue
      const ac = c < a ? off[c] + a : off[a] + c
      const bc = c < best ? off[c] + best : off[best] + c
      tri[ac] = (sizeA * tri[ac] + sizeB * tri[bc]) / (sizeA + sizeB)
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
  return (await clusterInsightsWithCentroids(insights, opts)).clusters
}

export interface ClusteredInsights {
  clusters: InsightRow[][]
  /** One unit vector per cluster, in `clusters` order: the mean of its
   *  members' embeddings, L2-normalised. What the theme merge splits a big
   *  bucket by (theme-merge.ts `partitionByCentroid`). Absent for the 'string'
   *  method, which embeds nothing, and for a bucket of one insight. Float32,
   *  because a 1,884-cluster bucket is then 11.6 MB rather than 23 MB, and a
   *  partition needs no more precision than that. */
  centroids?: Float32Array[]
}

/**
 * `clusterInsights`, plus each cluster's centroid. The insight vectors it
 * embeds are dropped when it returns (only the per-cluster means survive), so
 * a caller that holds the result through a long merge call is not holding the
 * bucket's vectors too: this runs on a 2 GB instance.
 */
export async function clusterInsightsWithCentroids(
  insights: InsightRow[],
  opts: ClusterOptions = {},
): Promise<ClusteredInsights> {
  const method = opts.method ?? 'embedding'
  if (insights.length <= 1) return { clusters: insights.map((i) => [i]) }

  if (method === 'string') {
    const byTheme = new Map<string, InsightRow[]>()
    for (const ins of insights) {
      const key = ins.theme.toLowerCase().trim()
      const g = byTheme.get(key)
      if (g) g.push(ins)
      else byTheme.set(key, [ins])
    }
    return { clusters: [...byTheme.values()] }
  }

  // embedding
  const threshold = opts.threshold ?? CLUSTER_SIMILARITY_THRESHOLD
  const vecs = await embedTexts(insights.map(embedInput))
  const groups = averageLinkageClusters(vecs, threshold)
  return {
    clusters: groups.map((idxs) => idxs.map((i) => insights[i])),
    centroids: clusterCentroids(vecs, groups),
  }
}

/** One centroid per group: the L2-normalised mean of its members' vectors. */
export function clusterCentroids(vecs: number[][], groups: number[][]): Float32Array[] {
  return groups.map((idxs) => unitMean(vecs, idxs))
}

/** The L2-normalised mean of `vecs[idxs]`, summed in float64. A zero mean
 *  (only possible for vectors that cancel exactly) stays zero. */
function unitMean(vecs: number[][], idxs: number[]): Float32Array {
  const dim = vecs[idxs[0]].length
  const sum = new Float64Array(dim)
  for (const i of idxs) {
    const v = vecs[i]
    for (let d = 0; d < dim; d++) sum[d] += v[d]
  }
  let norm = 0
  for (let d = 0; d < dim; d++) norm += sum[d] * sum[d]
  norm = Math.sqrt(norm)
  const out = new Float32Array(dim)
  if (norm > 0) for (let d = 0; d < dim; d++) out[d] = sum[d] / norm
  return out
}
