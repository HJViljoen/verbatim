import { describe, it, expect } from 'vitest'
import { composeQuestions, marketPhrase, possessive } from './questions'
import { CUSTOM_BRIEF, DOCUMENT_BLOCKS, DOCUMENT_BLOCKS_MAX, MARKET_BRIEF, affordableBlocks, blockQuestions, resolveTemplate } from './templates'
import { SALES_BRIEF } from './templates'
import { DOCUMENT_BLOCK_KEYS } from './types'
import { DOCUMENT_QUESTIONS_MAX } from '../../config'
import { DEFAULT_DOCUMENT_SETTINGS } from './types'
import type { MergedConcern } from './merge'

const concern = (id: string, label: string, total: number, description = ''): MergedConcern => ({
  id, label, description, buckets: [], total, categories: ['pain_point'], rankScore: total, themeIds: [], registryIds: [], insightIds: [], videoIds: [], trajectory: '',
})

const signals = {
  company: 'Ossur',
  industryKeywords: ['amputee', 'prosthetic leg', 'prosthetic arm', '#runningblade', '#prosthetics'],
  competitors: [{ name: 'Ottobock', thin: false }],
  concerns: [
    concern('S1', 'Questions about fit and features', 99, 'Viewers want to know how it fits.'),
    concern('S2', 'Cost puts prosthetics out of reach', 27),
    concern('S3', 'Comfort and durability problems', 43),
    concern('S4', 'Insurance and Medicare barriers', 17),
    concern('S5', 'How it works in water', 15),
    concern('S6', 'Emotional toll of amputation', 25),
  ],
}

describe('marketPhrase', () => {
  it('names the products in the corpus\'s words, hashtags dropped, three at most', () => {
    expect(marketPhrase('Ossur', signals.industryKeywords)).toBe("products like Ossur's (amputee, prosthetic leg, prosthetic arm)")
    expect(possessive('Adidas')).toBe("Adidas'")
    expect(marketPhrase('Dagne Dover', [])).toBe("products like Dagne Dover's")
    expect(possessive('LMNT')).toBe("LMNT's")
  })
})

describe('composeQuestions', () => {
  it('asks the anchors, one per competitor, then the loudest concerns an anchor does not already cover', () => {
    const qs = composeQuestions(SALES_BRIEF, signals, DEFAULT_DOCUMENT_SETTINGS, 8)
    expect(qs.map((q) => q.purpose)).toEqual(['anchor', 'anchor', 'anchor', 'anchor', 'competitor', 'concern', 'concern', 'concern'])
    expect(qs.find((q) => q.purpose === 'competitor')).toMatchObject({ id: 'competitor:ottobock', competitor: 'Ottobock' })
    expect(qs.find((q) => q.purpose === 'competitor')!.text).toContain('Ottobock')
    expect(qs.find((q) => q.purpose === 'competitor')!.text).toContain('Ossur')
    // Cost and insurance are anchored already; fit, comfort and water get the concern slots.
    expect(qs.filter((q) => q.purpose === 'concern').map((q) => q.concernId)).toEqual(['S1', 'S3', 'S5'])
    expect(qs[5].text).toBe('Viewers want to know how it fits. What do people say about this, and what would settle it for them?')
    expect(qs[6].text).toBe('What do people say about comfort and durability problems, and what would settle it for them?')
    for (const q of qs) expect(q.text).not.toMatch(/\{[a-z]+\}/)
  })

  it('adds the register question for professionals and keeps the cap', () => {
    const qs = composeQuestions(SALES_BRIEF, signals, { ...DEFAULT_DOCUMENT_SETTINGS, sellsTo: 'professionals' }, 8)
    expect(qs.filter((q) => q.purpose === 'register')).toHaveLength(1)
    expect(qs.find((q) => q.purpose === 'register')!.text).toMatch(/clinics|professionals/)
    expect(qs).toHaveLength(8)
    expect(qs.filter((q) => q.purpose === 'concern')).toHaveLength(2)
    expect(composeQuestions(SALES_BRIEF, signals, DEFAULT_DOCUMENT_SETTINGS, 5)).toHaveLength(5)
  })

  it('asks about at most two competitors and none when none is tracked', () => {
    const many = { ...signals, competitors: [{ name: 'A', thin: false }, { name: 'B', thin: false }, { name: 'C', thin: true }] }
    expect(composeQuestions(SALES_BRIEF, many, DEFAULT_DOCUMENT_SETTINGS, 10).filter((q) => q.purpose === 'competitor').map((q) => q.competitor)).toEqual(['A', 'B'])
    expect(composeQuestions(SALES_BRIEF, { ...signals, competitors: [] }, DEFAULT_DOCUMENT_SETTINGS, 10).filter((q) => q.purpose === 'competitor')).toHaveLength(0)
  })
})

// B1 (review, 2026-09-12): a topic block "that must be included" is not
// included if its questions fall off the end of the standing cap. Measured
// before the fix: four blocks and a three sentence brief lost the competitor
// question and three of market movement's own.
describe('composeQuestions with topic blocks', () => {
  const withBlocks = (blocks: (typeof DOCUMENT_BLOCK_KEYS)[number][], brief?: string) =>
    resolveTemplate(CUSTOM_BRIEF, { sellsTo: 'consumers', competitors: null, language: 'en', findings: 4, role: 'market_brief', blocks, brief })

  it('asks every block anchor when every block is picked and the brief runs to three sentences', () => {
    const t = withBlocks([...DOCUMENT_BLOCK_KEYS], 'Review the athlete campaign. Say what landed with buyers. Say what did not.')
    const qs = composeQuestions(t, signals, { ...DEFAULT_DOCUMENT_SETTINGS, blocks: [...DOCUMENT_BLOCK_KEYS] }, DOCUMENT_QUESTIONS_MAX)
    const asked = new Set(qs.map((q) => q.id))
    for (const key of DOCUMENT_BLOCK_KEYS) {
      for (const a of DOCUMENT_BLOCKS[key].anchors) {
        if (a.perCompetitor) expect(qs.some((q) => q.purpose === 'competitor'), `${key}/${a.id}`).toBe(true)
        else expect(asked.has(a.id), `${key}/${a.id}`).toBe(true)
      }
    }
    expect(qs.filter((q) => q.id.startsWith('brief')).map((q) => q.id)).toEqual(['brief1', 'brief2', 'brief3'])
    // 3 brief + 10 block questions (one anchor asked per competitor, one
    // competitor tracked in this fixture): the cap rose, nothing was sliced.
    expect(qs).toHaveLength(12)
    expect(qs.filter((q) => q.purpose === 'concern')).toEqual([])
  })

  it('never drops a block anchor, whatever the standing cap says', () => {
    const t = withBlocks([...DOCUMENT_BLOCK_KEYS])
    const qs = composeQuestions(t, signals, { ...DEFAULT_DOCUMENT_SETTINGS, blocks: [...DOCUMENT_BLOCK_KEYS] }, 3)
    const ids = qs.map((q) => q.id)
    for (const key of DOCUMENT_BLOCK_KEYS) {
      for (const a of DOCUMENT_BLOCKS[key].anchors) {
        if (!a.perCompetitor) expect(ids, `${key}/${a.id}`).toContain(a.id)
      }
    }
  })

  it('leaves the four fixed templates asking exactly what they asked before', () => {
    const qs = composeQuestions(SALES_BRIEF, signals, DEFAULT_DOCUMENT_SETTINGS, DOCUMENT_QUESTIONS_MAX)
    expect(qs).toHaveLength(DOCUMENT_QUESTIONS_MAX)
    expect(qs.map((q) => q.purpose)).toEqual(['anchor', 'anchor', 'anchor', 'anchor', 'competitor', 'concern', 'concern', 'concern'])
    const market = composeQuestions(MARKET_BRIEF, signals, DEFAULT_DOCUMENT_SETTINGS, DOCUMENT_QUESTIONS_MAX)
    expect(market).toHaveLength(DOCUMENT_QUESTIONS_MAX)
  })
})

describe('affordableBlocks', () => {
  it('offers every block at the build budget the product runs on', () => {
    expect(DOCUMENT_BLOCKS_MAX).toBe(DOCUMENT_BLOCK_KEYS.length)
    expect(DOCUMENT_BLOCKS_MAX).toBe(affordableBlocks())
  })

  it('offers fewer when the budget cannot pay for their questions', () => {
    // The brief alone asks three; a block is two to three questions more.
    expect(affordableBlocks(0.2)).toBe(0)
    expect(affordableBlocks(0.2 + 5 * 0.05)).toBe(1)
    expect(blockQuestions(DOCUMENT_BLOCKS.competitive_analysis)).toBe(2)
    expect(blockQuestions(DOCUMENT_BLOCKS.market_movement)).toBe(3)
  })
})
