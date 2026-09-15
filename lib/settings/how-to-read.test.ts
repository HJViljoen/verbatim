import { describe, expect, it } from 'vitest'

import { GLOSSARY, THIRTEEN_WORDS } from '../calibration'
import { DIRECTION_WORDS } from '../calibration'
import { SURFACES } from '../nav'
import { READING_CARDS, READING_PATH } from './how-to-read'

describe('how to read', () => {
  it('describes every surface the shell has, and no other', () => {
    expect(READING_CARDS.map((c) => c.key)).toEqual(SURFACES.map((s) => s.key))
  })

  it('repeats neither the title nor the question — lib/nav.ts owns both', () => {
    for (const card of READING_CARDS) {
      const s = SURFACES.find((x) => x.key === card.key)!
      expect(card).not.toHaveProperty('title')
      expect(card.tells).not.toBe(s.question)
    }
  })

  it('names only real glossary words', () => {
    for (const card of READING_CARDS) {
      for (const key of card.read) expect(GLOSSARY[key]).toBeDefined()
    }
  })

  it('draws its vocabulary from the thirteen and their two flags, not the legacy words', () => {
    const allowed = new Set<string>([...THIRTEEN_WORDS, 'new', 'gone_quiet'])
    for (const card of READING_CARDS) {
      for (const key of card.read) expect(allowed.has(key)).toBe(true)
    }
  })

  it('says what every surface cannot tell you — the half a reader asks for least', () => {
    for (const card of READING_CARDS) expect(card.cannot.length).toBeGreaterThan(0)
  })

  it('does not carry the Guide’s false claim about search terms', () => {
    const settings = READING_CARDS.find((c) => c.key === 'settings')!
    const words = [settings.tells, ...settings.cannot].join(' ')
    expect(words).not.toContain('changed by us on request, not from this page')
    // The true half survives, and the correction with it.
    expect(words).toContain('Your search terms are yours')
  })

  it('reads on three clocks, in the order a month is actually read', () => {
    expect(READING_PATH.map((p) => p.when)).toEqual([
      'Each week', 'Each month, once the month is done', 'Each quarter',
    ])
    for (const step of READING_PATH) expect(step.what.length).toBeGreaterThan(0)
  })

  it('prints no direction word of its own outside the word that defines one', () => {
    // The cards are prose about the product, not a verdict, so D1's rule
    // applies to them exactly as it applies to a block: gaining and fading are
    // earned by three readings and are never furniture.
    const prose = READING_CARDS.flatMap((c) => [c.tells, ...c.cannot]).join(' ').toLowerCase()
    for (const word of DIRECTION_WORDS) {
      if (word === 'grew' || word === 'faded') continue // "what grew and faded" is a panel's NAME
      expect(prose).not.toContain(` ${word} `)
    }
  })
})
