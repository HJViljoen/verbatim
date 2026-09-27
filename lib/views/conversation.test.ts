import { describe, expect, it } from 'vitest'

import { buildConversationBoard, POOL_FLOOR, themeFlags, type MarketTheme } from '../pages/overview-market'
import { voiceSurfaceHref } from '../pages/voice-surface'
import { voiceFixture } from '../../components/pages/voice-surface/fixture'
import { conversationView, keptSegments, viewShares } from './conversation'
import { SEALAND_LENS } from './fixture'
import { noteText } from './state'

// Conversation read on a view (plan §2.4 C1, WP3.3), on staging's own
// September: the Conversation fixture's stored reading (654 market videos,
// 625 in the category, 21 themes at 10+) and Sealand's lens rows for the same
// month (381 buyers, 220 makers, 53 off-topic; lib/views/fixture.ts).

const RIVALS = ['competitor:Cotopaxi', 'competitor:Freitag', 'competitor:Patagonia', 'competitor:The North Face']
const MONTH = '2026-09-01'
const PREV = '2026-08-01'
const VIEWS_ONLY = { views: true, setAside: false }
const ALL_ON = { views: true, setAside: true }

const stored = voiceFixture()
const labelled: MarketTheme[] = [...stored.board.rows, ...(stored.board.makers ?? []), ...(stored.board.setAside ?? [])]
const buyersRead = { state: 'read' as const, view: 'buyers' as const, lens: 'buyers' as const, rows: SEALAND_LENS.buyers }

/** The loader's own steps (lib/pages/voice-surface.ts), on a view: the pool,
 *  last month, the n's, the segments and shares, then the board. */
function boardOn(cv: ReturnType<typeof conversationView>) {
  const pool = cv.pool([], POOL_FLOOR)
  const prevK = cv.prevK(new Map())
  const n = cv.n(625)
  const prevN = cv.prevN(351)
  const segments = cv.segments('measured')
  const shares = cv.shares({ maker: new Map(labelled.map((t) => [t.registryId, t.makerShare])), noise: new Map(labelled.map((t) => [t.registryId, t.noiseShare])) })
  const themes: MarketTheme[] = pool.flatMap(({ id, k }) => {
    const t = labelled.find((x) => x.registryId === id)
    if (!t) return []
    const pk = prevN != null ? prevK.get(id) ?? 0 : null
    return [{
      ...t, k, n,
      prev: pk != null && prevN != null ? { month: PREV, k: pk, n: prevN } : null,
      makerShare: shares?.maker.get(id) ?? null,
      noiseShare: shares?.noise.get(id) ?? null,
      flags: themeFlags({ k, prevK: pk, heardBefore: !t.flags.includes('new'), regrouped: false }),
    }]
  })
  return buildConversationBoard(themes, n, MONTH, segments, prevN != null ? { month: PREV, n: prevN } : null, { belowCount: pool.length - themes.filter((t) => t.k >= 10).length })
}

describe('no view live: the page is today’s page', () => {
  it('passes every stored reading through, reads nothing more and draws no pill', () => {
    const cv = conversationView({ cfg: null, asked: 'everything', read: { state: 'everything', view: 'everything' }, month: MONTH, prevMonth: PREV })
    expect(cv.lens).toBe(false)
    expect(cv.pool([{ id: 'a', k: 5 }], POOL_FLOOR)).toEqual([{ id: 'a', k: 5 }])
    expect(cv.n(625)).toBe(625)
    expect(cv.prevN(351)).toBe(351)
    expect(cv.segments('measured')).toBe('measured')
    expect(cv.readsSegments).toBe(false)
    expect(cv.provenance({ fromNewSearches: 57, of: 88 }, 88)).toEqual({ fromNewSearches: 57, of: 88 })
    expect(cv.inThemes(325)).toBe(325)
    const out = cv.finish(stored.market, { month: MONTH, rivalAudiences: RIVALS, params: {} })
    expect(out.market).toBe(stored.market)
    expect(out.view).toBeUndefined()
  })
})

describe('Buyers', () => {
  const cv = conversationView({ cfg: VIEWS_ONLY, asked: 'buyers', read: buyersRead, month: MONTH, prevMonth: PREV })

  it('reads the category’s n, the month before and every theme’s k on the buyers lens', () => {
    expect(cv.lens).toBe(true)
    expect(cv.n(625)).toBe(355)
    expect(cv.prevN(351)).toBe(127)
    const pool = cv.pool([], POOL_FLOOR)
    expect(pool[0]).toEqual({ id: '03cabe7e', k: 57 })
    expect(pool.every((p, i) => i === 0 || pool[i - 1].k >= p.k)).toBe(true)
    expect(pool.every((p) => p.k >= POOL_FLOOR)).toBe(true)
    expect(cv.prevK(new Map()).get('03cabe7e')).toBe(15)
  })

  it('groups nothing and prints no maker share: the lens already chose its videos', () => {
    expect(cv.segments('measured')).toBe('no_rule')
    expect(cv.shares({ maker: new Map([['a', 0.35]]), noise: new Map([['a', 0]]) })).toBeNull()
  })

  it('builds the board on the buyers’ own counts: 10 themes at 10+, biggest first, with August beside of 127', () => {
    const board = boardOn(cv)
    expect(board.n).toBe(355)
    expect(board.prev).toEqual({ month: PREV, n: 127 })
    expect(board.makers).toBeNull()
    expect(board.setAside).toBeNull()
    expect(board.rows.map((t) => [t.registryId, t.k, t.prev?.k])).toEqual([
      ['03cabe7e', 57, 15], ['0b05fdf0', 39, 13], ['184e2461', 19, 3], ['22e2445c', 13, 4], ['4c312c8b', 13, 1],
      ['2c7238b7', 12, 10], ['f329a7dd', 11, 4], ['daf7426d', 10, 7], ['0c0784d8', 10, 5], ['056a478a', 10, 1],
    ])
    // Admiration for handmade craftsmanship is a makers' theme on Everything
    // (0.71 makers); its 19 buyer videos put it on the Buyers board, Now 10+.
    expect(board.rows.find((t) => t.registryId === '184e2461')?.flags).toEqual(['now_10'])
    // Interest in shipping was at 10 last month on Everything and on Buyers: no flag.
    expect(board.rows.find((t) => t.registryId === '2c7238b7')?.flags).toEqual([])
  })

  it('takes a voice only from a buyer’s video, and none whose segment was not read', () => {
    expect(cv.readsSegments).toBe(true)
    const got = cv.voices([{ segment: 'market' }, { segment: 'maker' }, { segment: 'noise' }, { segment: null }, {}])
    expect(got).toEqual([{ segment: 'market' }])
  })

  it('prints where its videos came from only when no search was added (0 of the view’s k), and not the videos in themes or the pane’s kinds', () => {
    expect(cv.provenance({ fromNewSearches: 0, of: 88 }, 57)).toEqual({ fromNewSearches: 0, of: 57 })
    expect(cv.provenance({ fromNewSearches: 57, of: 88 }, 57)).toBeNull()
    expect(cv.provenance(null, 57)).toBeNull()
    expect(cv.inThemes(325)).toBeNull()
    expect(cv.kinds([{ kind: 'purchase_intent', label: 'Ready to buy', videos: 13 }])).toBeNull()
  })

  it('reads the market’s size on the lens, with no platform split, and says what it set aside', () => {
    const out = cv.finish(stored.market, { month: MONTH, rivalAudiences: RIVALS, params: { view: 'buyers' } })
    expect(out.market).toEqual({ videos: 381, comments: 9799, category: 355, rivalFiled: 26, platformMix: [] })
    expect(out.view?.view).toBe('buyers')
    expect(noteText(out.view?.note ?? null)).toBe('273 makers’ and off-topic videos set aside')
    expect(out.view?.choices.map((c) => c.href)).toEqual(['/dashboard/voice', '/dashboard/voice?view=buyers', '/dashboard/voice?view=makers'])
  })
})

describe('Makers', () => {
  const cv = conversationView({ cfg: VIEWS_ONLY, asked: 'makers', read: { state: 'read', view: 'makers', lens: 'makers', rows: SEALAND_LENS.makers }, month: MONTH, prevMonth: PREV })

  it('reads the makers’ own videos: 220 in the category, the makers’ themes on the board with no makers line', () => {
    const board = boardOn(cv)
    expect(board.n).toBe(220)
    expect(board.prev?.n).toBe(110)
    expect(board.makers).toBeNull()
    expect(board.rows.slice(0, 3).map((t) => [t.label, t.k])).toEqual([
      ['Love for creative upcycling', 63], ['Admiration for handmade craftsmanship', 46], ['Buying interest and ordering questions', 31],
    ])
    expect(cv.voices([{ segment: 'market' }, { segment: 'maker' }])).toEqual([{ segment: 'maker' }])
    const out = cv.finish(stored.market, { month: MONTH, rivalAudiences: RIVALS, params: { view: 'makers' } })
    expect(out.market).toMatchObject({ videos: 220, category: 220, rivalFiled: 0 })
    expect(noteText(out.view?.note ?? null)).toBe('Makers’ own videos only')
  })
})

describe('the default once off-topic videos are set aside (`market`)', () => {
  const cv = conversationView({ cfg: ALL_ON, asked: 'market', read: { state: 'read', view: 'market', lens: 'all_but_noise', rows: SEALAND_LENS.all_but_noise }, month: MONTH, prevMonth: PREV })

  it('keeps the makers in, grouped on their share of what is left once the off-topic videos are out', () => {
    expect(cv.segments('measured')).toBe('measured')
    const shares = viewShares('market', { maker: new Map([['a', 0.2], ['b', 0.5], ['c', null]]), noise: new Map([['a', 0.2], ['b', 0], ['c', 0.1]]) })
    expect(shares?.maker.get('a')).toBeCloseTo(0.25, 10)
    expect(shares?.maker.get('b')).toBe(0.5)
    expect(shares?.maker.get('c')).toBeNull()
    expect([...(shares?.noise.values() ?? [])]).toEqual([0, 0, 0])
    const board = boardOn(cv)
    expect(board.n).toBe(575)
    // The seven maker-led themes Everything groups stay grouped with the off-topic videos out.
    expect(board.makers?.map((t) => t.registryId)).toEqual(['faaa44da', '184e2461', 'e514443f', 'fb4361bb', 'c32c2efd', 'daf78e91', '8b33a663'])
    expect(board.setAside ?? []).toEqual([])
  })

  it('takes a voice from any video but an off-topic one, and says how many were set aside', () => {
    expect(keptSegments('market')).toEqual(new Set(['market', 'maker']))
    expect(cv.voices([{ segment: 'noise' }, { segment: 'maker' }, { segment: 'market' }])).toEqual([{ segment: 'maker' }, { segment: 'market' }])
    const out = cv.finish(stored.market, { month: MONTH, rivalAudiences: RIVALS, params: {} })
    expect(out.market.videos).toBe(601)
    expect(noteText(out.view?.note ?? null)).toBe('53 off-topic videos set aside')
    expect(out.view?.choices.find((c) => c.active)?.label).toBe('Everything')
  })
})

describe('a view not read yet', () => {
  it('reads the stored rows and says which view is not read for the month', () => {
    const cv = conversationView({ cfg: VIEWS_ONLY, asked: 'buyers', read: { state: 'not_read', view: 'buyers', lens: 'buyers', why: 'missing' }, month: MONTH, prevMonth: PREV })
    expect(cv.lens).toBe(false)
    expect(cv.n(625)).toBe(625)
    const out = cv.finish(stored.market, { month: MONTH, rivalAudiences: RIVALS, params: { view: 'buyers' } })
    expect(out.market).toBe(stored.market)
    expect(out.view?.view).toBe('everything')
    expect(noteText(out.view?.note ?? null)).toBe('The Buyers view is not read for September yet')
  })
})

describe('voiceSurfaceHref keeps the view', () => {
  it('so a theme opened on the Buyers view opens on the Buyers view', () => {
    expect(voiceSurfaceHref({ month: '2026-09', view: 'buyers' }, { theme: 't1' })).toBe('/dashboard/voice?month=2026-09&theme=t1&view=buyers')
    expect(voiceSurfaceHref({ theme: 't1' })).toBe('/dashboard/voice?theme=t1')
  })
})
