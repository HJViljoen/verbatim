import { openai } from '../openai'
import { EMBEDDING_MODEL, CLUSTER_SIMILARITY_THRESHOLD } from '../config'
import type { InsightRow } from './types'

// Step A2 clustering seam (Architecture/Analysis-Passes §Step A2). The pipeline
// only calls `clusterInsights`; the implementation behind it can swap without
// touching Step A2. v4.1 specced case-insensitive string match on the theme
// slug; the first real Ossur run showed near-zero exact collisions (free-text
// labels rarely match), so the pre-approved embedding-similarity merge is the
// default. `'string'` is retained for A/B and as a no-cost fallback.
//
// Input to clusterInsights is assumed homogeneous (one bucket + one category) —
// the caller in step-a2.ts guarantees that, so themes are only ever merged
// within a category.

export type ClusterMethod = 'embedding' | 'string'

export interface ClusterOptions {
  method?: ClusterMethod
  /** Cosine threshold for the embedding method. */
  threshold?: number
}

/** Embed texts, preserving input order. Returns [] for empty input. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: texts })
  // The API returns items with an `index`; sort to be order-safe.
  return [...res.data].sort((a, b) => a.index - b.index).map((d) => d.embedding)
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
 *  alone. */
function embedInput(ins: InsightRow): string {
  return `${ins.theme.replace(/_/g, ' ')}. ${ins.description}`
}

/** Transitive single-linkage clustering via union-find: any pair at or above
 *  the threshold lands in the same cluster. Deterministic; fine for the small
 *  per-(bucket,category) group sizes Step A2 sees. */
function unionFindClusters(n: number, linked: (i: number, j: number) => boolean): number[][] {
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b)
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (linked(i, j)) union(i, j)
    }
  }
  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    const g = groups.get(root)
    if (g) g.push(i)
    else groups.set(root, [i])
  }
  return [...groups.values()]
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
  const groups = unionFindClusters(insights.length, (i, j) => cosine(vecs[i], vecs[j]) >= threshold)
  return groups.map((idxs) => idxs.map((i) => insights[i]))
}
