import { describe, it, expect } from 'vitest'
import { applyPassBLabels, chunkThemesForLabelling, humaniseSlug, planPassB, type PassBWaveResult } from './pass-b'
import type { AggregatedTheme } from './types'

const theme = (bucket: string, i: number): AggregatedTheme =>
  ({ bucket, category: 'c', theme: `t_${i}`, memberThemes: [], sampleDescriptions: [] } as unknown as AggregatedTheme)

const indexed = (specs: [string, number][]) => {
  const out: { label: string; theme: AggregatedTheme }[] = []
  let n = 0
  for (const [bucket, count] of specs) {
    for (let i = 0; i < count; i++) out.push({ label: `T${++n}`, theme: theme(bucket, n) })
  }
  return out
}

describe('chunkThemesForLabelling (T0-5)', () => {
  it('keeps a small run in one call', () => {
    const chunks = chunkThemesForLabelling(indexed([['client', 10], ['industry-other', 20]]), 120)
    // One per bucket: themes that compete to be distinct stay together.
    expect(chunks).toHaveLength(2)
  })

  it('splits the bucket that actually dominates, not every bucket evenly', () => {
    // The measured shape: industry-other carries most of a 550-theme run.
    const chunks = chunkThemesForLabelling(indexed([['client', 30], ['industry-other', 470], ['competitor:x', 50]]), 120)
    expect(chunks).toHaveLength(1 + 4 + 1)
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(120)
  })

  it('never loses or duplicates a theme', () => {
    const input = indexed([['a', 55], ['b', 130], ['c', 7]])
    const chunks = chunkThemesForLabelling(input, 120)
    const labels = chunks.flat().map((c) => c.label)
    expect(labels).toHaveLength(input.length)
    expect(new Set(labels).size).toBe(input.length)
  })

  it('indices stay globally unique across chunks, so one lookup map serves them all', () => {
    const chunks = chunkThemesForLabelling(indexed([['a', 200]]), 120)
    const all = chunks.flat().map((c) => c.label)
    expect(new Set(all).size).toBe(all.length)
  })

  it('an empty run produces no calls', () => {
    expect(chunkThemesForLabelling([], 120)).toEqual([])
  })
})

describe('humaniseSlug', () => {
  it('is the fallback label every theme leaves the pass with', () => {
    expect(humaniseSlug('cost_and_insurance')).toBe('Cost and insurance')
  })
})

// The per-wave steps (2026-10-04): the plan runs on every replay, each wave
// returns labels as plain data, and one step applies them all.
const raw = (bucket: string, i: number): AggregatedTheme =>
  ({ bucket, category: 'c', theme: `t_${i}`, memberThemes: [], sampleDescriptions: [`sample ${i}`] } as unknown as AggregatedTheme)
const runThemes = (specs: [string, number][]) => {
  const out: AggregatedTheme[] = []
  let n = 0
  for (const [bucket, count] of specs) for (let i = 0; i < count; i++) out.push(raw(bucket, ++n))
  return out
}
const wave = (labels: PassBWaveResult['labels'], rejectedRefs = 0): PassBWaveResult =>
  ({ labels, rejectedRefs, promptTokens: 0, completionTokens: 0, costUsd: 0 })

describe('planPassB', () => {
  it('gives every theme its fallback before any call answers', () => {
    const themes = runThemes([['a', 3]])
    planPassB(themes)
    expect(themes.map((t) => t.label)).toEqual(['T 1', 'T 2', 'T 3'])
    expect(themes[0].description).toBe('sample 1')
  })

  it('cuts the same chunks with the same indices on every replay', () => {
    const specs: [string, number][] = [['a', 130], ['b', 40]]
    const first = planPassB(runThemes(specs)).map((c) => c.map((e) => `${e.label}:${e.theme.theme}`))
    const again = planPassB(runThemes(specs)).map((c) => c.map((e) => `${e.label}:${e.theme.theme}`))
    expect(again).toEqual(first)
    expect(first).toHaveLength(3)
  })

  it('an empty run plans no waves', () => {
    expect(planPassB([])).toEqual([])
  })
})

describe('applyPassBLabels', () => {
  it('puts each wave\'s labels on the themes it named', () => {
    const themes = runThemes([['a', 2], ['b', 1]])
    const chunks = planPassB(themes)
    const r = applyPassBLabels(chunks, [
      wave([{ key: 't1', slug: 't_1', bucket: 'a', label: 'Strap comfort', description: 'They want softer straps.' }]),
      wave([{ key: 't3', slug: 't_3', bucket: 'b', label: 'Price', description: '' }], 2),
    ])
    expect(r).toEqual({ labelled: 2, rejectedRefs: 2 })
    expect(themes[0].label).toBe('Strap comfort')
    expect(themes[0].description).toBe('They want softer straps.')
    // An empty description keeps the fallback; an unanswered theme keeps its slug.
    expect(themes[2].label).toBe('Price')
    expect(themes[2].description).toBe('sample 3')
    expect(themes[1].label).toBe('T 2')
  })

  it('refuses a key whose theme is not the one the wave labelled', () => {
    const themes = runThemes([['a', 2]])
    const chunks = planPassB(themes)
    const r = applyPassBLabels(chunks, [
      wave([
        { key: 't1', slug: 't_2', bucket: 'a', label: 'Wrong theme', description: '' },
        { key: 't2', slug: 't_2', bucket: 'b', label: 'Wrong bucket', description: '' },
        { key: 't9', slug: 't_9', bucket: 'a', label: 'No such index', description: '' },
      ]),
    ])
    expect(r).toEqual({ labelled: 0, rejectedRefs: 3 })
    expect(themes.map((t) => t.label)).toEqual(['T 1', 'T 2'])
  })
})
