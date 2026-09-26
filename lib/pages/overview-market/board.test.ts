import { describe, it, expect } from 'vitest'

import {
  BOARD_ROWS,
  askIds,
  buildAsks,
  buildThemeBoard,
  makerFraction,
  makerWords,
  namesABrand,
  segmentOf,
  stripUnevidencedBrand,
  type MarketTheme,
} from './board'
import { AUGUST, AUGUST_CATEGORY_N, SEPTEMBER, SEPTEMBER_CATEGORY_N, septemberThemes } from '../../test/market-fixture'

const board = (themes: MarketTheme[] = septemberThemes(), segments: 'measured' | 'unknown' | 'no_rule' = 'measured') =>
  buildThemeBoard(themes, SEPTEMBER_CATEGORY_N, SEPTEMBER, segments, { month: AUGUST, n: AUGUST_CATEGORY_N })

describe('the theme board, on Sealand’s September (production labels, makers by analogy)', () => {
  it('lists the ten biggest themes not led by makers, in §2.2’s order', () => {
    expect(board().rows.map((r) => [r.label, r.k])).toEqual([
      ['Ready to buy handmade bags', 69],
      ['Love for stylish bag design', 60],
      ['Confusion over airline bag sizes', 21],
      ['Questions about buying and shipping', 20],
      // Two at 18: the one with more August videos first (12 against 6).
      ['Backpack brand and model comparisons', 18],
      ['Price checks before purchase', 18],
      ['Praise for practical packing tips', 15],
      ['Interest in featured products', 12],
      // Four at 11: August's 6, 4, 3 and 2 decide it; the tenth row is bag
      // materials and "Interest in specific colors" misses the board (§2.2's
      // tie-break note).
      ['Frustration with heavy travel bags', 11],
      ['Questions about bag materials', 11],
    ])
    expect(board().rows.length).toBe(BOARD_ROWS)
  })

  it('never puts a maker-led theme first, and groups the seven maker-led themes into one line', () => {
    const b = board()
    expect(segmentOf(b.rows[0])).toBeNull()
    expect(b.makers?.count).toBe(7)
    expect(b.makers?.lead.map((t) => [t.label, t.k])).toEqual([
      ['Admiration for upcycled bag creativity', 71],
      ['Respect for handmade craftsmanship', 64],
    ])
    expect(b.setAside?.count).toBe(0)
  })

  it('accounts for every theme at 10 or more: a row, the makers line, or the count', () => {
    const b = board()
    expect(b.atTen).toBe(21)
    const grouped = septemberThemes().filter((t) => segmentOf(t) === 'makers').length
    // The ten rows and the seven makers leave four at 11 and 10 that the board
    // counts in `atTen` and Conversation lists in full.
    expect(b.rows.length + grouped + 4).toBe(b.atTen)
    const onBoard = new Set(b.rows.map((r) => r.registryId))
    const leftOff = septemberThemes().filter((t) => !onBoard.has(t.registryId) && segmentOf(t) == null)
    expect(leftOff.map((t) => t.k)).toEqual([11, 11, 10, 10])
  })

  it('before MF1 is applied groups nothing and lists the ten biggest, makers included', () => {
    const b = board(septemberThemes({ measured: false }), 'unknown')
    expect(b.makers).toBeNull()
    expect(b.setAside).toBeNull()
    expect(b.rows[0].label).toBe('Admiration for upcycled bag creativity')
    expect(b.atTen).toBe(21)
  })

  it('draws no makers line for a tenant with no maker rule (Össur, §2.13)', () => {
    const b = board(septemberThemes({ measured: false }), 'no_rule')
    expect(b.makers).toBeNull()
    expect(b.segments).toBe('no_rule')
  })

  it('opens at 10 videos: a theme under the floor is on no row and in no count', () => {
    const nine: MarketTheme = { ...septemberThemes()[5], registryId: 'th-nine', label: 'Uncertainty about the right size', k: 9 }
    const b = board([...septemberThemes(), nine])
    expect(b.rows.map((r) => r.registryId)).not.toContain('th-nine')
    expect(b.atTen).toBe(21)
  })

  it('sets noise-led themes aside, the same way (decision F)', () => {
    const noise: MarketTheme = { ...septemberThemes()[0], registryId: 'th-poker', label: 'Enjoyment of poker content', k: 12, makerShare: 0, noiseShare: 0.9 }
    const b = board([...septemberThemes(), noise])
    expect(b.setAside?.count).toBe(1)
    expect(b.rows.map((r) => r.registryId)).not.toContain('th-poker')
  })
})

describe('maker words', () => {
  it('say the fraction a reader would (plan §2.2’s print)', () => {
    expect(makerWords(50 / 140)).toBe('about a third makers') // 36%
    expect(makerWords(36 / 106)).toBe('about a third makers') // 34%
    expect(makerWords(9 / 29)).toBe('about a third makers') // 31%
    expect(makerWords(3 / 14)).toBe('a fifth makers') // 21%
    expect(makerWords(0.38)).toBe('over a third makers') // Looks & style, CQ F31
    expect(makerWords(7 / 26)).toBe('about a quarter makers') // 27%
  })

  it('print nothing under a fifth, or for a share nobody measured', () => {
    expect(makerWords(3 / 17)).toBeNull() // airline sizes, 18%
    expect(makerWords(null)).toBeNull()
    expect(makerWords(Number.NaN)).toBeNull()
    expect(makerFraction(112 / 138)).toBe('mostly')
  })
})

describe('a label that names a brand its quotes do not', () => {
  it('reads "a brand" (DR F43)', () => {
    expect(stripUnevidencedBrand('Comparing Sealand with alternatives', ['Sealand', 'Cotopaxi'], ['which bag is best for travel', 'I love my osprey']))
      .toEqual({ label: 'Comparing a brand with alternatives', stripped: true })
  })

  it('is left alone where a quote names the brand', () => {
    expect(stripUnevidencedBrand('Comparing Sealand with alternatives', ['Sealand'], ['the sealand one is lighter']))
      .toEqual({ label: 'Comparing Sealand with alternatives', stripped: false })
  })

  it('matches whole words only, and capitalises a label that now opens on the words', () => {
    expect(stripUnevidencedBrand('Patagonia fans compare jackets', ['Patagonia'], [])).toEqual({ label: 'A brand fans compare jackets', stripped: true })
    expect(stripUnevidencedBrand('Love for Freitagsbag designs', ['Freitag'], []).stripped).toBe(false)
    expect(namesABrand('Ready to buy handmade bags', ['Sealand', 'Patagonia'])).toBe(false)
    expect(namesABrand('Comparing Sealand with alternatives', ['Sealand'])).toBe(true)
  })
})

describe('the asks', () => {
  it('list the three biggest questions, problems and wishes not led by makers', () => {
    const a = buildAsks(septemberThemes(), SEPTEMBER, 'measured')
    expect(a.lists.map((l) => [l.kind, l.rows.map((r) => [r.label, r.k])])).toEqual([
      ['question', [['Confusion over airline bag sizes', 21], ['Backpack brand and model comparisons', 18], ['Questions about bag materials', 11]]],
      ['pain_point', [['Frustration with heavy travel bags', 11], ['Backpack comfort and fit issues', 10]]],
      ['feature_request', [['Interest in specific colors', 11]]],
    ])
  })

  it('never list a maker-led question (the tutorials, the sewing tools)', () => {
    const labels = buildAsks(septemberThemes(), SEPTEMBER, 'measured').lists.flatMap((l) => l.rows.map((r) => r.label))
    expect(labels).not.toContain('Requests for step-by-step tutorials')
    expect(labels).not.toContain('Questions about sewing tools')
  })

  it('carry the quote the loader chose for each theme, and the ids it should read quotes for', () => {
    const quote = { ref: 'e:1', text: 'If you made it in pink and a bigger size I would buy it immediately' }
    const a = buildAsks(septemberThemes(), SEPTEMBER, 'measured', new Map([['th-colors', quote]]))
    expect(a.lists[2].rows[0].quote).toEqual(quote)
    expect(askIds(septemberThemes(), 'measured')).toEqual(['th-airline', 'th-brand-comparisons', 'th-materials', 'th-heavy', 'th-comfort', 'th-colors'])
  })
})
