import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import type { AttributionInputs } from '../brands/attribution'
import { subjectForTheme } from '../written/pool'
import {
  BRAND_ITEMS_MAX,
  brandItems,
  buildConversation,
  convKindLabel,
  firstSentence,
  kindItems,
  kindSplit,
  makerPostsPhrase,
  makerPostsSentence,
  quoteSource,
  shareOf,
  stripEmoji,
  subjectOfTheme,
  type KindTheme,
  type QuoteSeed,
} from './voice-conversation'

const theme = (id: string, k: number, kind = 'question', over: Partial<KindTheme> = {}): KindTheme =>
  ({ id, label: `Theme ${id}`, kind, k, makerShare: 0, noiseShare: 0, ...over })

describe('convKindLabel', () => {
  it('prints the artboard’s words, praise naming what the tenant sells', () => {
    expect(convKindLabel('praise', SEALAND_CLIENT_ID)).toBe('Praised a bag')
    expect(convKindLabel('praise', 'another-tenant')).toBe('Praised it')
    expect(['purchase_intent', 'question', 'pain_point', 'feature_request', 'objection', 'buying_trigger'].map((k) => convKindLabel(k, SEALAND_CLIENT_ID)))
      .toEqual(['Said they want to buy', 'Asked a question', 'Complained about something', 'Wished for something', 'Pushed back', 'Said what made them look'])
  })
})

describe('the makers’ share in words', () => {
  it('says the artboard’s fraction from a fifth, and nothing under it or at half', () => {
    expect(makerPostsPhrase(30 / 92)).toBe('a third on makers’ posts')
    expect(makerPostsPhrase(5 / 21)).toBe('a quarter on makers’ posts')
    expect(makerPostsPhrase(0.21)).toBe('a fifth on makers’ posts')
    expect(makerPostsPhrase(0.19)).toBeNull()
    expect(makerPostsPhrase(0.5)).toBeNull()
    expect(makerPostsPhrase(null)).toBeNull()
    expect(makerPostsSentence(30 / 92)).toBe('A third of its videos are makers’ own posts.')
  })
})

describe('subjectOfTheme', () => {
  it('is the written read’s rule exactly (lib/written/pool.ts subjectForTheme)', () => {
    const subjectsOf = new Map<string, string[]>([
      ['i1', ['s1']], ['i2', ['s1']], ['i3', ['s1', 's2']], ['i4', ['s2']], ['i5', ['s2']], ['i6', ['s2']],
    ])
    const cases: [string[], string[]][] = [
      [['i1', 'i2', 'i3'], []],
      [['i1', 'i2', 'i3', 'i4', 'i5', 'i6'], ['s1', 's2']],
      [['i1', 'i2', 'i3', 'i4', 'i5', 'i6'], ['s2', 's1']],
      [['i1', 'i2'], []],
      [[...Array.from({ length: 30 }, (_, i) => `x${i}`), 'i1', 'i2', 'i3'], []],
    ]
    for (const [members, order] of cases) expect(subjectOfTheme(members, subjectsOf, order)).toBe(subjectForTheme(members, subjectsOf, order))
    expect(subjectOfTheme(['i1', 'i2', 'i3'], subjectsOf)).toBe('s1')
    expect(subjectOfTheme(['i1', 'i2'], subjectsOf)).toBeNull()
  })
})

describe('kindItems', () => {
  it('lists the top five, every one tied with the fifth, at most eight', () => {
    // The artboard's "Asked a question": 22, 20, 15, 9, 5, 5, 5.
    const q = [22, 20, 15, 9, 5, 5, 5].map((k, i) => theme(`q${i}`, k))
    expect(kindItems(q, 'question').map((t) => t.k)).toEqual([22, 20, 15, 9, 5, 5, 5])
    // "Complained about something": 18, 8, 8, 7, 6, 6, 6, 6, 6 → eight.
    const p = [18, 8, 8, 7, 6, 6, 6, 6, 6].map((k, i) => theme(`p${i}`, k, 'pain_point'))
    expect(kindItems(p, 'pain_point')).toHaveLength(8)
    const plain = [9, 8, 7, 6, 5, 4].map((k, i) => theme(`r${i}`, k))
    expect(kindItems(plain, 'question').map((t) => t.k)).toEqual([9, 8, 7, 6, 5])
  })

  it('leaves out other kinds, the floor, and conversations led by makers or off-topic videos', () => {
    const items = kindItems([
      theme('a', 30, 'question', { makerShare: 0.5 }),
      theme('b', 20, 'question', { noiseShare: 0.6 }),
      theme('c', 12, 'praise'),
      theme('d', 3),
      theme('e', 10, 'question', { makerShare: 0.4 }),
    ], 'question')
    expect(items.map((t) => t.id)).toEqual(['e'])
  })
})

describe('brandItems', () => {
  it('puts the client’s own first, then rivals by videos, at the floor, capped', () => {
    const rows = [
      { themeId: 't1', audience: 'competitor:Patagonia', videos: 6, label: 'Ethical activism builds trust', kind: 'praise' },
      { themeId: 't2', audience: 'client', videos: 3, label: 'Support for community cleanups', kind: 'praise' },
      { themeId: 't3', audience: 'client', videos: 4, label: 'Praise for Sealand’s mission', kind: 'praise' },
      { themeId: 't4', audience: 'competitor:Freitag', videos: 1, label: 'Too few', kind: 'praise' },
      { themeId: 't5', audience: 'industry-other', videos: 9, label: 'Not a brand’s', kind: 'praise' },
      { themeId: 't6', audience: 'competitor:Cotopaxi', videos: 5, label: 'Other kind', kind: 'question' },
    ]
    expect(brandItems(rows, 'praise').map((r) => [r.about, r.videos])).toEqual([['client', 4], ['client', 3], ['rival:Patagonia', 6]])
    const many = Array.from({ length: 9 }, (_, i) => ({ themeId: `m${i}`, audience: 'competitor:Patagonia', videos: 2 + i, label: `L${i}`, kind: 'praise' }))
    expect(brandItems(many, 'praise')).toHaveLength(BRAND_ITEMS_MAX)
  })
})

describe('kindSplit', () => {
  it('sums the kind’s audiences, most first, the market first where it is biggest', () => {
    const rows = [
      { audience: 'industry-other', kind: 'praise', videos: 599 },
      { audience: 'competitor:Patagonia', kind: 'praise', videos: 11 },
      { audience: 'competitor:Cotopaxi', kind: 'praise', videos: 5 },
      { audience: 'industry-other', kind: 'question', videos: 426 },
    ]
    expect(kindSplit(rows, 'praise', 'Sealand')).toEqual([
      { about: 'market', videos: 599 },
      { about: 'rival:Patagonia', videos: 11 },
      { about: 'rival:Cotopaxi', videos: 5 },
    ])
  })
})

describe('small helpers', () => {
  it('shares half up, first sentences, emoji out, the quote’s source line', () => {
    expect(shareOf(92, 814)).toBe(11)
    expect(shareOf(12, 814)).toBe(1)
    expect(firstSentence('A bag that fits. Another sentence here.')).toBe('A bag that fits.')
    expect(stripEmoji('Shining Echoes ✨🧵')).toBe('Shining Echoes')
    expect(quoteSource((p) => p.toUpperCase(), () => '6 Sep', { platform: 'tiktok', date: '2026-09-06T10:00:00Z' })).toBe('TIKTOK · 6 Sep')
  })
})

describe('buildConversation', () => {
  const brands = { client: 'Sealand', rivals: new Map([['c1', 'Cotopaxi'], ['p1', 'Patagonia']]), counts: () => true }
  const attribution: AttributionInputs = {
    audiences: new Map([['v1', 'industry-other'], ['v2', 'industry-other'], ['v3', 'industry-other'], ['v4', 'competitor:Cotopaxi']]),
    namings: new Map([['v2', [{ brandKey: 'p1', commentId: 'cm2', month: '2026-09-01' }]], ['v3', [{ brandKey: 'p1', commentId: 'other', month: '2026-09-01' }]]]),
    brands,
  }
  const seed = (videoId: string, commentId: string): QuoteSeed => ({ quote: { ref: `c:${commentId}`, text: 'Words' }, platform: 'reddit', date: '2026-09-16', commentId, videoId })
  const build = (over: Partial<Parameters<typeof buildConversation>[0]> = {}) => buildConversation({
    client: 'Sealand',
    market: { long: 'Other bags in your market', short: 'other bags' },
    month: '2026-09-01',
    monthName: 'September',
    soFar: true,
    boardIds: ['t1'],
    talk: new Map([['t1', { videoIds: ['v1', 'v2', 'v3'], comments: new Set(['cm2']) }], ['t2', { videoIds: ['v4'], comments: null }]]),
    attribution,
    members: new Map([['t1', ['i1', 'i2', 'i3']]]),
    subjects: { names: new Map([['s1', 'Comfort']]), order: ['s1'], subjectsOf: new Map([['i1', ['s1']], ['i2', ['s1']], ['i3', ['s1']]]) },
    makerShares: new Map([['t1', 0.33]]),
    kindThemes: [theme('t1', 12, 'question'), theme('t2', 6, 'question')],
    brandRows: [{ themeId: 'b1', audience: 'competitor:Cotopaxi', videos: 3, label: 'Questions about bag size and brand', kind: 'question' }],
    kindRows: [{ audience: 'industry-other', kind: 'question', videos: 426 }, { audience: 'competitor:Patagonia', kind: 'question', videos: 8 }],
    kindVideos: new Map([['question', 434]]),
    kindLabel: (k) => convKindLabel(k, SEALAND_CLIENT_ID),
    voices: [seed('v2', 'cm2')],
    kindQuotes: new Map([['question', seed('v1', 'cm1')]]),
    source: () => 'Reddit · 16 Sep',
    ...over,
  })

  it('files each row’s videos by the talk’s own comments, tags its subject and its makers', () => {
    const c = build()
    // v3 names Patagonia on a comment the theme does not rest on: market.
    expect(c.rows.t1).toEqual({
      who: [{ about: 'rival:Patagonia', videos: 1 }, { about: 'market', videos: 2 }],
      subject: 'Comfort',
      makers: 'a third on makers’ posts',
    })
    expect(c.monthWords).toBe('in September so far')
    expect(build({ soFar: false }).monthWords).toBe('in September')
  })

  it('says who each quote is about from its own video and comment', () => {
    const c = build()
    expect(c.voices[0].who).toEqual([{ about: 'rival:Patagonia', videos: 1 }])
    expect(c.voices[0].source).toBe('Reddit · 16 Sep')
    expect(c.kinds[0].quote?.who).toEqual([{ about: 'market', videos: 1 }])
  })

  it('draws a kind only where it has a conversation to list, with its market videos and split', () => {
    const c = build()
    expect(c.kinds.map((k) => k.kind)).toEqual(['question'])
    const q = c.kinds[0]
    expect(q.label).toBe('Asked a question')
    expect(q.videos).toBe(434)
    expect(q.split).toEqual([{ about: 'market', videos: 426 }, { about: 'rival:Patagonia', videos: 8 }])
    expect(q.items.map((i) => [i.themeId, i.videos])).toEqual([['t1', 12], ['t2', 6]])
    expect(q.items[1].who).toEqual([{ about: 'rival:Cotopaxi', videos: 1 }])
    expect(q.brandItems).toEqual([{ about: 'rival:Cotopaxi', themeId: 'b1', label: 'Questions about bag size and brand', videos: 3 }])
    expect(c.kindLabels?.praise).toBe('Praised a bag')
  })

  it('prints no split and no maker words where nothing was read', () => {
    const c = build({ attribution: null, makerShares: null, subjects: null })
    expect(c.rows.t1).toEqual({ who: [], subject: null, makers: null })
    expect(c.voices[0].who).toEqual([])
  })
})
