import { describe, expect, it } from 'vitest'
import { withCurrentWords } from './legacy-words'

describe('withCurrentWords', () => {
  it('rewrites a pre-sweep phrase stored in a snapshot, deep in the data', () => {
    const old = { cover: { stats: [{ label: 'Durability — you against the category, Q3 2026' }] }, n: 3 }
    expect(withCurrentWords(old).cover.stats[0].label).toBe('Durability: you against the category, Q3 2026')
  })

  it('returns the same object when nothing matched, and leaves other dashes alone', () => {
    const cur = { quote: 'she said — and meant it', label: 'Durability: you against the category' }
    expect(withCurrentWords(cur)).toBe(cur)
  })

  it('rewrites the Overview sentences a monthly snapshot stores', () => {
    const old = {
      lead: 'Looks & style came up in 16.3% of the category’s videos this month — 102 of 625 videos.',
      note: 'Your side carried 9 videos this month, too few for its column to answer — the category column carries the month.',
      moves: 'One monthly reading so far — the first comparison lands with the month after this one.',
    }
    const cur = withCurrentWords(old)
    expect(cur.lead).toBe('Looks & style came up in 16.3% of the category’s videos this month, 102 of 625 videos.')
    expect(cur.note).toContain('to answer; the category column')
    expect(cur.moves).toBe('One monthly reading so far. The first comparison lands with the month after this one.')
  })
})
