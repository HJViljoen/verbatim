import { describe, expect, it } from 'vitest'

import type { Competitor } from '@/lib/rivals'
import { brandAccounts, handleOf, ownAccountRows, whatYouTrack } from './settings'
import { saveWords, TERM_GROUPS } from './settings-words'
import { TENANT_LOCK_REFUSAL } from '@/lib/tenant-locks'

// Settings › What you track (Page-Settings artboard): the stored config,
// shaped for the page. Pure.

const rival = (name: string, over: Partial<Competitor> = {}): Competitor =>
  ({ id: `id-${name}`, client_id: 'c', name, slug: name.toLowerCase(), first_seen_at: null, retired_at: null, superseded_by: null, ...over }) as Competitor

const config = {
  brand_keywords: ['sealand gear', '#sealandgear', 'sealand bag'],
  industry_keywords: ['eco backpack', 'handmade bag'],
  competitor_keywords: ['cotopaxi backpack', 'freitag bag'],
  exclude_terms: ['argentina', 'chile'],
  competitor_names: ['The North Face', 'Cotopaxi', 'Freitag', 'Old School'],
  competitor_handles: {
    Cotopaxi: { instagram: 'cotopaxi', tiktok: 'cotopaxiofficial', youtube: 'UCabc123' },
    freitag: { tiktok: 'freitaglab', instagram: 'freitaglab' },
  },
  own_handles: { tiktok: 'sealandgear', instagram: 'sealandgear', youtube: 'UCsealand' },
  subreddits: [
    { name: 'travelgear', status: 'active', discovered_at: '2026-09-01' },
    { name: 'backpacks', status: 'active', discovered_at: '2026-09-01' },
    { name: 'onebag', status: 'active', discovered_at: '2026-09-01' },
    { name: 'hiking', status: 'rejected', discovered_at: '2026-09-01' },
    { name: 'camping', status: 'stopped', discovered_at: '2026-09-01' },
  ],
}

describe('whatYouTrack', () => {
  const m = whatYouTrack({ tenant: 'Sealand', config, rivals: [rival('Cotopaxi'), rival('Freitag'), rival('Old School', { retired_at: '2026-09-01' })], notMine: 0 })

  it('keeps the four term lists as stored', () => {
    expect(m.terms).toEqual({
      brand_keywords: ['sealand gear', '#sealandgear', 'sealand bag'],
      industry_keywords: ['eco backpack', 'handmade bag'],
      competitor_keywords: ['cotopaxi backpack', 'freitag bag'],
      exclude_terms: ['argentina', 'chile'],
    })
    expect(TERM_GROUPS.map((g) => g.name)).toEqual(['Your name', 'The category', 'Brands you track', 'Not these'])
  })

  it('lists the brands A to Z with their accounts in the artboard\'s order, and the identity a rename needs', () => {
    expect(m.brands.map((b) => b.name)).toEqual(['Cotopaxi', 'Freitag', 'Old School', 'The North Face'])
    expect(m.brands[0]).toEqual({
      name: 'Cotopaxi', id: 'id-Cotopaxi',
      accounts: [{ platform: 'Instagram', handle: '@cotopaxi' }, { platform: 'TikTok', handle: '@cotopaxiofficial' }, { platform: 'YouTube', handle: null }],
    })
    // Handles are found whatever the key's case; a retired identity is no identity.
    expect(m.brands[1].accounts.map((a) => a.handle)).toEqual(['@freitaglab', '@freitaglab'])
    expect(m.brands[2].id).toBeNull()
    expect(m.brands[3].accounts).toEqual([])
    expect(m.names).toEqual(config.competitor_names)
  })

  it('lists the watched communities only, A to Z', () => {
    expect(m.communities).toEqual(['backpacks', 'onebag', 'travelgear'])
  })

  it('prints your accounts as the artboard does: @handles, and a channel by your name', () => {
    expect(m.ownAccounts).toEqual([
      { platform: 'Instagram', value: '@sealandgear', mono: true },
      { platform: 'TikTok', value: '@sealandgear', mono: true },
      { platform: 'YouTube', value: 'Sealand’s channel', mono: false },
    ])
  })

  it('survives an empty config', () => {
    const empty = whatYouTrack({ tenant: '', config: null, rivals: [], notMine: null })
    expect(empty.brands).toEqual([])
    expect(empty.communities).toEqual([])
    expect(empty.ownAccounts).toEqual([])
  })
})

describe('accounts', () => {
  it('handleOf: one @, and a YouTube channel id is no handle', () => {
    expect(handleOf('instagram', '@@sealand')).toBe('@sealand')
    expect(handleOf('youtube', 'UC123')).toBeNull()
    expect(handleOf('youtube', '@sealand')).toBe('@sealand')
    expect(handleOf('tiktok', '  ')).toBeNull()
  })
  it('brandAccounts and ownAccountRows skip a platform with no account', () => {
    expect(brandAccounts({ youtube: '', tiktok: 'x' })).toEqual([{ platform: 'TikTok', handle: '@x' }])
    expect(ownAccountRows({ youtube: 'UC1' }, '')).toEqual([{ platform: 'YouTube', value: 'Your channel', mono: false }])
  })
})

describe('saveWords: a save in the client\'s words', () => {
  it('says the date a queued edit takes effect, and nothing about searches or comparisons', () => {
    const w = saveWords({ ok: true, message: 'Queued for 1 January 2027. Searches are held still until then so October and November can be compared.', queued: '2027-01-01' })
    expect(w).toBe('Saved. This takes effect on 1 January 2027.')
  })
  it('turns the lock\'s refusal into a date and an address', () => {
    const w = saveWords({ ok: false, message: TENANT_LOCK_REFUSAL.tracking }, [TENANT_LOCK_REFUSAL.tracking])
    expect(w).toMatch(/^This can change from 1 January\. Write to \S+@\S+ and we will note it\.$/)
    expect(w).not.toMatch(/search|compar|update/i)
  })
  it('says Saved for a save, keeps a validation message, and says nothing before a save', () => {
    expect(saveWords({ ok: true, message: 'Saved. Your next update searches these terms.' })).toBe('Saved.')
    expect(saveWords({ ok: false, message: 'Could not save: keep at most 15 terms for the category' })).toBe('Could not save: keep at most 15 terms for the category')
    expect(saveWords({ ok: false, message: '' })).toBe('')
    expect(saveWords({ ok: true, message: 'x', unchanged: true })).toBe('Nothing to change: that is already on the list.')
  })
})
