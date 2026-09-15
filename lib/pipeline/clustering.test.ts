import { describe, it, expect } from 'vitest'

import {
  THEME_KEY_RULE,
  clusteringBoundaries,
  clusteringKey,
  currentClusteringRegime,
  sameRegime,
} from './clustering'
import { CLUSTER_SIMILARITY_THRESHOLD, EVIDENCE_FLOOR, SYNTHESIS_MODEL } from '../config'

const regime = {
  promptVersion: 'pass_a_v4.1',
  clusterThreshold: 0.58,
  evidenceFloor: 2,
  mergeModel: 'gpt-5.4',
  themeKey: 'video_v1',
}

describe('clusteringKey', () => {
  it('is legible, ordered and stable', () => {
    expect(clusteringKey(regime)).toBe('a=pass_a_v4.1;c=0.58;f=2;m=gpt-5.4;k=video_v1')
  })

  it('moves when any one knob moves', () => {
    const base = clusteringKey(regime)
    expect(clusteringKey({ ...regime, promptVersion: 'pass_a_v5' })).not.toBe(base)
    expect(clusteringKey({ ...regime, clusterThreshold: 0.6 })).not.toBe(base)
    expect(clusteringKey({ ...regime, evidenceFloor: 3 })).not.toBe(base)
    expect(clusteringKey({ ...regime, mergeModel: 'gpt-5.5' })).not.toBe(base)
    expect(clusteringKey({ ...regime, themeKey: 'video_v2' })).not.toBe(base)
  })

  it('reads the constants as they stand, so a knob moved in config moves the key', () => {
    const now = currentClusteringRegime({ promptVersion: 'pass_a_v4.1' })
    expect(now).toEqual({
      promptVersion: 'pass_a_v4.1',
      clusterThreshold: CLUSTER_SIMILARITY_THRESHOLD,
      evidenceFloor: EVIDENCE_FLOOR,
      mergeModel: SYNTHESIS_MODEL,
      themeKey: THEME_KEY_RULE,
    })
    // The version the run's flags select is the one that lands in the key: a
    // transcripts-disabled tenant books against v3 and clusters in its own
    // regime, which is exactly what the marker has to say.
    expect(clusteringKey(currentClusteringRegime({ promptVersion: 'pass_a_v3.1' })))
      .toContain('a=pass_a_v3.1')
  })
})

describe('sameRegime', () => {
  it('is true only when both sides are known and equal', () => {
    expect(sameRegime('a=1', 'a=1')).toBe(true)
    expect(sameRegime('a=1', 'a=2')).toBe(false)
  })
  it('never reads two unknowns as the same regime', () => {
    expect(sameRegime(null, null)).toBe(false)
    expect(sameRegime(undefined, 'a=1')).toBe(false)
    expect(sameRegime('a=1', null)).toBe(false)
  })
})

describe('clusteringBoundaries', () => {
  const k1 = 'a=pass_a_v4.1;c=0.58;f=2;m=gpt-5.4;k=video_v1'
  const k2 = 'a=pass_a_v5;c=0.58;f=2;m=gpt-5.4;k=video_v1'

  it('finds nothing in one unbroken regime', () => {
    expect(clusteringBoundaries([
      { month: '2026-06-01', clustering_key: k1 },
      { month: '2026-07-01', clustering_key: k1 },
      { month: '2026-08-01', clustering_key: k1 },
    ])).toEqual([])
  })

  it('names the first month under the new key', () => {
    expect(clusteringBoundaries([
      { month: '2026-06-01', clustering_key: k1 },
      { month: '2026-07-01', clustering_key: k2 },
      { month: '2026-08-01', clustering_key: k2 },
    ])).toEqual([{ month: '2026-07-01', from: k1, to: k2, kind: 'changed' }])
  })

  it('orders the months itself, so a caller cannot report a boundary backwards', () => {
    expect(clusteringBoundaries([
      { month: '2026-08-01', clustering_key: k2 },
      { month: '2026-06-01', clustering_key: k1 },
    ])).toEqual([{ month: '2026-08-01', from: k1, to: k2, kind: 'changed' }])
  })

  it('marks a missing key unknown on both sides of it, and never as sameness', () => {
    expect(clusteringBoundaries([
      { month: '2026-06-01', clustering_key: null },
      { month: '2026-07-01' },
      { month: '2026-08-01', clustering_key: k1 },
    ])).toEqual([
      { month: '2026-07-01', from: null, to: null, kind: 'unknown' },
      { month: '2026-08-01', from: null, to: k1, kind: 'unknown' },
    ])
  })

  it('a gap in the months is not a boundary', () => {
    // July is hollow — no row at all. June and August still compare.
    expect(clusteringBoundaries([
      { month: '2026-06-01', clustering_key: k1 },
      { month: '2026-08-01', clustering_key: k1 },
    ])).toEqual([])
  })

  it('reports every crossing of a series that changed twice', () => {
    expect(clusteringBoundaries([
      { month: '2026-06-01', clustering_key: k1 },
      { month: '2026-07-01', clustering_key: k2 },
      { month: '2026-08-01', clustering_key: k1 },
    ]).map((b) => b.month)).toEqual(['2026-07-01', '2026-08-01'])
  })
})
