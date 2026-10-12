import { describe, it, expect } from 'vitest'
import {
  applyMergeGroups, partitionByCentroid, partitionByOrder, settleParts, toBucketNumbers,
  type PartAnswer,
} from './theme-merge'
import { MERGE_CHUNK_MAX } from '../config'
import type { InsightRow } from './types'

// Validation of the model's proposed merges (the existence-vs-relevance
// lesson): out-of-range, overlapping, and oversized groups must be rejected
// by CODE, never trusted.

const ins = (id: string, theme: string, strength = 5): InsightRow => ({
  id, theme, category: 'praise', description: `about ${theme}`,
  strength_score: strength, emotion: 'joyful', sentiment_impact: 'positive',
  source_video_id: `v-${id}`, platform: 'tiktok',
  is_client: false, is_competitor: false, competitor_name: null,
})

// Six singleton clusters, numbered 1..6 in prompt order.
const clusters = ['a', 'b', 'c', 'd', 'e', 'f'].map((t, i) => [ins(String(i), t)])

describe('applyMergeGroups', () => {
  it('applies a valid group and keeps the rest untouched', () => {
    const r = applyMergeGroups(clusters, [{ cluster_numbers: [1, 3], reason: 'same concern' }])
    expect(r.clusters).toHaveLength(5)
    expect(r.clusters[0].map((i) => i.theme).sort()).toEqual(['a', 'c'])
    expect(r.applied).toEqual([{ members: ['a', 'c'], reason: 'same concern' }])
    expect(r.rejectedGroups).toBe(0)
  })

  it('rejects out-of-range and sub-2 groups whole', () => {
    const r = applyMergeGroups(clusters, [
      { cluster_numbers: [1, 99], reason: 'phantom member' }, // 99 invalid → group shrinks below 2
      { cluster_numbers: [4], reason: 'lonely' },
      { cluster_numbers: [0, 2], reason: 'zero is not 1-based' }, // 0 invalid → below 2
    ])
    expect(r.clusters).toHaveLength(6)
    expect(r.rejectedGroups).toBe(3)
    expect(r.applied).toEqual([])
  })

  it('a cluster may join at most one group — first group wins', () => {
    const r = applyMergeGroups(clusters, [
      { cluster_numbers: [1, 2], reason: 'first' },
      { cluster_numbers: [2, 3], reason: 'overlaps — 2 already used' },
    ])
    // Second group loses cluster 2, shrinks below 2, rejected whole.
    expect(r.applied).toHaveLength(1)
    expect(r.rejectedGroups).toBe(1)
    expect(r.clusters).toHaveLength(5)
  })

  it('rejects mega-groups past the cap (a topic, not a theme)', () => {
    const many = Array.from({ length: 12 }, (_, i) => [ins(`m${i}`, `t${i}`)])
    const r = applyMergeGroups(many, [{ cluster_numbers: many.map((_, i) => i + 1), reason: 'merge everything' }])
    expect(r.applied).toEqual([])
    expect(r.rejectedGroups).toBe(1)
    expect(r.clusters).toHaveLength(12)
  })

  it('names the merged theme after the strongest member', () => {
    const strongWeak = [[ins('1', 'weak_theme', 2)], [ins('2', 'strong_theme', 9)]]
    const r = applyMergeGroups(strongWeak, [{ cluster_numbers: [1, 2], reason: 'same' }])
    expect(r.applied[0].members).toContain('strong_theme')
  })
})

// ---------------------------------------------------------------------------
// A big bucket is merged in parts (12 Oct): the partition, the renumbering
// between a part's prompt and the bucket, and what a failed part does.

/** A deterministic stand-in for noise: a fixed LCG, so every run of the test
 *  builds the same vectors. */
function lcg(seed: number): () => number {
  let x = seed >>> 0
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    return x / 2 ** 32 - 0.5
  }
}

function unit(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  return v.map((x) => x / n)
}

/** `count` unit vectors scattered tightly around axis `axis` of `dim`. */
function around(axis: number, count: number, dim: number, rand: () => number, spread = 0.1): number[][] {
  return Array.from({ length: count }, () =>
    unit(Array.from({ length: dim }, (_, d) => (d === axis ? 1 : 0) + spread * rand())))
}

function expectEveryIndexOnce(parts: number[][], n: number) {
  expect(parts.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i))
}

describe('partitionByCentroid', () => {
  it('puts two well-separated groups in separate parts, however they are interleaved', () => {
    const rand = lcg(7)
    const a = around(0, 120, 8, rand)
    const b = around(1, 120, 8, rand)
    // A at even indices, B at odd: slicing the list in order would mix them.
    const vecs = a.flatMap((v, i) => [v, b[i]])
    const parts = partitionByCentroid(vecs, 150)
    expect(parts).toHaveLength(2)
    const evens = Array.from({ length: 120 }, (_, i) => 2 * i)
    const odds = evens.map((i) => i + 1)
    expect(parts.map((p) => p.join(',')).sort()).toEqual([evens.join(','), odds.join(',')].sort())
  })

  it('returns every cluster exactly once, each part within the cap and ascending', () => {
    const rand = lcg(11)
    // Seven loose topics of uneven size, 1,884 clusters in all: Sealand's
    // industry-other on 11 Oct, in shape if not in meaning.
    const sizes = [600, 400, 300, 250, 184, 100, 50]
    const vecs = sizes.flatMap((n, axis) => around(axis, n, 16, rand, 0.9))
    const parts = partitionByCentroid(vecs, MERGE_CHUNK_MAX)
    expectEveryIndexOnce(parts, vecs.length)
    for (const p of parts) {
      expect(p.length).toBeGreaterThan(0)
      expect(p.length).toBeLessThanOrEqual(MERGE_CHUNK_MAX)
      expect(p).toEqual([...p].sort((x, y) => x - y))
    }
    // Not shredded: bisection halves, so at most about twice the fewest
    // parts the cap allows, never a call per outlier.
    expect(parts.length).toBeLessThanOrEqual(2 * Math.ceil(vecs.length / MERGE_CHUNK_MAX))
  })

  it('is deterministic: the same centroids give the same parts', () => {
    const vecs = around(0, 500, 12, lcg(3), 1.5)
    expect(partitionByCentroid(vecs, 100)).toEqual(partitionByCentroid(vecs, 100))
    expect(partitionByCentroid(vecs.map((v) => Float32Array.from(v)), 100))
      .toEqual(partitionByCentroid(vecs.map((v) => Float32Array.from(v)), 100))
  })

  it('leaves a set at or under the cap whole', () => {
    expect(partitionByCentroid(around(0, 5, 4, lcg(1)), 5)).toEqual([[0, 1, 2, 3, 4]])
    expect(partitionByCentroid([], 5)).toEqual([])
  })

  it('splits points with no spread by position (identical, or zero)', () => {
    const same = Array.from({ length: 10 }, () => [0.6, 0.8])
    const parts = partitionByCentroid(same, 3)
    expectEveryIndexOnce(parts, 10)
    expect(parts.every((p) => p.length <= 3)).toBe(true)
    expect(parts).toEqual(partitionByCentroid(same, 3))
    const zeros = Array.from({ length: 7 }, () => [0, 0, 0])
    const z = partitionByCentroid(zeros, 2)
    expectEveryIndexOnce(z, 7)
    expect(z.every((p) => p.length <= 2)).toBe(true)
  })

  it('packs the small leaf a lopsided split leaves, instead of spending a call on it', () => {
    // 290 points on one axis and 20 far out on another: the first split peels
    // the 20 off, and the 290 then fit one part (a 300 cap) — so two parts,
    // not three. With a cap of 150 the 290 split again, and the 20 ride along
    // with one of those halves rather than going alone.
    const rand = lcg(5)
    const vecs = [...around(0, 290, 6, rand), ...around(3, 20, 6, rand)]
    expect(partitionByCentroid(vecs, 300).map((p) => p.length).sort((a, b) => a - b)).toEqual([20, 290])
    const tight = partitionByCentroid(vecs, 150)
    expectEveryIndexOnce(tight, 310)
    expect(tight.every((p) => p.length <= 150)).toBe(true)
    expect(tight.length).toBeLessThanOrEqual(3)
  })

  it('refuses a cap that is not a positive integer', () => {
    expect(() => partitionByCentroid([[1, 0]], 0)).toThrow()
    expect(() => partitionByOrder(4, 1.5)).toThrow()
  })
})

describe('partitionByOrder (the string method, which has no vectors)', () => {
  it('cuts the fewest even parts in order', () => {
    const parts = partitionByOrder(1884, 300)
    expect(parts.map((p) => p.length)).toEqual([269, 269, 269, 269, 269, 269, 270])
    expect(parts.flat()).toEqual(Array.from({ length: 1884 }, (_, i) => i))
    expect(partitionByOrder(300, 300)).toHaveLength(1)
    expect(partitionByOrder(301, 300).map((p) => p.length)).toEqual([150, 151])
  })
})

describe('toBucketNumbers', () => {
  it('maps a part\'s 1..k onto the bucket\'s numbers, and anything outside the part to 0', () => {
    const part = [4, 9, 20] // bucket indices; prompt numbers 1, 2, 3
    expect(toBucketNumbers([{ cluster_numbers: [1, 3], reason: 'r' }], part))
      .toEqual([{ cluster_numbers: [5, 21], reason: 'r' }])
    expect(toBucketNumbers([{ cluster_numbers: [0, 4, 2, 2.5], reason: 'r' }], part))
      .toEqual([{ cluster_numbers: [0, 0, 10, 0], reason: 'r' }])
  })
})

describe('settleParts', () => {
  // Six singleton clusters in two parts, by meaning rather than position.
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((t, i) => [ins(String(i), t)])
  const parts = [[0, 2, 4], [1, 3, 5]]

  it('one part is the bucket: the same outcome applyMergeGroups gives the whole answer', () => {
    const merges = [{ cluster_numbers: [1, 3], reason: 'same' }, { cluster_numbers: [3, 5], reason: 'overlaps' }, { cluster_numbers: [6, 99], reason: 'phantom' }]
    const r = settleParts('b', six, [[0, 1, 2, 3, 4, 5]], [{ merges }], false)
    expect({ clusters: r.clusters, applied: r.applied, rejectedGroups: r.rejectedGroups }).toEqual(applyMergeGroups(six, merges))
    expect(r.chunks).toBe(1)
    expect(r.failedChunks).toBe(0)
    expect(r.skipped).toBeUndefined()
  })

  it('maps each part\'s groups back to the bucket and applies them all', () => {
    const answers: PartAnswer[] = [
      { merges: [{ cluster_numbers: [1, 3], reason: 'a and e' }] }, // bucket 1, 5
      { merges: [{ cluster_numbers: [2, 3], reason: 'd and f' }] }, // bucket 4, 6
    ]
    const r = settleParts('b', six, parts, answers, false)
    expect(r.clusters.map((c) => c.map((i) => i.theme).join(''))).toEqual(['ae', 'b', 'c', 'df'])
    expect(r.applied.map((a) => a.reason)).toEqual(['a and e', 'd and f'])
    expect(r.chunks).toBe(2)
    expect(r.failedChunks).toBe(0)
  })

  it('holds a part to the same rules: out of range, oversize', () => {
    const many = Array.from({ length: 24 }, (_, i) => [ins(`m${i}`, `t${i}`)])
    const two = [Array.from({ length: 12 }, (_, i) => i), Array.from({ length: 12 }, (_, i) => i + 12)]
    const r = settleParts('b', many, two, [
      { merges: [{ cluster_numbers: two[0].map((_, i) => i + 1), reason: 'a topic, not a theme' }] },
      { merges: [{ cluster_numbers: [1, 13], reason: '13 is outside a 12-cluster part' }, { cluster_numbers: [12, 11], reason: 'fine' }] },
    ], false)
    expect(r.rejectedGroups).toBe(2)
    expect(r.applied).toEqual([{ members: ['t23', 't22'], reason: 'fine' }])
    expect(r.clusters).toHaveLength(23)
  })

  it('off the last attempt, any failed part throws, so the step retries', () => {
    expect(() => settleParts('industry-other', six, parts, [
      { merges: [{ cluster_numbers: [1, 2], reason: 'r' }] },
      { error: 'Request was aborted.' },
    ], false)).toThrow('theme merge (industry-other) failed: 1 of 2 parts (first, part 2): Request was aborted.')
    // One call, as before parts: today's message.
    expect(() => settleParts('industry-other', six, [[0, 1, 2, 3, 4, 5]], [{ error: 'Request was aborted.' }], false))
      .toThrow(/^theme merge \(industry-other\) failed: Request was aborted\.$/)
  })

  it('on the last attempt, the parts that answered apply and the failed part stays unmerged', () => {
    const r = settleParts('b', six, parts, [
      { merges: [{ cluster_numbers: [1, 2], reason: 'a and c' }] }, // bucket 1, 3
      { error: 'Request was aborted.' },
    ], true)
    expect(r.clusters.map((c) => c.map((i) => i.theme).join(''))).toEqual(['ac', 'b', 'd', 'e', 'f'])
    expect(r.applied).toHaveLength(1)
    expect(r.chunks).toBe(2)
    expect(r.failedChunks).toBe(1)
    expect(r.skipped).toBeUndefined()
  })

  it('on the last attempt with every part failed, the whole bucket is skipped', () => {
    const r = settleParts('b', six, parts, [{ error: 'x' }, { error: 'y' }], true)
    expect(r.clusters).toBe(six)
    expect(r.applied).toEqual([])
    expect(r.failedChunks).toBe(2)
    expect(r.skipped).toBe(true)
  })

  it('an unparseable answer is no merges, not a failure', () => {
    const r = settleParts('b', six, parts, [{ merges: [] }, { merges: [{ cluster_numbers: [1, 2], reason: 'b and d' }] }], false)
    expect(r.failedChunks).toBe(0)
    expect(r.clusters).toHaveLength(5)
  })
})
