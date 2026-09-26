import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import { BRAND_PRECISION_FLOOR } from './aliases'
import { BRAND_HAND_CHECKS, NAME_READS, brandCountState, noiseWords } from './precision'

// Which brands the page may count (WP2.6): a measured precision at the floor
// counts, under it is "mostly another word", unmeasured is "not counted yet"
// (the lead's default of 26 Sep).

describe('brandCountState', () => {
  it('counts the three brands the research measured at the floor (brand-counting.md fact 8)', () => {
    for (const brand of ['Patagonia', 'The North Face', 'Cotopaxi']) {
      expect(brandCountState(SEALAND_CLIENT_ID, brand), brand).toBe('counted')
    }
    expect(BRAND_HAND_CHECKS[SEALAND_CLIENT_ID].Cotopaxi).toMatchObject({ read: 16, brand: 14 })
  })

  it('leaves Freitag, Rareform, Freedom of Movement and Old School "not counted yet" until the Wed 7 Oct hand check', () => {
    for (const brand of ['Freitag', 'Rareform', 'Freedom of Movement', 'Old School']) {
      expect(brandCountState(SEALAND_CLIENT_ID, brand), brand).toBe('not_yet')
    }
  })

  it('reads a check under the floor as mostly another word (Freitag’s bare name, 9 of 39, research fact 8)', () => {
    const checks = { [SEALAND_CLIENT_ID]: { Freitag: { read: 39, brand: 9, on: '2026-09-24', where: 'staging' as const, of: 'the bare name', source: 'research' } } }
    expect(9 / 39).toBeLessThan(BRAND_PRECISION_FLOOR)
    expect(brandCountState(SEALAND_CLIENT_ID, 'Freitag', checks)).toBe('noise')
    expect(noiseWords('Freitag')).toBe('mostly the German word for Friday · not counted')
    expect(noiseWords('Old School')).toBe('mostly another word · not counted')
  })

  it('never counts on a malformed check, or for another tenant', () => {
    const bad = { [SEALAND_CLIENT_ID]: { Patagonia: { read: 0, brand: 0, on: '', where: 'staging' as const, of: '', source: '' } } }
    expect(brandCountState(SEALAND_CLIENT_ID, 'Patagonia', bad)).toBe('not_yet')
    expect(brandCountState('ossur', 'Ottobock')).toBe('not_yet')
  })

  it('holds no name read yet: staging’s September has no match outside your own posts', () => {
    expect(NAME_READS[SEALAND_CLIENT_ID]).toEqual([])
  })
})
