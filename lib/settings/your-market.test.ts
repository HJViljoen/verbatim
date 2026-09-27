import { describe, expect, it } from 'vitest'

import { buildPlatformTasks } from '../gather/gather'
import type { GatherConfig } from '../gather/types'
import { biggestSearchLine, marketPlatformMix, searchCapLine, searchPlan, SEARCH_CAP, termShares } from './your-market'

// Settings › Tracking › Your market (WP3.10). Figures: staging, read-only,
// 27 Sep 2026 (Sealand, September): 654 market videos, YouTube 289 · TikTok
// 183 · Reddit 128 · Instagram 54; upcycled bag 110 videos, 92 of them makers';
// the search set 3 · 7 · 12 terms on four platforms and 3 communities.

const SEALAND = {
  brand_keywords: ['sealand gear', '#sealandgear', 'sealand bag'],
  competitor_keywords: ['cotopaxi backpack', 'freitag bag', 'rareform bag', 'frtg', 'north face backpack', 'patagonia black hole', 'fombrand'],
  industry_keywords: ['eco backpack', 'recycled bag', 'sustainable backpack', 'upcycled bag', 'recycled sailcloth', 'sailcloth bag', 'upcycled backpack', 'handmade bag', 'sustainable fashion', 'travel gear', 'made from waste', 'locally made south africa'],
  platforms: ['youtube', 'tiktok', 'instagram', 'reddit'],
  subreddits: [
    { name: 'backpacks', status: 'active' }, { name: 'onebag', status: 'active' }, { name: 'travelgear', status: 'active' },
    { name: 'bags', status: 'rejected' },
  ],
}

describe('searchPlan', () => {
  it('counts Sealand\'s set as 113 of 120 (F13): five searches a term on four platforms, three communities', () => {
    const plan = searchPlan(SEALAND, true)
    expect(plan.groups.map((g) => [g.label, g.terms, g.searches])).toEqual([
      ['Your name', 3, 15], ['Brands you track', 7, 35], ['The category', 12, 60], ['Communities', 3, 3],
    ])
    expect(plan.used).toBe(113)
    expect(plan.cap).toBe(SEARCH_CAP)
    expect(searchCapLine(plan)).toBe('113 of 120 searches each update · 7 free')
  })

  it('is the gather\'s own plan, whatever the set: the same count buildPlatformTasks makes', () => {
    const prev = process.env.REDDIT_DISCOVERY_ENABLED
    try {
      for (const on of [true, false]) {
        process.env.REDDIT_DISCOVERY_ENABLED = on ? '1' : ''
        for (const cfg of [SEALAND, { ...SEALAND, brand_keywords: ['sealand gear', 'upcycled bag'], platforms: ['tiktok', 'instagram'] }]) {
          const tasks = cfg.platforms.flatMap((p) => buildPlatformTasks({ ...cfg, max_videos: 30 } as unknown as GatherConfig, p as never))
          expect(searchPlan(cfg, on).used).toBe(tasks.length)
        }
      }
    } finally {
      process.env.REDDIT_DISCOVERY_ENABLED = prev
    }
  })

  it('says when the plan is over the cap', () => {
    expect(searchCapLine({ groups: [], used: 124, cap: 120 })).toBe('124 of 120 searches each update · 4 over, so the update drops the last of them')
  })
})

describe('marketPlatformMix', () => {
  it('counts the market\'s videos by platform, biggest first', () => {
    const videos = [
      ...Array.from({ length: 289 }, (_, i) => ({ id: `y${i}`, platform: 'youtube' })),
      ...Array.from({ length: 54 }, (_, i) => ({ id: `i${i}`, platform: 'instagram' })),
      ...Array.from({ length: 183 }, (_, i) => ({ id: `t${i}`, platform: 'tiktok' })),
      ...Array.from({ length: 128 }, (_, i) => ({ id: `r${i}`, platform: 'reddit' })),
    ]
    expect(marketPlatformMix(videos).map((p) => [p.label, p.videos])).toEqual([['YouTube', 289], ['TikTok', 183], ['Reddit', 128], ['Instagram', 54]])
  })
})

describe('termShares', () => {
  const market = [{ id: 'a', platform: 'youtube' }, { id: 'b', platform: 'tiktok' }, { id: 'c', platform: 'reddit' }, { id: 'd', platform: 'tiktok' }]
  const provenance = new Map([
    ['a', { first_terms: ['upcycled bag', 'handmade bag'], first_subreddits: [] }],
    ['b', { first_terms: ['upcycled bag'], first_subreddits: [] }],
    ['c', { first_terms: [], first_subreddits: ['r/onebag'] }],
  ])
  it('counts a video for each search that first found it, the makers among them, and the videos with no record', () => {
    const out = termShares({ market, provenance, segments: new Map([['a', 'maker'], ['b', 'market'], ['c', 'market']]) })
    expect(out.rows).toEqual([
      { search: 'upcycled bag', videos: 2, makers: 1 },
      { search: 'handmade bag', videos: 1, makers: 1 },
      { search: 'r/onebag', videos: 1, makers: 0 },
    ])
    expect(out.unknown).toBe(1)
  })
  it('leaves makers unmeasured without segments', () => {
    expect(termShares({ market, provenance, segments: null }).rows[0]).toEqual({ search: 'upcycled bag', videos: 2, makers: null })
  })
})

describe('biggestSearchLine', () => {
  it('says mostly makers at half or more (upcycled bag: 92 of its 110)', () => {
    expect(biggestSearchLine([{ search: 'upcycled bag', videos: 110, makers: 92 }])).toEqual({ search: 'upcycled bag', videos: 110, makers: 92, mostlyMakers: true })
    expect(biggestSearchLine([{ search: 'eco backpack', videos: 48, makers: 5 }])?.mostlyMakers).toBe(false)
    expect(biggestSearchLine([])).toBeNull()
  })
})
