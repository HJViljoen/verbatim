import { describe, expect, it } from 'vitest'

import { defaultView, parseView, pillOf, VIEW_LENS, viewChoices, viewHref } from './view'

// The views and their addresses (plan WP3.3: "the loaders take `view:
// 'everything' | 'market' | 'buyers' | 'makers'` from `?view=`"; §2.4 C1: "a
// view switch: Everything · Buyers · Makers").

const OFF = { views: false, setAside: false }
const VIEWS_ONLY = { views: true, setAside: false }
const ALL_ON = { views: true, setAside: true }
const BASE = '/dashboard/voice'

describe('the lenses', () => {
  it('reads Everything on the stored rows and each other view on its own lens', () => {
    expect(VIEW_LENS).toEqual({ everything: null, market: 'all_but_noise', buyers: 'buyers', makers: 'makers' })
  })
})

describe('defaultView', () => {
  it('is Everything until off-topic videos are set aside from the default count (decision F)', () => {
    expect(defaultView(null)).toBe('everything')
    expect(defaultView(OFF)).toBe('everything')
    expect(defaultView(VIEWS_ONLY)).toBe('everything')
    expect(defaultView(ALL_ON)).toBe('market')
  })
})

describe('parseView', () => {
  it('reads no parameter while no view is live, so a stored link lands on the page as it reads today', () => {
    for (const raw of ['buyers', 'makers', 'market', 'everything', 'junk', undefined]) {
      expect(parseView(raw, null)).toBe('everything')
      expect(parseView(raw, OFF)).toBe('everything')
    }
  })

  it('takes Buyers and Makers only where they are live, and anything else as the default', () => {
    expect(parseView('buyers', VIEWS_ONLY)).toBe('buyers')
    expect(parseView('makers', VIEWS_ONLY)).toBe('makers')
    expect(parseView('Buyers', VIEWS_ONLY)).toBe('everything')
    expect(parseView(['buyers'], VIEWS_ONLY)).toBe('everything')
    expect(parseView('buyers', { views: false, setAside: true })).toBe('market')
    expect(parseView(undefined, ALL_ON)).toBe('market')
    expect(parseView('everything', ALL_ON)).toBe('everything')
  })
})

describe('the pill', () => {
  it('presses Everything for the default view and for every video, Buyers and Makers for their own', () => {
    expect(pillOf('everything')).toBe('default')
    expect(pillOf('market')).toBe('default')
    expect(pillOf('buyers')).toBe('buyers')
    expect(pillOf('makers')).toBe('makers')
  })

  it('draws nothing where Buyers and Makers are not live: a control that does nothing is not drawn', () => {
    expect(viewChoices(BASE, {}, 'everything', null)).toEqual([])
    expect(viewChoices(BASE, {}, 'everything', OFF)).toEqual([])
    expect(viewChoices(BASE, {}, 'market', { views: false, setAside: true })).toEqual([])
  })

  it('offers the preview’s three, in its order and words, each an address that keeps the page’s own params', () => {
    const got = viewChoices(BASE, { month: '2026-09', theme: 't1', view: 'buyers' }, 'buyers', VIEWS_ONLY)
    expect(got.map((c) => c.label)).toEqual(['Everything', 'Buyers', 'Makers'])
    expect(got.map((c) => c.active)).toEqual([false, true, false])
    expect(got.map((c) => c.href)).toEqual([
      '/dashboard/voice?month=2026-09&theme=t1',
      '/dashboard/voice?month=2026-09&theme=t1&view=buyers',
      '/dashboard/voice?month=2026-09&theme=t1&view=makers',
    ])
  })

  it('points Everything at the default view, which writes no parameter, once off-topic videos are set aside', () => {
    const got = viewChoices(BASE, {}, 'market', ALL_ON)
    expect(got[0]).toMatchObject({ pill: 'default', view: 'market', href: BASE, active: true })
    expect(viewHref(BASE, {}, 'everything', ALL_ON)).toBe('/dashboard/voice?view=everything')
    expect(viewHref(BASE, { view: 'makers', month: '' }, 'everything', VIEWS_ONLY)).toBe(BASE)
  })
})
