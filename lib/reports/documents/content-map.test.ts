import { describe, expect, it } from 'vitest'

import { OVERVIEW_BLOCKS } from '../../../components/pages/overview'
import { MARKET_BLOCKS } from '../../../components/pages/market-surface'
import { marketWays } from '../../../components/pages/market-surface/ways'
import { CONTENT_MAP, sectionsOf } from './sections'

// The content brief's own map (Block D wave 2, E-content). `sections.test.ts`
// asserts the four maps as a set; this file asserts the one map this package
// owns, and it exists so the block-key bug below has a test that NAMES it.

const section = (id: string) => sectionsOf(CONTENT_MAP).find((s) => s.id === id)

describe('ct.ways — the wrong block key', () => {
  // THE BUG, IN ONE SENTENCE. `ct.ways` is titled "Ways in" and framed "Where
  // the category is already talking, and what it is talking about", and it used
  // to draw `market.ways`, whose own title is "How a move is made" and whose
  // body is five ways to act plus the say-vs-hear claims table. A content
  // brief's reader met a heading about the category and a page about our
  // workflow. The words were right and the key was wrong.
  it('draws the block its own words describe, not the one about making a move', () => {
    const s = section('ct.ways')
    expect(s).toBeTruthy()
    expect(s!.block).toBe('overview.category')
    expect(s!.surface).toBe('overview')
  })

  it('the block it used to draw is titled after a MOVE, which is why it was wrong', () => {
    expect(marketWays.title).toBe('How a move is made')
    expect(MARKET_BLOCKS.map((b) => b.key)).toContain('market.ways')
    expect(sectionsOf(CONTENT_MAP).map((s) => s.block)).not.toContain('market.ways')
  })

  it('and the block it draws now really does answer the section’s framing', () => {
    const block = OVERVIEW_BLOCKS.find((b) => b.key === 'overview.category')
    expect(block).toBeTruthy()
    expect(block!.title).toBe('What the category is saying')
  })

  it('the section id is unchanged — it names a slide and a stored edit', () => {
    expect(sectionsOf(CONTENT_MAP).map((s) => s.id)).toContain('ct.ways')
  })
})

