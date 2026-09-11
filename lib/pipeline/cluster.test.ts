import { describe, it, expect } from 'vitest'
import { averageLinkageClusters, cosine } from './cluster'

// The chaining defect this linkage exists to prevent (2026-07-11): under
// single-linkage, one generic "bridge" insight sitting between two unrelated
// groups fused them into a grab-bag (the 119-video Sealand run-1 blob).
// Average linkage must keep the groups apart because their cluster-AVERAGE
// similarity stays below the threshold even when one cross-pair clears it.

/** Unit vector helpers on a plane — angles make similarity intuitive
 *  (cosine of two unit vectors = cos of the angle between them). */
const at = (deg: number): number[] => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)]

describe('averageLinkageClusters', () => {
  it('merges near-identical vectors into one cluster', () => {
    const clusters = averageLinkageClusters([at(0), at(2), at(4)], 0.9)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].sort()).toEqual([0, 1, 2])
  })

  it('keeps dissimilar vectors apart', () => {
    const clusters = averageLinkageClusters([at(0), at(90)], 0.5)
    expect(clusters).toHaveLength(2)
  })

  it('does NOT chain two tight groups through a bridge (the mega-blob case)', () => {
    // Group A at ~0°, group B at ~60°, bridge at 30° — the bridge clears the
    // 0.75 threshold against BOTH groups (cos 30° ≈ 0.87), but A↔B cross-pairs
    // sit at cos 60° = 0.5. Single-linkage would fuse all five into one blob;
    // average linkage lets the bridge join ONE side and must keep A and B apart.
    const vecs = [at(0), at(4), at(30), at(56), at(60)]
    const clusters = averageLinkageClusters(vecs, 0.75)
    const together = (a: number, b: number) => clusters.some((c) => c.includes(a) && c.includes(b))
    expect(together(0, 1)).toBe(true) // group A intact
    expect(together(3, 4)).toBe(true) // group B intact
    expect(together(0, 4)).toBe(false) // the blob must not form
  })

  it('handles singletons and empty input', () => {
    expect(averageLinkageClusters([], 0.5)).toEqual([])
    expect(averageLinkageClusters([at(0)], 0.5)).toEqual([[0]])
  })

  it('every input index appears in exactly one cluster', () => {
    const vecs = [at(0), at(10), at(45), at(90), at(120), at(180)]
    const clusters = averageLinkageClusters(vecs, 0.8)
    const all = clusters.flat().sort((a, b) => a - b)
    expect(all).toEqual([0, 1, 2, 3, 4, 5])
  })
})

describe('cosine', () => {
  it('is 1 for identical, 0 for orthogonal, 0 for zero vectors', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosine([0, 0], [1, 0])).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Oracle: the O(n³) implementation this file's exported clustering replaced on
// 2026-09-11, copied here VERBATIM (only the name changed). The nearest-
// neighbour-chain rewrite is a speed change, not a semantics change, so the two
// must agree on the set of clusters for every input with a TIE-FREE similarity
// matrix. Under exact ties they break them differently (chain: lowest index;
// oracle: `>=`, so the LAST max pair) and both answers are valid average
// linkages. Do not "fix" this copy to match the new one — if they diverge on
// tie-free input, the new one is wrong.
// ---------------------------------------------------------------------------
function referenceAverageLinkage(vecs: number[][], threshold: number): number[][] {
  const active: number[][] = vecs.map((_, i) => [i]) // member indices per cluster
  // sim[a][b] = average cross-pair similarity between clusters a and b.
  const sim: number[][] = vecs.map((vi) => vecs.map((vj) => cosine(vi, vj)))

  for (;;) {
    let bestA = -1
    let bestB = -1
    let bestSim = threshold
    for (let a = 0; a < active.length; a++) {
      for (let b = a + 1; b < active.length; b++) {
        if (sim[a][b] >= bestSim) {
          bestA = a
          bestB = b
          bestSim = sim[a][b]
        }
      }
    }
    if (bestA < 0) return active

    // Merge B into A; update average similarity by size-weighted mean.
    const sizeA = active[bestA].length
    const sizeB = active[bestB].length
    for (let c = 0; c < active.length; c++) {
      if (c === bestA || c === bestB) continue
      sim[bestA][c] = sim[c][bestA] = (sizeA * sim[bestA][c] + sizeB * sim[bestB][c]) / (sizeA + sizeB)
    }
    active[bestA] = active[bestA].concat(active[bestB])
    active.splice(bestB, 1)
    sim.splice(bestB, 1)
    for (const row of sim) row.splice(bestB, 1)
  }
}

/** Deterministic PRNG (mulberry32) — the property test must be reproducible;
 *  a flaky clustering test is worse than none. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A bucket-shaped corpus: a few concept centroids with jittered members plus
 *  loose noise, so instances actually merge at every tested threshold instead
 *  of degenerating to "all singletons" (pure uniform noise at dim 16 almost
 *  never clears 0.58). Random floats make exact ties negligible. */
function randomVecs(n: number, dim: number, seed: number): number[][] {
  const r = rng(seed)
  const centroids = Array.from({ length: Math.max(2, Math.ceil(n / 8)) }, () =>
    Array.from({ length: dim }, () => r() * 2 - 1),
  )
  return Array.from({ length: n }, (_, i) => {
    if (i % 5 === 0) return Array.from({ length: dim }, () => r() * 2 - 1) // noise
    const c = centroids[Math.floor(r() * centroids.length)]
    const spread = 0.3 + r() * 1.2 // some members tight, some loose
    return c.map((x) => x + (r() * 2 - 1) * spread)
  })
}

const asSets = (groups: number[][]): string[] =>
  groups.map((g) => [...g].sort((a, b) => a - b).join(',')).sort()

describe('averageLinkageClusters vs the O(n³) oracle', () => {
  const sizes = [5, 40, 150]
  const thresholds = [0.3, 0.58, 0.8]
  for (let i = 0; i < 30; i++) {
    const n = sizes[i % sizes.length]
    const threshold = thresholds[Math.floor(i / 3) % thresholds.length]
    const seed = 1000 + i
    it(`matches the reference: n=${n} threshold=${threshold} seed=${seed}`, () => {
      const vecs = randomVecs(n, 16, seed)
      const mine = averageLinkageClusters(vecs, threshold)
      const ref = referenceAverageLinkage(vecs, threshold)
      expect(asSets(mine)).toEqual(asSets(ref))
      // Every index placed exactly once, and the group order is by smallest
      // member (the documented, deterministic convention).
      expect(mine.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, k) => k))
      const firsts = mine.map((g) => Math.min(...g))
      expect(firsts).toEqual([...firsts].sort((a, b) => a - b))
    })
  }

  it('finishes n=1500 (dim 32) well inside a pipeline step budget', () => {
    const vecs = randomVecs(1500, 32, 7)
    const t0 = performance.now()
    const groups = averageLinkageClusters(vecs, 0.58)
    const ms = performance.now() - t0
    console.log(`[cluster] n=1500 dim=32 threshold=0.58 -> ${groups.length} clusters in ${ms.toFixed(0)}ms`)
    expect(groups.flat()).toHaveLength(1500)
    expect(ms).toBeLessThan(2000)
  }, 30_000)
})
