import { describe, expect, it } from 'vitest'

import { voiceSurfaceHref } from './voice-surface'
import { BRAND_THEMES_SHOWN, brandNamed, buildBrandView } from './voice-surface-brand'

// Conversation filtered by brand (`?brand=`): which brand, and what prints.
// Staging's Sealand (27 Sep, read-only): Cotopaxi 32 videos and 43 themes over
// 23 Jun to 20 Sep; Poler and Topo Designs retired on 9 Sep.

const RIVALS = [
  { name: 'Cotopaxi', retiredAt: null },
  { name: 'The North Face', retiredAt: null },
  { name: 'Poler', retiredAt: '2026-09-09T16:10:00+00:00' },
]
const WINDOW = { from: '2026-06-23', to: '2026-09-21' }

describe('brandNamed', () => {
  it('matches a live tracked brand without case or outer spaces, and answers with its own name', () => {
    expect(brandNamed('cotopaxi', RIVALS)).toBe('Cotopaxi')
    expect(brandNamed(' The north face ', RIVALS)).toBe('The North Face')
  })

  it('is no filter for a retired brand, a name nobody tracks, or nothing', () => {
    expect(brandNamed('Poler', RIVALS)).toBeNull()
    expect(brandNamed('Osprey', RIVALS)).toBeNull()
    expect(brandNamed('', RIVALS)).toBeNull()
    expect(brandNamed(undefined, RIVALS)).toBeNull()
  })

  it('is no filter, never a failed page, for a repeated ?brand= (Next hands over a list)', () => {
    expect(brandNamed(['Cotopaxi', 'Cotopaxi'], RIVALS)).toBeNull()
  })
})

describe('buildBrandView', () => {
  const labels = new Map<string, { label: string | null; kind: string | null }>([
    ['a', { label: 'Durability that earns trust', kind: 'praise' }],
    ['b', { label: 'Carry-on size compliance anxiety', kind: 'question' }],
    ['c', { label: 'Worry about bag theft', kind: 'pain_point' }],
    ['d', { label: 'Admiration for compact packing', kind: 'praise' }],
    ['e', { label: null, kind: 'praise' }],
  ])
  const readings = [
    { themeId: 'a', videos: 7 },
    { themeId: 'b', videos: 12 },
    { themeId: 'c', videos: 2 },
    { themeId: 'd', videos: 2 },
    { themeId: 'e', videos: 3 },
    { themeId: 'f', videos: 0 },
  ]

  it('lists the brand’s themes biggest first, a tie by label, with its audience and window', () => {
    const v = buildBrandView({ name: 'Cotopaxi', window: WINDOW, videos: 32, readings, labels, all: false })
    expect(v.audience).toBe('competitor:Cotopaxi')
    expect(v.window).toEqual(WINDOW)
    expect(v.videos).toBe(32)
    expect(v.themes?.map((t) => [t.label, t.videos])).toEqual([
      ['Carry-on size compliance anxiety', 12],
      ['Durability that earns trust', 7],
      ['Admiration for compact packing', 2],
      ['Worry about bag theft', 2],
    ])
  })

  it('leaves out a theme with no label or no video, as the month board does', () => {
    const v = buildBrandView({ name: 'Cotopaxi', window: WINDOW, videos: 32, readings, labels, all: false })
    expect(v.total).toBe(4)
    expect(v.themes?.some((t) => t.registryId === 'e' || t.registryId === 'f')).toBe(false)
  })

  it('prints the first twelve and counts the rest; every one under `all`', () => {
    const many = Array.from({ length: 43 }, (_, i) => ({ themeId: `t${String(i).padStart(2, '0')}`, videos: 43 - i }))
    const named = new Map(many.map((r) => [r.themeId, { label: `Theme ${r.themeId}`, kind: 'praise' }]))
    const cut = buildBrandView({ name: 'Cotopaxi', window: WINDOW, videos: 32, readings: many, labels: named, all: false })
    expect(cut.themes).toHaveLength(BRAND_THEMES_SHOWN)
    expect(cut.total).toBe(43)
    expect(cut.all).toBe(false)
    const every = buildBrandView({ name: 'Cotopaxi', window: WINDOW, videos: 32, readings: many, labels: named, all: true })
    expect(every.themes).toHaveLength(43)
    expect(every.all).toBe(true)
  })

  it('says "not read" with a null, never an empty list', () => {
    const v = buildBrandView({ name: 'Cotopaxi', window: WINDOW, videos: null, readings: null, labels: new Map(), all: false })
    expect(v.themes).toBeNull()
    expect(v.videos).toBeNull()
    expect(v.total).toBe(0)
  })
})

describe('voiceSurfaceHref under a brand', () => {
  it('keeps the brand through the page’s own links, after the month, and drops it on null', () => {
    expect(voiceSurfaceHref({ month: '2026-08', brand: 'Cotopaxi' }, { persona: 'p1' })).toBe('/dashboard/voice?month=2026-08&brand=Cotopaxi&persona=p1')
    expect(voiceSurfaceHref({ brand: 'The North Face' }, { board: 'all' })).toBe('/dashboard/voice?brand=The+North+Face&board=all')
    expect(voiceSurfaceHref({ brand: 'Cotopaxi', board: 'all' }, { brand: null, board: null })).toBe('/dashboard/voice')
  })
})
