import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { headline, sentenceBlockFor } from '@/lib/pages/overview'
import { overviewSentence } from './sentence'
import { LEVELS_LABEL, levelCell, levelHead, makersHead, makersTag, overviewCategory } from './category'
import { makersMarkedFixture, marketSizeFixture, overviewFixture, SEPTEMBER_CHIP } from './fixture'

// Market-first WP1.5 on the existing Overview: OV1's size headline and OV3's
// level list, rendered on Sealand's production September (fixture.ts).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

/** The level list's own markup, from its heading to the next line's. */
function levelSection(markup: string): string {
  const from = markup.indexOf(LEVELS_LABEL)
  const to = markup.indexOf('Kind of thing said', from)
  return markup.slice(from, to)
}

describe('OV1 · the size headline', () => {
  it('renders in all three modes and keeps the copy contract', () => {
    for (const mode of MODES) assertCopyContract(render(overviewSentence.render(marketSizeFixture(), mode, ctx)))
  })

  it('states the market’s size, pooled, with the figures written in', () => {
    for (const mode of MODES) {
      const text = renderText(overviewSentence.render(marketSizeFixture(), mode, ctx))
      expect(text).toContain('Your market in September so far: 655 videos and 16,233 comments.')
    }
  })

  it('prints the pair’s refusal beside it, as the verdict the comparison gave', () => {
    for (const mode of MODES) {
      const markup = render(overviewSentence.render(marketSizeFixture(), mode, ctx))
      const chip = copyNodes(markup).find((n) => n.text === SEPTEMBER_CHIP)
      expect(chip?.kind).toBe('verdict')
    }
  })

  it('prints no voices under a size headline', () => {
    const data = marketSizeFixture()
    const text = renderText(overviewSentence.render(data, 'app', ctx))
    expect(text).not.toMatch(/voices?/i)
    expect(blockAnswers(overviewSentence, data).quotes).toEqual([])
  })

  // THE LOADER'S OWN COMPOSITION, with what it would hand in on Sealand's
  // September: a subject that moved, a theme that moved and is mostly makers,
  // and a voice. None of it may reach the block under the size: no
  // "Interpretation" line with the Phase 1 gate sentence or "moved clearly",
  // no label the headline refused to lead with, and no voices.
  it('prints no interpretation, no refused label and no voices, whatever the loader hands in', () => {
    const base = marketSizeFixture()
    const looks = { ...overviewFixture().sentence.lead!, objectKind: 'subject' as const, objectId: 'looks-and-style', objectLabel: 'Looks & style' }
    const upcycling = { ...looks, objectKind: 'theme' as const, objectId: 'upcycling', objectLabel: 'Admiration for upcycled bag creativity' }
    const verdicts = [looks, upcycling]
    const head = headline({ verdicts, size: { month: '2026-09-01', soFar: true, videos: 655, comments: 16233 }, makerShares: new Map([['upcycling', 112 / 138]]), chip: SEPTEMBER_CHIP })
    const data = {
      ...base,
      sentence: sentenceBlockFor({ head, verdicts, voices: { voices: overviewFixture().sentence.voices, from: 37 }, ledger: null, anomaly: null }),
    }
    for (const mode of MODES) {
      const markup = render(overviewSentence.render(data, mode, ctx))
      assertCopyContract(markup)
      const text = renderText(overviewSentence.render(data, mode, ctx))
      expect(text).toContain('Your market in September so far: 655 videos and 16,233 comments.')
      expect(text).not.toMatch(/Interpretation|moved clearly|where you stand|voices?/i)
      expect(text).not.toContain('Looks & style')
      expect(text).not.toContain('Admiration for upcycled bag creativity')
    }
    expect(blockAnswers(overviewSentence, data).quotes).toEqual([])
  })

  it('is a reading, not an empty block, and declares only the size', () => {
    const data = marketSizeFixture()
    expect(overviewSentence.emptyState(data)).toBeNull()
    const { figures, verdicts } = blockAnswers(overviewSentence, data)
    expect(Object.keys(figures).sort()).toEqual(['market_comments', 'market_videos'])
    expect(figures.market_videos.value).toBe(655)
    expect(verdicts).toEqual([])
  })

  it('draws no chip beside a change that leads, nor on an export that predates the field', () => {
    const text = renderText(overviewSentence.render(overviewFixture(), 'app', ctx))
    expect(text).not.toContain('not read as a change')
  })
})

describe('OV3 · the level list', () => {
  it('renders in all three modes, with and without makers marked, and keeps the copy contract', () => {
    for (const data of [marketSizeFixture(), makersMarkedFixture()]) {
      for (const mode of MODES) assertCopyContract(render(overviewCategory.render(data, mode, ctx)))
    }
  })

  it('lists the eight biggest themes by size, largest first, August beside as a share', () => {
    for (const mode of MODES) {
      const text = renderText(overviewCategory.render(marketSizeFixture(), mode, ctx))
      const order = [
        'Admiration for upcycled bag creativity',
        'Ready to buy handmade bags',
        'Respect for handmade craftsmanship',
        'Love for stylish bag design',
        'Requests for step-by-step tutorials',
        'Confusion over airline bag sizes',
        'Questions about buying and shipping',
        'Backpack brand and model comparisons',
      ].map((label) => text.indexOf(label))
      expect(order.every((at) => at >= 0)).toBe(true)
      expect([...order].sort((a, b) => a - b)).toEqual(order)
      // "Ready to buy handmade bags": 69 of 626 (11%), August 23 of 351 (7%).
      expect(text).toMatch(/Ready to buy handmade bags\s*69\s*11%\s*7%/)
    }
  })

  it('puts each share’s base in its column head, never beside the title', () => {
    const data = marketSizeFixture()
    for (const mode of MODES) {
      const text = renderText(overviewCategory.render(data, mode, ctx))
      expect(text).toContain('Sep (of 626)')
      expect(text).toContain('Aug (of 351)')
    }
    expect(levelHead('2026-09-01', 626)).toBe('Sep (of 626)')
    expect(levelHead('2026-08-01', null)).toBe('Aug')
  })

  it('prints a count under 100 alone, since its column head carries the base', () => {
    expect(levelCell(4, 45)).toBe('4')
    expect(levelCell(69, 626)).toBe('11%')
    expect(levelCell(23, 351)).toBe('7%')
    expect(levelCell(null, 351)).toBe('·')
    expect(levelCell(4, null)).toBe('·')
  })

  it('says "makers not yet marked" until MF1 measures them, and marks no row', () => {
    const data = marketSizeFixture()
    for (const mode of MODES) {
      const section = renderText(levelSection(render(overviewCategory.render(data, mode, ctx))))
      expect(section).toContain('makers not yet marked')
      expect(section).not.toContain('mostly makers')
    }
    expect(makersHead(data.category.levels ?? [])).toBe('makers not yet marked')
  })

  // ÖSSUR HAS NO MAKER RULE (§2.13, deploy 1 review): no makers column, and
  // no "makers not yet marked" over a column nothing will ever fill.
  it('draws no makers column for a tenant no maker rule marks', () => {
    const base = marketSizeFixture()
    const data = { ...base, category: { ...base.category, makersApply: false } }
    for (const mode of MODES) {
      const section = renderText(levelSection(render(overviewCategory.render(data, mode, ctx))))
      expect(section, mode).not.toMatch(/makers/i)
      expect(section, mode).toContain('Biggest themes')
    }
  })

  it('marks the rows at half makers or more as "mostly makers" once MF1 is applied', () => {
    const data = makersMarkedFixture()
    for (const mode of MODES) {
      const section = renderText(levelSection(render(overviewCategory.render(data, mode, ctx))))
      // Upcycling 112 of 138, craftsmanship 70 of 96, tutorials 37 of 44.
      expect(section.match(/mostly makers/g)?.length).toBe(3)
      // Brand comparisons has no measure while the others do.
      expect(section.match(/not yet marked/g)?.length).toBe(1)
      expect(section).not.toContain('makers not yet marked')
    }
    expect(makersHead(data.category.levels ?? [])).toBe('Makers')
  })

  it('never prints a maker share of its own, and marks nothing under half', () => {
    const [upcycling, readyToBuy] = makersMarkedFixture().category.levels ?? []
    expect(makersTag(upcycling, true)).toBe('mostly makers')
    expect(makersTag(readyToBuy, true)).toBeNull()
    expect(makersTag({ ...readyToBuy, makerShare: null }, false)).toBeNull()
    expect(makersTag({ ...readyToBuy, makerShare: 0.5 }, true)).toBe('mostly makers')
  })

  it('draws the list with no change, no band and no em dash', () => {
    for (const mode of MODES) {
      const section = levelSection(render(overviewCategory.render(makersMarkedFixture(), mode, ctx)))
      expect(section).not.toMatch(/pts|band|▲|▼|—/)
    }
  })

  it('is email-safe', () => {
    const markup = render(overviewCategory.render(marketSizeFixture(), 'email', ctx))
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
  })

  it('draws no list for an export that predates the field', () => {
    for (const mode of MODES) {
      expect(renderText(overviewCategory.render(overviewFixture(), mode, ctx))).not.toContain(LEVELS_LABEL)
    }
  })

  it('declares no level as a figure, so the page’s number budget is unchanged', () => {
    const before = Object.keys(blockAnswers(overviewCategory, { ...marketSizeFixture(), category: { ...marketSizeFixture().category, levels: undefined } }).figures)
    const after = Object.keys(blockAnswers(overviewCategory, marketSizeFixture()).figures)
    expect(after).toEqual(before)
  })
})
