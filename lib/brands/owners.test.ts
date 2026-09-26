import { describe, expect, it } from 'vitest'

import { ownerOfVideos, type IdentityRow } from './owners'

// Whose own post a video is (WP2.6): the census rule, as scripts/brand-mentions.ts
// applies it. Sealand's staging handles (tracking_configs, 26 Sep).

const OWN = { tiktok: 'sealandgear', youtube: 'UCCthtmYgmon7h0meZaC1FEQ', instagram: 'sealandgear' }
const RIVALS = {
  Cotopaxi: { tiktok: 'cotopaxiofficial', youtube: 'UCjGWYNy7xrGOJ72AeMBb-hA', instagram: 'cotopaxi' },
  Patagonia: { tiktok: 'patagonia', youtube: 'UCl3xZ-f3cQhOHvH6f-7-ssQ', instagram: 'patagonia' },
}
const KEY = new Map([['cotopaxi', '6f9ef2d5-23f7-41bf-a1c7-41caf257623e'], ['patagonia', '60a459fe-84b6-4336-b4dd-25ccc8f91277']])

const row = (over: Partial<IdentityRow> & Pick<IdentityRow, 'id' | 'platform'>): IdentityRow => ({
  source: 'discovered', account_name: null, is_client: false, is_competitor: false, competitor_name: null, ...over,
})

describe('ownerOfVideos', () => {
  const rows = [
    row({ id: 'own-post', platform: 'instagram', source: 'owned', account_name: 'sealandgear', is_client: true }),
    row({ id: 'coto-post', platform: 'tiktok', source: 'competitor_owned', account_name: 'cotopaxiofficial', is_competitor: true, competitor_name: 'Cotopaxi' }),
    row({ id: 'found-first', platform: 'instagram', account_name: 'Patagonia' }),
    row({ id: 'stored-name', platform: 'youtube', account_name: 'Cotopaxi Official' }),
    row({ id: 'market', platform: 'tiktok', account_name: 'someone' }),
    row({ id: 'no-account', platform: 'tiktok' }),
  ]
  const owned = [row({ id: 'coto-yt', platform: 'youtube', source: 'competitor_owned', account_name: 'Cotopaxi Official', competitor_name: 'Cotopaxi' })]
  const ownerOf = ownerOfVideos({ rows: new Map(rows.map((r) => [r.id, r])), owned, ownHandles: OWN, competitorHandles: RIVALS, rivalKey: KEY })

  it('reads an own post by its source', () => {
    expect(ownerOf('own-post')).toBe('client')
    expect(ownerOf('coto-post')).toBe('6f9ef2d5-23f7-41bf-a1c7-41caf257623e')
  })

  it('reads a post the keyword gather found first by its account: the configured handle, or a name the owned read stored', () => {
    expect(ownerOf('found-first')).toBe('60a459fe-84b6-4336-b4dd-25ccc8f91277')
    expect(ownerOf('stored-name')).toBe('6f9ef2d5-23f7-41bf-a1c7-41caf257623e')
  })

  it('reads the market as nobody’s, and a video it holds no row for as unknown', () => {
    expect(ownerOf('market')).toBeNull()
    expect(ownerOf('no-account')).toBeNull()
    expect(ownerOf('not-read')).toBeNull()
  })
})
