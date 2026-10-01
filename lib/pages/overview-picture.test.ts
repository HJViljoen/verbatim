import { describe, expect, it } from 'vitest'

import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '../rivals'
import { fact } from '../written/test-fixtures'
import type { MarketTheme, ThemeBoard } from './overview-market/board'
import { buildThemeBoard } from './overview-market/board'
import {
  buildConversations, buildKinds, buildStands, inLine, monthLabel, PICTURE_KINDS, pictureKindLabel, rowLevel, themeWho,
} from './overview-picture'

// Your market's builders (pages build): pure, on fixtures shaped like
// Sealand's September (the design's own figures).

describe('rowLevel and the month', () => {
  it('a bare share at a base of a hundred, the count under it, the bar against 100%', () => {
    expect(rowLevel(196, 852)).toMatchObject({ text: '23%', kind: 'share' })
    expect(rowLevel(12, 80)).toMatchObject({ text: '12', kind: 'count', pct: 15 })
    expect(rowLevel(900, 852).pct).toBe(100)
  })

  it('says "so far" only while the month is under way', () => {
    expect(monthLabel('2026-09-01', true)).toBe('September so far')
    expect(monthLabel('2026-09-01', false)).toBe('September')
  })

  it('kind labels as the design words them, generic without a noun', () => {
    expect(pictureKindLabel('praise', 'bags')).toBe('Praised a bag')
    expect(pictureKindLabel('praise', null)).toBe('Praised it')
    expect(PICTURE_KINDS.map((k) => pictureKindLabel(k, 'bags'))).toEqual(['Praised a bag', 'Said they want to buy', 'Asked a question', 'Complained about something', 'Wished for something', 'Pushed back'])
  })
})

describe('buildStands', () => {
  it('every tracked subject, the ready ones with their share, the rest by name only', () => {
    const facts = [
      fact({ subjectId: 's1', name: 'Buying & delivery', level: { k: 196, n: 852 }, contents: ['A', 'B', 'C', 'D'], quoteRef: { ref: 'e:q1', text: '', date: '2026-09-21', platform: 'youtube', thread: 'youtube::x' } }),
      fact({ subjectId: 's2', name: 'Looks & style', level: { k: 145, n: 852 } }),
      fact({ subjectId: 's9', name: 'Waterproofing', calibration: 'failed' }),
      fact({ subjectId: 's8', name: 'Community & purpose', calibration: 'provisional', contents: ['X'] }),
    ]
    const block = buildStands(facts, {
      sentences: new Map([['s1', 'People look for a specific bag.']]),
      quotes: new Map([['e:q1', { text: 'Time to buy it.', lang: 'en', english: null, platform: 'youtube', date: '2026-09-21' }]]),
    })
    expect(block?.n).toBe(852)
    expect(block?.rows.map((r) => [r.name, r.level?.text ?? null])).toEqual([
      ['Buying & delivery', '23%'], ['Looks & style', '17%'], ['Community & purpose', null], ['Waterproofing', null],
    ])
    expect(block?.rows[0]).toMatchObject({ sentence: 'People look for a specific bag.', contents: ['A', 'B', 'C'], quote: { text: 'Time to buy it.' } })
    // A subject with no reading carries nothing but its name.
    expect(block?.rows[2]).toMatchObject({ level: null, sentence: null, contents: [], quote: null })
    expect(buildStands([])).toBeNull()
  })
})

const theme = (id: string, k: number, over: Partial<MarketTheme> = {}): MarketTheme => ({
  registryId: id, label: `Theme ${id}`, labelStripped: false, kind: 'question', k, n: 814, prev: null,
  makerShare: 0, noiseShare: 0, identityNewThisRun: false, flags: [], provenance: null, ...over,
})

describe('buildConversations', () => {
  const all = [
    theme('m1', 155, { label: 'Admiration for handmade bag design', makerShare: 0.8 }),
    theme('m2', 106, { label: 'Love for creative upcycling ideas', makerShare: 0.7 }),
    theme('a', 90, { label: 'Ready to buy the bag' }),
    theme('m3', 50, { label: 'Requests for patterns and tutorials', makerShare: 0.6 }),
    theme('b', 33), theme('c', 25), theme('d', 24), theme('e', 16), theme('f', 12),
    theme('n1', 40, { noiseShare: 0.9 }),
  ]
  const board: ThemeBoard = buildThemeBoard(all, 814, '2026-09-01', 'measured')

  it('the top five, makers and noise set apart, each with who it is about', () => {
    const block = buildConversations(board, all, new Map([['a', [{ about: 'market', videos: 90 }]]]))
    expect(block?.rows.map((r) => r.registryId)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(block?.rows[0]).toMatchObject({ text: '11%', who: [{ about: 'market', videos: 90 }] })
    // A theme with no stored evidence row reads as the category's.
    expect(block?.rows[1].who).toEqual([{ about: 'market', videos: 33 }])
    expect(block?.makers).toEqual({ labels: ['admiration for handmade bag design', 'love for creative upcycling ideas', 'requests for patterns and tutorials'], inTopFive: 3 })
  })

  it('no makers line where segments were not measured, and nothing with no row', () => {
    expect(buildConversations(buildThemeBoard(all, 814, '2026-09-01', 'unknown'), all, new Map())?.makers).toBeNull()
    expect(buildConversations(buildThemeBoard([], 814, '2026-09-01', 'measured'), [], new Map())).toBeNull()
  })

  it('a label keeps its capital where it opens with a brand or an acronym', () => {
    expect(inLine('Admiration for handmade bag design')).toBe('admiration for handmade bag design')
    expect(inLine('Cotopaxi praised for practical travel', ['Sealand', 'Cotopaxi'])).toBe('Cotopaxi praised for practical travel')
    expect(inLine('UK airline rules')).toBe('UK airline rules')
  })
})

describe('buildKinds', () => {
  const rows = [
    { audience: INDUSTRY_AUDIENCE, kind: 'praise', videos: 599 },
    { audience: 'competitor:Patagonia', kind: 'praise', videos: 11 },
    { audience: CLIENT_AUDIENCE, kind: 'praise', videos: 8 },
    { audience: 'competitor:The North Face', kind: 'praise', videos: 8 },
    { audience: 'competitor:Cotopaxi', kind: 'praise', videos: 5 },
    { audience: 'competitor:Freitag', kind: 'praise', videos: 4 },
    { audience: INDUSTRY_AUDIENCE, kind: 'objection', videos: 147 },
    { audience: 'competitor:Patagonia', kind: 'objection', videos: 8 },
    { audience: INDUSTRY_AUDIENCE, kind: 'demographic_signal', videos: 77 },
  ]
  const rivals = ['competitor:Patagonia', 'competitor:The North Face', 'competitor:Cotopaxi', 'competitor:Freitag']

  it('the six kinds on the market\'s base, the client\'s own posts out, the category first in the split', () => {
    const block = buildKinds({ rows, n: 852, rivalAudiences: rivals, noun: 'bags' })
    expect(block?.rows.map((r) => [r.label, r.k, r.text])).toEqual([['Praised a bag', 627, '74%'], ['Pushed back', 155, '18%']])
    expect(block?.rows[0].who).toEqual([
      { about: 'market', videos: 599 }, { about: 'rival:Patagonia', videos: 11 }, { about: 'rival:The North Face', videos: 8 },
      { about: 'rival:Cotopaxi', videos: 5 }, { about: 'rival:Freitag', videos: 4 },
    ])
  })

  it('nothing with no base or no row', () => {
    expect(buildKinds({ rows, n: null, rivalAudiences: rivals, noun: 'bags' })).toBeNull()
    expect(buildKinds({ rows: [], n: 852, rivalAudiences: rivals, noun: 'bags' })).toBeNull()
  })
})

describe('themeWho', () => {
  it('a video is about the brand a comment cited on it names, else its audience; one brand per video', () => {
    const who = themeWho(
      [{ object_id: 't1', audience: INDUSTRY_AUDIENCE, video_ids: ['v1', 'v2', 'v3'], comment_ids: ['c1', 'c2'] }],
      [
        { comment_id: 'c1', video_id: 'v1', name: 'Cotopaxi' },
        { comment_id: 'c1', video_id: 'v1', name: 'Patagonia' },
        { comment_id: 'c9', video_id: 'v2', name: 'Sealand' }, // not a comment this theme cites
      ],
      'Sealand',
    )
    expect(who.get('t1')).toEqual([{ about: 'rival:Cotopaxi', videos: 1 }, { about: 'market', videos: 2 }])
  })
})
