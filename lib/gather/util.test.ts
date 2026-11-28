import { describe, it, expect } from 'vitest'
import { cleanHashtag } from './util'

// cleanHashtag (28 Nov 2026): accents fold instead of vanishing, other
// scripts survive. Before it, 'Össur' searched #ssur and a keyword written in
// any non-Latin script searched nothing.

describe('cleanHashtag', () => {
  it('folds an accented Latin letter rather than deleting it', () => {
    expect(cleanHashtag('Össur')).toBe('ossur')
    expect(cleanHashtag('Café crème')).toBe('cafecreme')
  })

  it('joins words, drops the # and lowercases', () => {
    expect(cleanHashtag('sealand gear')).toBe('sealandgear')
    expect(cleanHashtag('#Upcycled Bag')).toBe('upcycledbag')
  })

  it('keeps digits and underscores', () => {
    expect(cleanHashtag('run_club 2026')).toBe('run_club2026')
  })

  it('keeps letters of other scripts, marks included, recomposed', () => {
    expect(cleanHashtag('登山 装备')).toBe('登山装备')
    expect(cleanHashtag('코토팍시')).toBe('코토팍시')
    expect(cleanHashtag('がんばれ')).toBe('がんばれ')
    expect(cleanHashtag('Йога')).toBe('йога')
    // Letters with no decomposition stay as they are.
    expect(cleanHashtag('Søren Æble')).toBe('sørenæble')
  })

  it('drops emoji and punctuation, including an emoji’s variation selector', () => {
    expect(cleanHashtag('love ❤️ it!')).toBe('loveit')
    expect(cleanHashtag('🔥gear, (new)…')).toBe('gearnew')
    expect(cleanHashtag('1️⃣ step')).toBe('1step')
  })

  it('gives empty for empty, and for a keyword with nothing usable in it', () => {
    expect(cleanHashtag('')).toBe('')
    expect(cleanHashtag('#!? 🎉')).toBe('')
  })
})
