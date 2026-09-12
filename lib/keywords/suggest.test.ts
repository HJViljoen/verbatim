import { describe, it, expect } from 'vitest'
import { boundSuggestInput, flattenCompetitorTerms } from './suggest'

// The pure halves of the suggester. The model call itself is I/O and untested
// by design; what matters here is that nothing unbounded reaches a prompt and
// that the competitor re-keying loses nothing quietly.

describe('boundSuggestInput', () => {
  const input = (o: Partial<Parameters<typeof boundSuggestInput>[0]> = {}) =>
    boundSuggestInput({ company_name: 'Sealand', competitor_names: [], industry_keywords: [], ...o })

  it('trims and collapses whitespace', () => {
    expect(input({ company_name: '  Topo   Designs \n' }).company_name).toBe('Topo Designs')
  })

  it('clips a company name that would otherwise be pasted into the prompt whole', () => {
    expect(input({ company_name: 'x'.repeat(5000) }).company_name).toHaveLength(80)
  })

  it('clips every competitor name and keeps at most fifteen', () => {
    const out = input({ competitor_names: Array.from({ length: 50 }, () => 'y'.repeat(500)) })
    expect(out.competitor_names).toHaveLength(15)
    expect(out.competitor_names.every((n) => n.length === 40)).toBe(true)
  })

  it('bounds the category list the same way', () => {
    const out = input({ industry_keywords: Array.from({ length: 40 }, (_, i) => `term ${i}`) })
    expect(out.industry_keywords).toHaveLength(15)
  })

  it('drops blanks rather than sending empty strings to the model', () => {
    expect(input({ competitor_names: ['Freitag', '   ', ''] }).competitor_names).toEqual(['Freitag'])
  })

  it('leaves the website out entirely when none was given', () => {
    expect('website' in input()).toBe(false)
  })
})

describe('flattenCompetitorTerms', () => {
  it('pools every competitor’s terms into the one list the bucket holds', () => {
    expect(flattenCompetitorTerms({ competitors: { Cotopaxi: ['cotopaxi bags'], Freitag: ['freitag tote'] } }))
      .toEqual(['cotopaxi bags', 'freitag tote'])
  })

  it('de-dupes across competitors and drops terms too short to search', () => {
    expect(flattenCompetitorTerms({ competitors: { A: ['tote bag', 'bag'], B: ['Tote Bag'] } }))
      .toEqual(['tote bag'])
  })

  it('is empty when the model named no competitor we asked about', () => {
    expect(flattenCompetitorTerms({ competitors: {} })).toEqual([])
  })
})
