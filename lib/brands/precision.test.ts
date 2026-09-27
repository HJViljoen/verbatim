import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import { BRAND_PRECISION_FLOOR, BRAND_RULE_VERSION } from './aliases'
import { BRAND_HAND_CHECKS, NAME_READS, brandCountState, clientBrandName, nameChecked, noiseWords, type BrandHandCheck } from './precision'

// Which brands the page may count (WP2.6; the lead's rulings of 26 and 27
// Sep): a production hand check at the floor counts, under it is "mostly
// another word", and anything else, a research or staging sample included,
// is "not counted yet" until the Mon 5 Oct production check.

const EIGHT = ['Sealand', 'Cotopaxi', 'Freitag', 'Rareform', 'The North Face', 'Patagonia', 'Freedom of Movement', 'Old School']
const prod = (read: number, brand: number): BrandHandCheck =>
  ({ read, brand, on: '2026-10-05', where: 'production', ruleVersion: BRAND_RULE_VERSION, of: 'September', source: 'the Mon 5 Oct hand check' })

describe('brandCountState', () => {
  it('counts no brand as shipped: all eight wait for the Mon 5 Oct production check, the research sample’s three included', () => {
    for (const brand of EIGHT) expect(brandCountState(SEALAND_CLIENT_ID, brand), brand).toBe('not_yet')
    expect(BRAND_HAND_CHECKS[SEALAND_CLIENT_ID]).toEqual({})
    expect(nameChecked(SEALAND_CLIENT_ID)).toBe(false)
  })

  it('never counts on a check from anywhere but production (the research’s staging pool: Cotopaxi 14 of 16)', () => {
    const staging = { [SEALAND_CLIENT_ID]: { Cotopaxi: { ...prod(16, 14), where: 'staging' } as unknown as BrandHandCheck } }
    expect(brandCountState(SEALAND_CLIENT_ID, 'Cotopaxi', staging)).toBe('not_yet')
  })

  it('counts a production check at the floor, and reads one under it as mostly another word', () => {
    const checks = { [SEALAND_CLIENT_ID]: { Cotopaxi: prod(20, 17), Freitag: prod(20, 3) } }
    expect(17 / 20).toBeGreaterThanOrEqual(BRAND_PRECISION_FLOOR)
    expect(brandCountState(SEALAND_CLIENT_ID, 'Cotopaxi', checks)).toBe('counted')
    expect(brandCountState(SEALAND_CLIENT_ID, 'Freitag', checks)).toBe('noise')
    expect(noiseWords('Freitag')).toBe('mostly the German word for Friday · not counted')
    expect(noiseWords('Old School')).toBe('mostly another word · not counted')
  })

  it('never counts on a check read under other rules: an alias or exclusion change sends the brand back to not counted yet', () => {
    expect(BRAND_RULE_VERSION).toBe('brands_v1')
    const older = { [SEALAND_CLIENT_ID]: { Cotopaxi: { ...prod(20, 20), ruleVersion: 'brands_v0' } } }
    expect(brandCountState(SEALAND_CLIENT_ID, 'Cotopaxi', older)).toBe('not_yet')
    const unnamed = { [SEALAND_CLIENT_ID]: { Cotopaxi: { ...prod(20, 20), ruleVersion: undefined } as unknown as BrandHandCheck } }
    expect(brandCountState(SEALAND_CLIENT_ID, 'Cotopaxi', unnamed)).toBe('not_yet')
    // A mostly-another-word reading under other rules is no reading either.
    expect(brandCountState(SEALAND_CLIENT_ID, 'Freitag', { [SEALAND_CLIENT_ID]: { Freitag: { ...prod(20, 3), ruleVersion: 'brands_v0' } } })).toBe('not_yet')
    expect(nameChecked(SEALAND_CLIENT_ID, { [SEALAND_CLIENT_ID]: { Sealand: { ...prod(9, 9), ruleVersion: 'brands_v2' } } })).toBe(false)
  })

  it('never counts on a malformed check, or for another tenant', () => {
    const bad = { [SEALAND_CLIENT_ID]: { Patagonia: prod(0, 0) } }
    expect(brandCountState(SEALAND_CLIENT_ID, 'Patagonia', bad)).toBe('not_yet')
    expect(brandCountState(SEALAND_CLIENT_ID, 'Patagonia', { [SEALAND_CLIENT_ID]: { Patagonia: prod(10, 11) } })).toBe('not_yet')
    expect(brandCountState('ossur', 'Ottobock')).toBe('not_yet')
  })
})

describe('the name line’s check', () => {
  it('is the client’s own name, checked on production at any precision', () => {
    expect(clientBrandName(SEALAND_CLIENT_ID)).toBe('Sealand')
    expect(clientBrandName('ossur')).toBeNull()
    expect(nameChecked(SEALAND_CLIENT_ID, { [SEALAND_CLIENT_ID]: { Sealand: prod(9, 9) } })).toBe(true)
    expect(nameChecked(SEALAND_CLIENT_ID, { [SEALAND_CLIENT_ID]: { Patagonia: prod(9, 9) } })).toBe(false)
  })

  it('holds no name read yet', () => {
    expect(NAME_READS[SEALAND_CLIENT_ID]).toEqual([])
  })
})
