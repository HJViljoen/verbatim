import { describe, it, expect } from 'vitest'

import { fromNewSearches, searchesAddedIn } from './provenance'

// Sealand's September term changes (GC F2 / the preview's record): 13 Sep
// added "handmade bag", "sustainable fashion", "travel gear" and "frtg"; the
// 9 Sep swap added seven and removed seven; r/onebag went active on 9 Sep. An
// August row and a strike-only community row add nothing.
const ROWS = [
  { surface: 'terms', changed_at: '2026-09-13T10:00:58.000Z', before: ['upcycled bag', 'recycled bag'], after: ['upcycled bag', 'recycled bag', 'handmade bag', 'sustainable fashion', 'travel gear'] },
  { surface: 'terms', changed_at: '2026-09-13T10:00:58.000Z', before: [], after: ['frtg'] },
  { surface: 'terms', changed_at: '2026-09-09T18:17:56.000Z', before: ['poler'], after: null },
  { surface: 'terms', changed_at: '2026-09-09T18:17:56.000Z', before: null, after: ['sailcloth bag'] },
  { surface: 'subreddits', changed_at: '2026-09-09T00:00:00.000Z', before: { name: 'onebag', status: 'candidate' }, after: { name: 'onebag', status: 'active' } },
  { surface: 'terms', changed_at: '2026-08-17T00:00:00.000Z', before: [], after: ['eco backpack'] },
] as const

describe('the searches added in a month', () => {
  it('reads the terms and communities added in September, and nothing from August', () => {
    const added = searchesAddedIn('2026-09-01', ROWS as never)
    expect([...added.terms].sort()).toEqual(['frtg', 'handmade bag', 'sailcloth bag', 'sustainable fashion', 'travel gear'])
    expect([...added.subreddits]).toEqual(['onebag'])
  })

  it('leaves out the exclusions list, as Settings › What we changed does (the 17 Sep script touched both)', () => {
    const script = [
      { surface: 'terms', field: 'industry_keywords', changed_at: '2026-09-17T16:02:56.000Z', before: [], after: ['made from waste'] },
      { surface: 'terms', field: 'exclude_terms', changed_at: '2026-09-17T16:02:56.000Z', before: [], after: ['volcano', 'hip hop'] },
    ]
    expect([...searchesAddedIn('2026-09-01', script as never).terms]).toEqual(['made from waste'])
  })
})

describe('a theme’s videos found only by searches added in the month', () => {
  const added = searchesAddedIn('2026-09-01', ROWS as never)
  it('counts a video every one of whose first searches was added that month', () => {
    const got = fromNewSearches(['v1', 'v2', 'v3', 'v4'], [
      { video_id: 'v1', first_terms: ['handmade bag'], first_subreddits: [] },
      { video_id: 'v2', first_terms: ['travel gear', 'upcycled bag'], first_subreddits: [] },
      { video_id: 'v3', first_terms: [], first_subreddits: ['r/onebag'] },
      { video_id: 'v4', first_terms: [], first_subreddits: [] },
    ], added)
    expect(got).toEqual({ fromNewSearches: 2, of: 4 })
  })

  it('is not measured (null) with no provenance at all, never zero', () => {
    expect(fromNewSearches(['v1'], [], added)).toBeNull()
  })
})
