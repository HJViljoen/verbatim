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
