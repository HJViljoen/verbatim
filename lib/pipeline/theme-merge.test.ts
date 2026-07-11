import { describe, it, expect } from 'vitest'
import { applyMergeGroups } from './theme-merge'
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
