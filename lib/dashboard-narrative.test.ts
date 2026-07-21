import { describe, it, expect } from 'vitest'
import { composeDashboardNarrative, type NarrativeFigures } from './dashboard-narrative'
import { FIGURE_TOKEN } from './pipeline/narrative'
import type { ExecutiveBrief } from './pipeline/schemas'

// composeDashboardNarrative substitutes the AUTHORITATIVE figure for each [[n]]
// token, drops beats whose metric isn't computable this run, and falls back to a
// code-composed narrative when the model brief is unusable.

const figures = (partial: Partial<NarrativeFigures> = {}): NarrativeFigures => ({
  brand: 'Sealand',
  topTheme: { label: 'strap comfort', description: 'Buyers keep raising how the strap feels.', conversations: 42 },
  sentiment: { positivePct: 71 },
  shareOfVoice: { clientPct: 5, hasCompetitors: true },
  ...partial,
})

const brief = (narrative: ExecutiveBrief['narrative']): ExecutiveBrief => ({
  headline_finding: 'Buyers keep returning to how the strap feels.',
  narrative,
})

describe('composeDashboardNarrative', () => {
  it('substitutes the authoritative figure at the token', () => {
    const out = composeDashboardNarrative(
      brief([{ metric: 'top_theme', text: `Comfort leads, heard across ${FIGURE_TOKEN}.` }]),
      figures(),
    )
    expect(out.fallback).toBe(false)
    expect(out.beats[0]).toMatchObject({ metric: 'top_theme', before: 'Comfort leads, heard across ', figure: '42 conversations', after: '.' })
  })

  it('drops a beat whose metric is uncomputable (share with no competitors)', () => {
    const out = composeDashboardNarrative(
      brief([
        { metric: 'top_theme', text: `heard across ${FIGURE_TOKEN}.` },
        { metric: 'share_of_voice', text: `holds ${FIGURE_TOKEN} of the conversation.` },
      ]),
      figures({ shareOfVoice: { clientPct: 100, hasCompetitors: false } }),
    )
    expect(out.beats.map((b) => b.metric)).toEqual(['top_theme'])
  })

  it('dedupes a polarity word the model wrote next to the sentiment figure', () => {
    const out = composeDashboardNarrative(
      brief([{ metric: 'sentiment', text: `Feeling sits at ${FIGURE_TOKEN} positive across the corpus.` }]),
      figures(),
    )
    expect(out.beats[0].figure).toBe('71% positive')
    expect(out.beats[0].after).toBe(' across the corpus.')
  })

  it('appends the figure when the model omitted the token', () => {
    const out = composeDashboardNarrative(
      brief([{ metric: 'sentiment', text: 'Feeling across the corpus is warm.' }]),
      figures(),
    )
    expect(out.beats[0].before).toBe('Feeling across the corpus is warm. ')
    expect(out.beats[0].figure).toBe('71% positive')
    expect(out.beats[0].after).toBe('')
  })

  it('falls back to a code-composed narrative when the brief is null', () => {
    const out = composeDashboardNarrative(null, figures())
    expect(out.fallback).toBe(true)
    expect(out.headline).toBe('Buyers keep raising how the strap feels.') // theme description
    expect(out.beats.length).toBeGreaterThan(0)
    expect(out.beats.every((b) => b.figure.length > 0)).toBe(true)
  })

  it('falls back when every model beat is uncomputable', () => {
    const out = composeDashboardNarrative(
      brief([{ metric: 'share_of_voice', text: `holds ${FIGURE_TOKEN}.` }]),
      figures({ shareOfVoice: null, sentiment: null }),
    )
    // No share, no sentiment → the only computable metric is top_theme, via fallback.
    expect(out.fallback).toBe(true)
    expect(out.beats.map((b) => b.metric)).toEqual(['top_theme'])
  })
})
