import { describe, it, expect } from 'vitest'

import {
  BOARD_ROWS,
  askIds,
  buildAsks,
  buildConversationBoard,
  buildThemeBoard,
  groupedMakerWords,
  makerCell,
  makerFraction,
  makerShareSentence,
  makerWords,
  namesABrand,
  segmentOf,
  stripUnevidencedBrand,
  themeFlags,
  themeProvenance,
  type MarketTheme,
} from './board'
import { STAGING_AUGUST_N, STAGING_HEARD_BEFORE, STAGING_SEPTEMBER_N, stagingOssurThemes, stagingSealandThemes } from '../../test/conversation-fixture'
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

  it('in the Makers cell, say "not measured" where no share came back, never an empty cell that reads "under a fifth"', () => {
    expect(makerCell(null)).toBe('not measured')
    expect(makerCell(Number.NaN)).toBe('not measured')
    expect(makerCell(3 / 17)).toBeNull()
    expect(makerCell(50 / 140)).toBe('about a third makers')
    // Four of September's board rows have no staging twin in CQ F29.
    expect(board().rows.filter((t) => makerCell(t.makerShare) === 'not measured').map((t) => t.registryId))
      .toEqual(['th-brand-comparisons', 'th-featured', 'th-materials'])
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

describe('Conversation’s flags (WP2.4): New and Now 10+, never a change', () => {
  it('New where no earlier month holds the theme; Now 10+ where last month was under 10; never both', () => {
    expect(themeFlags({ k: 10, prevK: 0, heardBefore: false, regrouped: false })).toEqual(['new'])
    expect(themeFlags({ k: 20, prevK: 2, heardBefore: true, regrouped: false })).toEqual(['now_10'])
    expect(themeFlags({ k: 13, prevK: 10, heardBefore: true, regrouped: false })).toEqual([])
    expect(themeFlags({ k: 9, prevK: 0, heardBefore: false, regrouped: false })).toEqual([])
  })

  it('an identity a regime-opening update minted is re-grouped, never New (WP1.9’s rule): it falls to Now 10+', () => {
    expect(themeFlags({ k: 16, prevK: 0, heardBefore: false, regrouped: true })).toEqual(['now_10'])
    expect(themeFlags({ k: 16, prevK: 12, heardBefore: false, regrouped: true })).toEqual([])
  })

  it('flags nothing without a previous month to read against (a tenant’s first month is not "new")', () => {
    expect(themeFlags({ k: 40, prevK: null, heardBefore: false, regrouped: false })).toEqual([])
    expect(themeFlags({ k: 40, prevK: Number.NaN, heardBefore: false, regrouped: false })).toEqual([])
  })

  it('staging’s September: Laundry planning and secondhand fashion New, the twelve others under 10 in August Now 10+', () => {
    const themes = stagingSealandThemes()
    expect(themes.filter((t) => t.k >= 10)).toHaveLength(21)
    expect(themes.filter((t) => t.flags.includes('new')).map((t) => t.label).sort()).toEqual([
      'Laundry planning for travel', 'Preference for secondhand fashion',
    ])
    expect(themes.filter((t) => t.flags.includes('now_10')).map((t) => [t.label, t.prev?.k])).toEqual([
      ['More colors and variants wanted', 2],
      ['Price and sale questions', 7],
      ['Need for exact measurements', 6],
      ['Tutorial praised as easy to follow', 7],
      ['Confusion about airline size rules', 6],
      ['Appreciation for smart packing tips', 3],
      ['Shopping interest from featured items', 5],
      ['Requests for the sewing pattern', 6],
      ['Frustration with bag weight', 6],
      ['Praise for laptop carry features', 3],
      ['Comfort problems when carrying', 7],
      ['Appreciation for thrifting value', 2],
    ])
  })

  it('Össur’s board flags "Brand boycott over politics" New (0 → 16), and nothing else', () => {
    const flagged = stagingOssurThemes().filter((t) => t.flags.length > 0)
    expect(flagged.map((t) => [t.label, t.k, t.prev?.k, t.flags])).toEqual([['Brand boycott over politics', 16, 0, ['new']]])
  })
})

describe('themeProvenance: a theme’s videos from searches added in its month', () => {
  const evidence = {
    provenance: [
      { video_id: 'v1', first_terms: ['handmade bag'], first_subreddits: [], method: 'exact' },
      { video_id: 'v2', first_terms: ['upcycled bag'], first_subreddits: [], method: 'exact' },
    ],
    videos: [],
    verdicts: [],
  }

  it('counts the videos found only by searches first run in the month', () => {
    expect(themeProvenance(['v1', 'v2', 'v2'], evidence, new Set(['handmade bag']))).toEqual({ fromNewSearches: 1, of: 2 })
  })

  it('is 0 by definition in a month where no search was added, with no evidence read at all', () => {
    expect(themeProvenance(['v1', 'v2'], null, new Set())).toEqual({ fromNewSearches: 0, of: 2 })
  })

  it('is not measured (null), never zero, where the searches or the evidence could not be read', () => {
    expect(themeProvenance(['v1'], evidence, null)).toBeNull()
    expect(themeProvenance(['v1'], null, new Set(['handmade bag']))).toBeNull()
    expect(themeProvenance(['v1'], { provenance: [], videos: [], verdicts: [] }, new Set(['handmade bag']))).toBeNull()
    expect(themeProvenance([], evidence, new Set())).toBeNull()
  })
})

describe('Conversation’s board (WP2.4): every theme at 10+, nothing skipped', () => {
  const conversation = (themes = stagingSealandThemes(), segments: 'measured' | 'unknown' | 'no_rule' = 'measured', expanded = false) =>
    buildConversationBoard([
      ...themes,
      // Staging's September themes at 9, 3 and 2 videos (month_theme_readings
      // and their August k, read 26 Sep); only the first two are in the pool.
      { ...themes[0], registryId: 'c1aa5d61', label: 'Uncertainty about the right size', k: 9, prev: { month: AUGUST, k: 3, n: STAGING_AUGUST_N }, makerShare: null, noiseShare: null, flags: [] },
      { ...themes[0], registryId: '0c6b88e9', label: 'Praise for stylish functional backpacks', k: 3, prev: { month: AUGUST, k: 8, n: STAGING_AUGUST_N }, makerShare: null, noiseShare: null, flags: [] },
      { ...themes[0], registryId: '0280df4d', label: 'Questions about where donations go', k: 2, prev: null, makerShare: null, noiseShare: null, flags: [] },
    ], STAGING_SEPTEMBER_N, SEPTEMBER, segments, { month: AUGUST, n: STAGING_AUGUST_N }, { expanded, inThemes: 325 })

  it('lists all 21 at 10+ on staging, 14 not led by makers and the 7 maker-led grouped, uncapped', () => {
    const b = conversation()
    expect(b.atTen).toBe(21)
    expect(b.rows).toHaveLength(14)
    expect(b.rows.length).toBeGreaterThan(BOARD_ROWS)
    expect(b.makers?.map((t) => t.label)).toEqual([
      'Love for creative upcycling',
      'Admiration for handmade craftsmanship',
      'Requests for step-by-step tutorials',
      'Questions about materials and tools',
      'Need for exact measurements',
      'Tutorial praised as easy to follow',
      'Requests for the sewing pattern',
    ])
    expect(b.setAside).toEqual([])
    const listed = new Set([...b.rows, ...(b.makers ?? []), ...(b.setAside ?? [])].map((t) => t.registryId))
    for (const t of stagingSealandThemes()) expect(listed.has(t.registryId), t.label).toBe(true)
    expect(b.rows[0].label).toBe('Buying interest and ordering questions')
    expect(b.inThemes).toBe(325)
  })

  it('counts the pool at 3 to 9 under the board and lists it only when asked; under 3 is not in the pool', () => {
    expect(conversation().below).toEqual({ count: 2, rows: null })
    expect(conversation(undefined, 'measured', true).below.rows?.map((t) => [t.label, t.k])).toEqual([
      ['Uncertainty about the right size', 9],
      ['Praise for stylish functional backpacks', 3],
    ])
  })

  it('groups nothing where the segments were not measured, and has no makers line for a tenant with no rule', () => {
    const unknown = conversation(stagingSealandThemes(), 'unknown')
    expect(unknown.rows).toHaveLength(21)
    expect(unknown.makers).toBeNull()
    const ossur = buildConversationBoard(stagingOssurThemes(), 338, SEPTEMBER, 'no_rule', { month: AUGUST, n: 537 })
    expect(ossur.rows).toHaveLength(12)
    expect(ossur.makers).toBeNull()
    expect(ossur.setAside).toBeNull()
  })
})

describe('makerShareSentence: the theme pane’s maker words (plan §2.4 C3)', () => {
  it('says "fewer than a fifth" under the note share, the fraction over it, and nothing where not measured', () => {
    expect(makerShareSentence(3 / 17)).toBe('fewer than a fifth of its videos are makers’ own')
    expect(makerShareSentence(50 / 140)).toBe('about a third of its videos are makers’ own')
    expect(makerShareSentence(63 / 72)).toBe('over four in five of its videos are makers’ own')
    expect(makerShareSentence(11 / 11)).toBe('all of its videos are makers’ own')
    expect(makerShareSentence(null)).toBeNull()
  })
})

describe('groupedMakerWords: a maker-led row’s words on Conversation', () => {
  it('says how far past half, never "mostly"; nothing under half', () => {
    expect(groupedMakerWords(46 / 65)).toBe('about three quarters makers')
    expect(groupedMakerWords(63 / 72)).toBe('over four in five makers')
    expect(groupedMakerWords(12 / 15)).toBe('about four in five makers')
    expect(groupedMakerWords(24 / 25)).toBe('nearly all makers')
    expect(groupedMakerWords(11 / 11)).toBe('all makers')
    expect(groupedMakerWords(0.55)).toBe('over half makers')
    expect(groupedMakerWords(0.49)).toBeNull()
    expect(groupedMakerWords(null)).toBeNull()
  })
})

// THE FLAG TABLE, ROW BY ROW: staging's September themes at 10+ with the facts
// read on 26 Sep (August's category k, and whether any earlier month in any
// audience holds the id), and the flag WP2.4's rule gives each.
describe('themeFlags on each of staging’s September themes at 10+', () => {
  const EXPECTED: [label: string, flag: 'new' | 'now_10' | null][] = [
    ['Buying interest and ordering questions', null],
    ['Love for creative upcycling', null],
    ['Admiration for handmade craftsmanship', null],
    ['Praise for beautiful bag design', null],
    ['Requests for step-by-step tutorials', null],
    ['Questions about materials and tools', null],
    ['More colors and variants wanted', 'now_10'],
    ['Price and sale questions', 'now_10'],
    ['Need for exact measurements', 'now_10'],
    ['Tutorial praised as easy to follow', 'now_10'],
    ['Interest in shipping and locations', null],
    ['Confusion about airline size rules', 'now_10'],
    ['Appreciation for smart packing tips', 'now_10'],
    ['Shopping interest from featured items', 'now_10'],
    ['Requests for the sewing pattern', 'now_10'],
    ['Frustration with bag weight', 'now_10'],
    ['Praise for laptop carry features', 'now_10'],
    ['Comfort problems when carrying', 'now_10'],
    ['Appreciation for thrifting value', 'now_10'],
    ['Preference for secondhand fashion', 'new'],
    ['Laundry planning for travel', 'new'],
    ['Audience identities and amputation types', null],
    ['Admiration for personal resilience', null],
    ['Questions about prosthetic function', null],
    ['Requests for prosthetic help', null],
    ['Brand boycott over politics', 'new'],
    ['Praise for prosthetic look', null],
    ['Price and availability questions', null],
    ['Cost blocks access', null],
    ['Excitement about prosthetic innovation', null],
    ['Prosthetics need more personalization', null],
    ['Socket fit keeps changing', null],
    ['Insurance delays and denials', null],
  ]
  const all = [...stagingSealandThemes(), ...stagingOssurThemes()]
  it.each(EXPECTED)('“%s” → %s', (label, flag) => {
    const t = all.find((x) => x.label === label)!
    expect(t).toBeDefined()
    expect(themeFlags({ k: t.k, prevK: t.prev?.k ?? null, heardBefore: STAGING_HEARD_BEFORE.get(t.registryId) ?? true, regrouped: false }))
      .toEqual(flag ? [flag] : [])
  })
})
