import { describe, expect, it } from 'vitest'
import { Hash } from 'lucide-react'
import { render, renderText } from '@/lib/test/render'
import { BAR_FILL, BrandChip, ChipSep, EYEBROW, IconTile, KIND_ICON, NewNumber, SELECTED, TAG } from './colour-roles'
import { HomePage } from './pages/home'
import { HOME_DATA } from '@/lib/pages/home-fixture'
import { MarketPicturePage } from './pages/overview/picture'
import { PICTURE_FIXTURE } from './pages/overview/picture/fixture'
import { VoiceSurfacePage } from './pages/voice-surface'
import { conversationFixture } from './pages/voice-surface/fixture-conversation'
import { CompetitivePage } from './pages/competitive-surface/page'
import { designFixture } from './pages/competitive-surface/page/fixture'

// The colour roles (colour pass, 1 Oct; MASTER.md §Colour roles): each colour
// one job, drawn through ./colour-roles. These pin the jobs, and the bans that
// came with more colour, on the pages' own fixtures.

describe('the colour roles', () => {
  it('fills a bar by whose videos it counts: the market yellow, you gold, a rival grey, the second series orange', () => {
    expect(BAR_FILL).toEqual({ market: 'bg-brand', you: 'bg-you', rival: 'bg-comp', second: 'bg-orange' })
  })

  it('labels in the orange text, selects and tags in the pale yellow', () => {
    expect(EYEBROW).toContain('text-orange-text')
    expect(SELECTED).toBe('bg-accent text-accent-foreground')
    expect(TAG).toBe('bg-accent text-accent-foreground')
  })

  it('draws you as a gold chip with white words and a rival as a chip with the grey dot, never wrapping inside one', () => {
    const you = render(<BrandChip who="you">Sealand</BrandChip>)
    expect(you).toContain('bg-you')
    expect(you).toContain('text-you-foreground')
    expect(you).toContain('whitespace-nowrap')
    const rival = render(<BrandChip who="rival">Cotopaxi</BrandChip>)
    expect(rival).toContain('bg-track')
    expect(rival).toMatch(/<span aria-hidden="true" class="[^"]*bg-comp[^"]*"><\/span>Cotopaxi/)
    // Shorter than the line it sits in, so it never grows one.
    for (const m of [you, rival]) expect(m).toContain('leading-none')
  })

  it('keeps the separator between chips for the words, and does not draw it', () => {
    expect(renderText(<>A<ChipSep />B</>)).toBe('A · B')
    expect(render(<ChipSep />)).toContain('<span class="sr-only">·</span>')
  })

  it('draws an icon tile as decoration, on the pale yellow under the orange text, taking no height', () => {
    const m = render(<IconTile icon={Hash} />)
    expect(m).toContain('aria-hidden="true"')
    expect(m).toContain('bg-accent text-orange-text')
    expect(m).toContain('-my-[5px] size-7')
    expect(render(<IconTile icon={Hash} tone="brand" />)).toContain('bg-brand text-brand-foreground')
  })

  it('marks what is new with the orange fill and ink numerals (4.6 to 1), never orange words', () => {
    const m = render(<NewNumber n={2} />)
    expect(m).toContain('bg-orange')
    expect(m).toContain('text-brand-foreground')
    expect(m).not.toMatch(/text-orange(?!-text)/)
  })

  it('gives every kind of comment its own glyph', () => {
    for (const k of ['praise', 'purchase_intent', 'question', 'pain_point', 'feature_request', 'objection']) expect(KIND_ICON[k], k).toBeDefined()
  })
})

describe('the bans that hold with more colour, on the pages', () => {
  const pages: [string, string][] = [
    ['dashboard', render(<HomePage data={HOME_DATA} />)],
    ['your market', render(<MarketPicturePage data={PICTURE_FIXTURE} />)],
    ['conversation', render(<VoiceSurfacePage data={conversationFixture()} params={{}} />)],
    ['competitive', render(<CompetitivePage data={designFixture()} />)],
  ]

  it('puts no chip inside a sentence: a brand chip is a label on a brand line, never a marker in prose', () => {
    for (const [name, m] of pages) {
      // The Dashboard names no brand; every other page here does.
      if (name !== 'dashboard') expect(m, name).toContain('data-who-chip')
      // A paragraph, or any node of written prose, that holds a chip.
      expect(m, name).not.toMatch(/<p\b[^>]*>(?:(?!<\/p>)[\s\S])*data-who-chip/)
      expect(m, name).not.toMatch(/data-copy="(?:prose|stored)"[^>]*>[^<]*<[^>]*data-who-chip/)
    }
  })

  it('lays the pale yellow on small surfaces only: never a card, a paragraph or an article', () => {
    for (const [name, m] of pages) expect(m, name).not.toMatch(/<(?:section|article|p)\b[^>]*class="[^"]*\bbg-accent\b/)
  })

  it('lifts every card on the one card shadow', () => {
    for (const [name, m] of pages) {
      const cards = m.match(/<section\b[^>]*class="[^"]*rounded-\[1[46]px\][^"]*"/g) ?? []
      expect(cards.length, name).toBeGreaterThan(0)
      for (const c of cards) expect(c, name).toContain('shadow-card')
    }
  })
})
