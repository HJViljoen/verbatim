import { describe, expect, it } from 'vitest'

import { BRAND_RULE_VERSION } from '../brands/aliases'
import type { PlannedMention } from '../brands/mentions'
import { SEALAND_CLIENT_ID } from '../config'
import type { BrandLayer } from './overview-brands'
import { updateBrandCounts } from './week-brands'

// Finish-list item 7 (29 Sep): This week's "Videos naming them" counts the
// update's videos in the month's market that name the brand, on the Brands
// page's basis, and states the month's figure beside it. It printed every
// video the rival searches gathered (Freitag 149 against 7 on Brands).

const mention = (video: string, brandKey: string, source: 'content' | 'comment' = 'content', month: string | null = null): PlannedMention => ({
  brand: brandKey,
  excerpt: null,
  row: { client_id: SEALAND_CLIENT_ID, video_id: video, brand_key: brandKey, source, field: null, comment_id: null, comment_month: month, method: 'rule', rule_version: BRAND_RULE_VERSION },
})

function layer(over: Partial<BrandLayer> = {}): BrandLayer {
  const planned = [
    // Freitag: named in v1, v2 (this update) and v3, v4 (earlier in the month);
    // v9 is its own post and never counts; v7 is outside the month's market.
    mention('v1', 'k-freitag'), mention('v2', 'k-freitag', 'comment', '2026-09-01'),
    mention('v3', 'k-freitag'), mention('v4', 'k-freitag'), mention('v9', 'k-freitag'), mention('v7', 'k-freitag'),
    // A comment naming Cotopaxi dated in August does not count for September.
    mention('v1', 'k-cotopaxi', 'comment', '2026-08-01'), mention('v5', 'k-cotopaxi'),
  ]
  return {
    month: '2026-09-01',
    market: ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v9'],
    rivals: [
      { name: 'Freitag', brandKey: 'k-freitag' },
      { name: 'Cotopaxi', brandKey: 'k-cotopaxi' },
      { name: 'Freedom of Movement', brandKey: 'k-fom' },
      { name: 'Old School', brandKey: 'k-old' },
    ],
    mentions: [],
    planned,
    layerRead: true,
    withRows: new Set(planned.map((p) => p.row.brand_key)),
    identity: new Map(),
    ownerOf: (id) => (id === 'v9' ? 'k-freitag' : null),
    rivalFound: null,
    ...over,
  }
}

// Every video the update read, rival-search finds included: v6 names nobody,
// v7 is outside the market, v9 is Freitag's own post.
const UPDATE = ['v1', 'v2', 'v5', 'v6', 'v7', 'v9', 'not-in-market']
const BRANDS = ['Freitag', 'Cotopaxi', 'Freedom of Movement', 'Old School']

describe('updateBrandCounts (This week, "Videos naming them")', () => {
  it('counts the update’s market videos that name the brand, its own posts out, with the month’s figure beside it', () => {
    const out = updateBrandCounts({ clientId: SEALAND_CLIENT_ID, layer: layer(), updateVideos: UPDATE, brands: BRANDS })
    expect(out.get('Freitag')).toEqual({ videos: 2, monthVideos: 4, note: null })
    expect(out.get('Cotopaxi')).toEqual({ videos: 1, monthVideos: 1, note: null })
  })

  it('never prints more for the update than the month holds', () => {
    const out = updateBrandCounts({ clientId: SEALAND_CLIENT_ID, layer: layer(), updateVideos: layer().market, brands: BRANDS })
    for (const b of BRANDS) {
      const c = out.get(b)!
      if (c.videos != null) expect(c.videos).toBeLessThanOrEqual(c.monthVideos ?? -1)
    }
  })

  it('prints a zero for a brand production’s list held no match of, where the month holds none either', () => {
    const out = updateBrandCounts({ clientId: SEALAND_CLIENT_ID, layer: layer(), updateVideos: UPDATE, brands: BRANDS })
    expect(out.get('Freedom of Movement')).toEqual({ videos: 0, monthVideos: 0, note: null })
    expect(out.get('Old School')).toEqual({ videos: 0, monthVideos: 0, note: null })
  })

  it('does not count a no-match brand the layer now names: not counted yet, as on Brands', () => {
    const l = layer({ planned: [...layer().planned, mention('v5', 'k-fom')] })
    const out = updateBrandCounts({ clientId: SEALAND_CLIENT_ID, layer: l, updateVideos: UPDATE, brands: BRANDS })
    expect(out.get('Freedom of Movement')).toEqual({ videos: null, monthVideos: null, note: 'not counted yet' })
  })

  it('prints no figure where the layer was not read, and never the rival searches’ gathered count', () => {
    for (const l of [null, layer({ layerRead: false })]) {
      const out = updateBrandCounts({ clientId: SEALAND_CLIENT_ID, layer: l, updateVideos: UPDATE, brands: BRANDS })
      expect(out.get('Freitag')).toEqual({ videos: null, monthVideos: null, note: 'not counted yet' })
    }
  })

  it('prints no figure for a checked brand the mention layer holds no row of, as Brands does (never a 0)', () => {
    const l = layer({ planned: layer().planned.filter((p) => p.row.brand_key !== 'k-freitag'), withRows: new Set(['k-cotopaxi']) })
    const out = updateBrandCounts({ clientId: SEALAND_CLIENT_ID, layer: l, updateVideos: UPDATE, brands: BRANDS })
    expect(out.get('Freitag')).toEqual({ videos: null, monthVideos: null, note: 'not counted yet' })
    expect(out.get('Cotopaxi')).toEqual({ videos: 1, monthVideos: 1, note: null })
  })

  it('prints no figure for a brand production has not hand-checked', () => {
    const l = layer({ rivals: [...layer().rivals, { name: 'Rareform', brandKey: 'k-rare' }] })
    const out = updateBrandCounts({ clientId: SEALAND_CLIENT_ID, layer: l, updateVideos: UPDATE, brands: [...BRANDS, 'Rareform'], checks: {} })
    expect(out.get('Freitag')?.note).toBe('not counted yet')
    expect(out.get('Rareform')?.note).toBe('not counted yet')
  })
})
