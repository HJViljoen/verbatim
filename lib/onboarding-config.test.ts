import { describe, it, expect } from 'vitest'
import { deriveCompetitorKeywords, mergeCompetitorKeywords } from './onboarding-config'

describe('deriveCompetitorKeywords', () => {
  it('turns the competitors you named into the terms we search for', () => {
    expect(deriveCompetitorKeywords(['Ottobock', 'Blatchford'])).toEqual(['Ottobock', 'Blatchford'])
  })
  it('drops names too short to search on (they still tag)', () => {
    expect(deriveCompetitorKeywords(['On', 'Hoka'])).toEqual(['Hoka'])
  })
  it('normalises whitespace and de-duplicates case-insensitively', () => {
    expect(deriveCompetitorKeywords(['  Topo   Designs ', 'topo designs'])).toEqual(['Topo Designs'])
  })
  it('respects the 15-keyword ceiling the CHECK constraint enforces', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Brand${i}`)
    expect(deriveCompetitorKeywords(many)).toHaveLength(15)
  })
  it('an empty list stays empty', () => {
    expect(deriveCompetitorKeywords([])).toEqual([])
  })
})

describe('mergeCompetitorKeywords', () => {
  it('adds a newly named competitor to a list the client has edited', () => {
    // The regression this exists for: once a client edited the term list, the
    // old "operator curated it" rule stopped topping up the derivation, so a
    // new competitor name was never searched for.
    const stored = ['Ottobock prosthetics', 'Ottobock']
    expect(mergeCompetitorKeywords(stored, ['Ottobock', 'Blatchford'])).toEqual(
      ['Ottobock', 'Blatchford', 'Ottobock prosthetics'],
    )
  })

  it('never removes a term someone added', () => {
    const stored = ['Ottobock bionic knee']
    expect(mergeCompetitorKeywords(stored, ['Ottobock'])).toContain('Ottobock bionic knee')
  })

  it('de-dupes case-insensitively rather than storing the same term twice', () => {
    expect(mergeCompetitorKeywords(['ottobock'], ['Ottobock'])).toEqual(['Ottobock'])
  })

  it('keeps the derived floor when a curated list is already at the cap', () => {
    const stored = Array.from({ length: 15 }, (_, i) => `curated term ${i}`)
    const out = mergeCompetitorKeywords(stored, ['Blatchford'])
    expect(out).toHaveLength(15)
    expect(out[0]).toBe('Blatchford')
  })

  it('is the plain derivation when nothing is stored yet', () => {
    expect(mergeCompetitorKeywords([], ['Ottobock', 'Gap'])).toEqual(['Ottobock'])
  })
})
