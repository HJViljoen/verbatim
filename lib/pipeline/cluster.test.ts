import { describe, it, expect } from 'vitest'
import { averageLinkageClusters, clusterCentroids, clusterInsights, clusterInsightsWithCentroids, cosine, linkTriangle, similarityTriangle } from './cluster'
import { averageLinkageClustersV1, cosineV1, similarityMatrixV1 } from './cluster-oracle'
import type { InsightRow } from './types'

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

  // A COMPLEXITY GUARD, NOT A BENCHMARK. n=1500 clusters in a few hundred
  // milliseconds on an idle machine; the budget it has to stay inside is an
  // Inngest step's 300 s. The bound is there to catch the day someone turns
  // this back into an O(n³) merge, which costs minutes and not milliseconds —
  // so it is set far above the noise. It was 2,000 ms and failed at 2,024 ms
  // on a machine running several test suites at once: a gate that four agents'
  // load can move is a gate that says nothing about the change under it. The
  // measurement is logged either way, which is where a regression of 20% would
  // be read.
  const COMPLEXITY_GUARD_MS = 10_000
  it('finishes n=1500 (dim 32) well inside a pipeline step budget', () => {
    const vecs = randomVecs(1500, 32, 7)
    const t0 = performance.now()
    const groups = averageLinkageClusters(vecs, 0.58)
    const ms = performance.now() - t0
    console.log(`[cluster] n=1500 dim=32 threshold=0.58 -> ${groups.length} clusters in ${ms.toFixed(0)}ms`)
    expect(groups.flat()).toHaveLength(1500)
    expect(ms).toBeLessThan(COMPLEXITY_GUARD_MS)
  }, 30_000)
})

describe('clusterCentroids', () => {
  it('is each group\'s mean direction, at unit length, in group order', () => {
    const vecs = [at(0), at(90), [2, 0], [0, 0]]
    const [c0, c1, c2] = clusterCentroids(vecs, [[0, 1], [2], [3]])
    // at(0) + at(90) points at 45°.
    expect(c0[0]).toBeCloseTo(Math.SQRT1_2)
    expect(c0[1]).toBeCloseTo(Math.SQRT1_2)
    // A vector that is not unit comes back unit.
    expect([...c1]).toEqual([1, 0])
    // A zero mean stays zero rather than dividing by it.
    expect([...c2]).toEqual([0, 0])
  })
})

describe('clusterInsightsWithCentroids', () => {
  const row = (id: string, theme: string): InsightRow => ({
    id, theme, category: 'praise', description: theme, strength_score: 5,
    emotion: 'joyful', sentiment_impact: 'positive', source_video_id: `v-${id}`, platform: 'tiktok',
    is_client: false, is_competitor: false, competitor_name: null,
  })

  it('the string method embeds nothing, so it carries no centroids, and clusterInsights returns the same clusters', async () => {
    const rows = [row('1', 'Price'), row('2', 'fit'), row('3', 'price ')]
    const r = await clusterInsightsWithCentroids(rows, { method: 'string' })
    expect(r.centroids).toBeUndefined()
    expect(r.clusters.map((c) => c.map((i) => i.id))).toEqual([['1', '3'], ['2']])
    expect(await clusterInsights(rows, { method: 'string' })).toEqual(r.clusters)
  })
})

// ---------------------------------------------------------------------------
// The 18 Nov speed change (triangle, norms once, two rows by four columns a
// pass) against the code it replaced (cluster-oracle.ts, verbatim). The bar is
// the old code's exact output, assignments AND order, bit for bit in every
// similarity: Össur's month-on-month readings compare clusterings, and a
// change that moved one insight would move them. Unlike the O(n³) oracle
// above, the 11 Sep code breaks ties the same way, so ties must agree too.
// ---------------------------------------------------------------------------

/** Embedding-shaped: every value a float32 (what the SDK's base64 decode
 *  hands over), concept centroids with jittered members, so pairs land on
 *  both sides of the threshold. */
function float32Vecs(n: number, dim: number, seed: number): number[][] {
  return randomVecs(n, dim, seed).map((v) => v.map((x) => Math.fround(x)))
}

/** The next double above x (x finite and non-zero). */
function nextUp(x: number): number {
  const b = new DataView(new ArrayBuffer(8))
  b.setFloat64(0, x)
  b.setBigUint64(0, b.getBigUint64(0) + BigInt(x > 0 ? 1 : -1))
  return b.getFloat64(0)
}

/** Two float32 vectors close enough to sit near any threshold worth testing. */
function nearPair(dim: number, seed: number): [number[], number[]] {
  const r = rng(seed)
  const a = Array.from({ length: dim }, () => Math.fround(r() * 2 - 1))
  const b = a.map((x) => Math.fround(x + (r() * 2 - 1) * 0.9))
  return [a, b]
}

/** Unit vectors first, then a plain dot product: the fill this change did
 *  NOT adopt, here to show the tests would catch it. */
function unitDot(a: number[], b: number[]): number {
  const unit = (v: number[]) => {
    let s = 0
    for (const x of v) s += x * x
    const r = Math.sqrt(s)
    return v.map((x) => x / r)
  }
  const ua = unit(a)
  const ub = unit(b)
  let d = 0
  for (let i = 0; i < ua.length; i++) d += ua[i] * ub[i]
  return d
}

describe('similarityTriangle', () => {
  const pairOf = (tri: Float64Array, n: number, a: number, b: number) => tri[a * n - (a * (a + 1)) / 2 - a - 1 + b]

  // Sizes either side of the kernel's four columns, its two rows and its
  // 32-column blocks, so every remainder path fills something.
  for (const [n, dim] of [[2, 3], [3, 1536], [5, 7], [31, 64], [32, 1536], [33, 9], [67, 1536], [130, 5]] as const) {
    it(`is cosine in every bit for every pair: n=${n} dim=${dim}`, () => {
      const vecs = float32Vecs(n, dim, 500 + n)
      const tri = similarityTriangle(vecs)
      expect(tri.length).toBe((n * (n - 1)) / 2)
      for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) {
          expect(Object.is(pairOf(tri, n, a, b), cosineV1(vecs[a], vecs[b]))).toBe(true)
        }
      }
    })
  }

  it('is cosine in every bit on plain doubles, zero vectors and duplicates too', () => {
    const vecs = randomVecs(41, 23, 77)
    vecs[3] = vecs[3].map(() => 0)
    vecs[17] = [...vecs[9]]
    vecs[40] = vecs[9].map((x) => -x)
    const tri = similarityTriangle(vecs)
    const full = similarityMatrixV1(vecs)
    for (let a = 0; a < 41; a++) for (let b = a + 1; b < 41; b++) expect(Object.is(pairOf(tri, 41, a, b), full[a * 41 + b])).toBe(true)
    expect(pairOf(tri, 41, 3, 20)).toBe(0)
  })

  it('refuses vectors of different lengths rather than fill garbage', () => {
    expect(() => similarityTriangle([[1, 0], [1, 0, 0]])).toThrow(/dimensions/)
  })

  it('holds each pair once: half the old matrix', () => {
    const n = 100
    expect(similarityTriangle(float32Vecs(n, 8, 1)).length).toBe(n * (n - 1) / 2)
    expect(similarityMatrixV1(float32Vecs(n, 8, 1)).length).toBe(n * n)
  })
})

describe('averageLinkageClusters vs the 11 Sep code (cluster-oracle.ts)', () => {
  const thresholds = [0.3, 0.5, 0.58, 0.7, 0.9]
  for (let i = 0; i < 20; i++) {
    const n = [7, 40, 129, 260][i % 4]
    const dim = [16, 1536][i % 2]
    const threshold = thresholds[i % thresholds.length]
    const seed = 2000 + i
    it(`gives the same clusters in the same order: n=${n} dim=${dim} threshold=${threshold} seed=${seed}`, () => {
      const vecs = float32Vecs(n, dim, seed)
      expect(averageLinkageClusters(vecs, threshold)).toEqual(averageLinkageClustersV1(vecs, threshold))
    })
  }

  it('agrees under exact ties: binary vectors, where many pairs and merged averages are equal', () => {
    for (let seed = 0; seed < 40; seed++) {
      const r = rng(9000 + seed)
      const vecs = Array.from({ length: 60 }, () => Array.from({ length: 8 }, () => (r() < 0.4 ? 1 : 0)))
      for (const threshold of [0.3, 0.5, 0.58, 0.75]) {
        expect(averageLinkageClusters(vecs, threshold)).toEqual(averageLinkageClustersV1(vecs, threshold))
      }
    }
  })

  it('agrees under exact ties: duplicate insights (identical text embeds identically)', () => {
    const base = float32Vecs(30, 1536, 31)
    const vecs = [...base, ...base.slice(0, 12), ...base.slice(5, 9)]
    expect(averageLinkageClusters(vecs, 0.58)).toEqual(averageLinkageClustersV1(vecs, 0.58))
  })

  it('agrees with a pair sitting exactly on the threshold, and one bit either side of it', () => {
    const [a, b] = nearPair(1536, 4242)
    const s = cosine(a, b)
    expect(s).toBeGreaterThan(0.3)
    expect(averageLinkageClusters([a, b], s)).toEqual([[0, 1]]) // >= the line merges
    expect(averageLinkageClusters([a, b], nextUp(s))).toEqual([[0], [1]])
    for (const t of [s, nextUp(s)]) expect(averageLinkageClusters([a, b], t)).toEqual(averageLinkageClustersV1([a, b], t))
  })

  it('keeps the last bit that decides a merge on the line, which normalising first would not', () => {
    // A pair whose normalise-then-dot rounds BELOW its cosine: with the
    // threshold at the cosine, the old code merges it and that fill would
    // retire it. The search is seeded, so the case is fixed.
    let found: { a: number[]; b: number[]; s: number } | null = null
    for (let seed = 0; seed < 200 && !found; seed++) {
      const [a, b] = nearPair(1536, 7000 + seed)
      const s = cosineV1(a, b)
      if (unitDot(a, b) < s) found = { a, b, s }
    }
    expect(found).not.toBeNull()
    const { a, b, s } = found!
    expect(averageLinkageClustersV1([a, b], s)).toEqual([[0, 1]])
    expect(averageLinkageClusters([a, b], s)).toEqual([[0, 1]])
  })

  it('agrees on a corpus with pairs and merged averages packed around 0.58', () => {
    // Members at angles whose cosines straddle the threshold by small margins.
    const r = rng(58)
    const dim = 64
    const anchor = Array.from({ length: dim }, () => r() * 2 - 1)
    const vecs = Array.from({ length: 150 }, () => {
      const noise = Array.from({ length: dim }, () => r() * 2 - 1)
      const w = 0.9 + r() * 0.25
      return anchor.map((x, i) => Math.fround(x * w + noise[i] * 0.85))
    })
    expect(averageLinkageClusters(vecs, 0.58)).toEqual(averageLinkageClustersV1(vecs, 0.58))
  })

  it('linkTriangle refuses a triangle that is not n\'s', () => {
    expect(() => linkTriangle(new Float64Array(5), 4, 0.5)).toThrow(/not n=4/)
  })

  // A SPEED GUARD, relative so a loaded machine moves both sides: the fill at
  // the embedding's 1,536 dimensions measured 5.2x faster than the 11 Sep
  // fill (Sealand's 10,743-insight bucket, 18 Nov: 11.7 s against 68.1 s on
  // an M4). The bound is 2x, there to catch the day the kernel is "tidied"
  // back into one accumulator a pair, not to read a 10% regression from;
  // the best of three of each, interleaved.
  it('fills the triangle at least twice as fast as the 11 Sep fill (n=600, dim=1536)', () => {
    const vecs = float32Vecs(600, 1536, 11)
    let oldMs = Infinity
    let newMs = Infinity
    for (let k = 0; k < 3; k++) {
      let t = performance.now()
      similarityMatrixV1(vecs)
      oldMs = Math.min(oldMs, performance.now() - t)
      t = performance.now()
      similarityTriangle(vecs)
      newMs = Math.min(newMs, performance.now() - t)
    }
    console.log(`[cluster] fill n=600 dim=1536: 11 Sep ${oldMs.toFixed(0)} ms, triangle ${newMs.toFixed(0)} ms (${(oldMs / newMs).toFixed(1)}x)`)
    expect(newMs * 2).toBeLessThan(oldMs)
  }, 60_000)
})
