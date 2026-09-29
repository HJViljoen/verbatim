import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import { BRAND_PRECISION_FLOOR, BRAND_RULE_VERSION } from './aliases'
import { BRAND_HAND_CHECKS, NAME_READS, NONE_FOUND, brandCountState, clientBrandName, nameChecked, nameNoMatch, noiseWords, type BrandHandCheck, type HandCheckPart } from './precision'

// Which brands the page may count (WP2.6; the lead's rulings of 26 and 27
// Sep): a production hand check at the floor counts, under it is "mostly
// another word", and anything else, a research or staging sample included,
// is "not counted yet" until the Mon 5 Oct production check.

const EIGHT = ['Sealand', 'Cotopaxi', 'Freitag', 'Rareform', 'The North Face', 'Patagonia', 'Freedom of Movement', 'Old School']
/** A production entry: the headline set read in full, and a sample of the
 *  rest (the defaults read no headline match). */
const prod = (read: number, brand: number, headline: HandCheckPart = { read: 0, brand: 0 }): BrandHandCheck =>
  ({ headline, rest: { read, brand }, on: '2026-10-05', where: 'production', ruleVersion: BRAND_RULE_VERSION, of: 'September', source: 'the Mon 5 Oct hand check' })

describe('production’s hand check of 27 Sep (data/hand-check-brands-prod-20260927T135758Z.md)', () => {
  const read = { on: '2026-09-27', where: 'production', ruleVersion: 'brands_v1', of: 'brands_v1 matches, window 2026-08-01 to 2026-10-01, every Sealand match and up to 30 a brand', source: 'data/hand-check-brands-prod-20260927T135758Z.md' }
  const A8 = 'a8fdd6fe-e2d6-434c-a207-6f17eb3f9b26'

  it('holds one entry per brand, all eight, as the sheet’s Record lines read', () => {
    expect(BRAND_HAND_CHECKS[SEALAND_CLIENT_ID]).toEqual({
      Sealand: { headline: { read: 2, brand: 2 }, rest: { read: 0, brand: 0 }, ...read },
      Cotopaxi: { headline: { read: 7, brand: 7 }, rest: { read: 30, brand: 30 }, ...read },
      Freitag: { headline: { read: 2, brand: 2 }, rest: { read: 10, brand: 10 }, ...read },
      Rareform: { headline: { read: 2, brand: 2 }, rest: { read: 0, brand: 0 }, ...read },
      'The North Face': { headline: { read: 26, brand: 26 }, rest: { read: 30, brand: 30 }, ...read },
      Patagonia: { headline: { read: 26, brand: 26 }, rest: { read: 30, brand: 30 }, ...read },
      'Freedom of Movement': { matches: 'none', ...read },
      'Old School': { matches: 'none', ...read },
    })
    expect(Object.keys(BRAND_HAND_CHECKS[SEALAND_CLIENT_ID]).sort()).toEqual([...EIGHT].sort())
  })

  it('counts the six with matches, every part at 1.00, and finds none of the other two', () => {
    for (const brand of ['Sealand', 'Cotopaxi', 'Freitag', 'Rareform', 'The North Face', 'Patagonia']) {
      expect(brandCountState(SEALAND_CLIENT_ID, brand), brand).toBe('counted')
    }
    expect(brandCountState(SEALAND_CLIENT_ID, 'Freedom of Movement')).toBe('none')
    expect(brandCountState(SEALAND_CLIENT_ID, 'Old School')).toBe('none')
    expect(nameChecked(SEALAND_CLIENT_ID)).toBe(true)
    expect(nameNoMatch(SEALAND_CLIENT_ID)).toBe(false)
  })

  it('reads every match of your name outside your own posts: both in one September video, both you', () => {
    expect(NAME_READS[SEALAND_CLIENT_ID]).toEqual([
      { videoId: A8, brand: true, month: '2026-09-01', on: '2026-09-27', where: 'production' },
      { videoId: A8, brand: true, month: '2026-09-01', on: '2026-09-27', where: 'production' },
    ])
  })

  it('holds only while the rules are brands_v1: a new rule version sends all eight back to not counted yet', () => {
    expect(BRAND_RULE_VERSION).toBe('brands_v1')
    const next = { [SEALAND_CLIENT_ID]: Object.fromEntries(Object.entries(BRAND_HAND_CHECKS[SEALAND_CLIENT_ID]).map(([b, c]) => [b, { ...c, ruleVersion: 'brands_v2' }])) }
    for (const brand of EIGHT) expect(brandCountState(SEALAND_CLIENT_ID, brand, next), brand).toBe('not_yet')
  })
})

describe('brandCountState', () => {
  it('counts no brand without a production check: all eight wait, the research sample’s three included', () => {
    for (const brand of EIGHT) expect(brandCountState(SEALAND_CLIENT_ID, brand, { [SEALAND_CLIENT_ID]: {} }), brand).toBe('not_yet')
    expect(nameChecked(SEALAND_CLIENT_ID, { [SEALAND_CLIENT_ID]: {} })).toBe(false)
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
    expect(brandCountState(SEALAND_CLIENT_ID, 'Patagonia', { [SEALAND_CLIENT_ID]: { Patagonia: prod(20, 20, { read: 4, brand: 5 }) } })).toBe('not_yet')
    expect(brandCountState(SEALAND_CLIENT_ID, 'Patagonia', { [SEALAND_CLIENT_ID]: { Patagonia: prod(20, 20, { read: 2.5, brand: 2 }) } })).toBe('not_yet')
    // The shape before the two parts (one read and one yes) is no entry.
    const flat = { [SEALAND_CLIENT_ID]: { Patagonia: { read: 20, brand: 20, on: '2026-10-05', where: 'production', ruleVersion: BRAND_RULE_VERSION, of: 'September', source: 'x' } as unknown as BrandHandCheck } }
    expect(brandCountState(SEALAND_CLIENT_ID, 'Patagonia', flat)).toBe('not_yet')
    expect(brandCountState('ossur', 'Ottobock')).toBe('not_yet')
  })
})

describe('the two parts (the deploy-3 fresh review)', () => {
  // Staging's Patagonia: 26 of its 204 mention rows sit in videos no rival
  // search of ours found, the only videos its headline column counts; the
  // rest are where a search for the brand surfaced it. A sample of all 204
  // holds a handful of the 26, so the headline set is read in full.
  it('counts a brand only when the headline set, read in full, clears the floor as well as the sample of the rest', () => {
    const both = { [SEALAND_CLIENT_ID]: { Patagonia: prod(30, 29, { read: 26, brand: 22 }) } }
    expect(22 / 26).toBeGreaterThanOrEqual(BRAND_PRECISION_FLOOR)
    expect(brandCountState(SEALAND_CLIENT_ID, 'Patagonia', both)).toBe('counted')
  })

  it('reads a headline set under the floor as mostly another word, however well the rest reads', () => {
    // The region's travel films gather outside our rival searches.
    const region = { [SEALAND_CLIENT_ID]: { Patagonia: prod(30, 30, { read: 26, brand: 12 }) } }
    expect(brandCountState(SEALAND_CLIENT_ID, 'Patagonia', region)).toBe('noise')
  })

  it('reads a rest under the floor as mostly another word, however well the headline set reads', () => {
    const rest = { [SEALAND_CLIENT_ID]: { Cotopaxi: prod(30, 20, { read: 6, brand: 6 }) } }
    expect(brandCountState(SEALAND_CLIENT_ID, 'Cotopaxi', rest)).toBe('noise')
  })

  it('lets a part with no match gate nothing, and a check with no match at all count nothing', () => {
    expect(brandCountState(SEALAND_CLIENT_ID, 'Cotopaxi', { [SEALAND_CLIENT_ID]: { Cotopaxi: prod(30, 28) } })).toBe('counted')
    expect(brandCountState(SEALAND_CLIENT_ID, 'Sealand', { [SEALAND_CLIENT_ID]: { Sealand: prod(0, 0, { read: 9, brand: 9 }) } })).toBe('counted')
    expect(brandCountState(SEALAND_CLIENT_ID, 'Rareform', { [SEALAND_CLIENT_ID]: { Rareform: prod(0, 0, { read: 0, brand: 0 }) } })).toBe('not_yet')
  })
})

describe('a brand with no match (the lead’s ruling of 27 Sep)', () => {
  // Staging's plan: Rareform, Freedom of Movement and Old School have no match
  // in the window, so the list has nothing to read and no precision can be
  // measured. The entry records that, and the brand is a zero by the rule.
  const none = (over: Record<string, unknown> = {}): BrandHandCheck =>
    ({ matches: 'none', on: '2026-10-05', where: 'production', ruleVersion: BRAND_RULE_VERSION, of: 'September', source: 'the Mon 5 Oct hand check', ...over }) as BrandHandCheck

  it('reads a production entry of no match as none, which the page prints "none found"', () => {
    expect(brandCountState(SEALAND_CLIENT_ID, 'Rareform', { [SEALAND_CLIENT_ID]: { Rareform: none() } })).toBe('none')
    expect(NONE_FOUND).toBe('no video names it')
  })

  it('reads no match from anywhere but production, or under other rules, as no entry', () => {
    expect(brandCountState(SEALAND_CLIENT_ID, 'Rareform', { [SEALAND_CLIENT_ID]: { Rareform: none({ where: 'staging' }) } })).toBe('not_yet')
    expect(brandCountState(SEALAND_CLIENT_ID, 'Rareform', { [SEALAND_CLIENT_ID]: { Rareform: none({ ruleVersion: 'brands_v0' }) } })).toBe('not_yet')
  })

  it('reads a no-match entry that also carries parts, or an unknown matches word, as no entry', () => {
    expect(brandCountState(SEALAND_CLIENT_ID, 'Rareform', { [SEALAND_CLIENT_ID]: { Rareform: none({ headline: { read: 0, brand: 0 }, rest: { read: 0, brand: 0 } }) } })).toBe('not_yet')
    expect(brandCountState(SEALAND_CLIENT_ID, 'Rareform', { [SEALAND_CLIENT_ID]: { Rareform: none({ matches: 'some' }) } })).toBe('not_yet')
  })

  it('keeps two parts that read no match at all as no entry: no match is recorded as matches none', () => {
    expect(brandCountState(SEALAND_CLIENT_ID, 'Rareform', { [SEALAND_CLIENT_ID]: { Rareform: prod(0, 0) } })).toBe('not_yet')
  })

  it('holds your name checked where the list held no match of it outside your own posts', () => {
    const own = { [SEALAND_CLIENT_ID]: { Sealand: none() } }
    expect(nameChecked(SEALAND_CLIENT_ID, own)).toBe(true)
    expect(nameNoMatch(SEALAND_CLIENT_ID, own)).toBe(true)
    expect(nameNoMatch(SEALAND_CLIENT_ID, { [SEALAND_CLIENT_ID]: { Sealand: prod(9, 9) } })).toBe(false)
    expect(nameChecked(SEALAND_CLIENT_ID, { [SEALAND_CLIENT_ID]: { Sealand: none({ where: 'staging' }) } })).toBe(false)
    expect(nameNoMatch('ossur')).toBe(false)
  })
})

describe('the name line’s check', () => {
  it('is the client’s own name, checked on production at any precision', () => {
    expect(clientBrandName(SEALAND_CLIENT_ID)).toBe('Sealand')
    expect(clientBrandName('ossur')).toBeNull()
    expect(nameChecked(SEALAND_CLIENT_ID, { [SEALAND_CLIENT_ID]: { Sealand: prod(9, 9) } })).toBe(true)
    expect(nameChecked(SEALAND_CLIENT_ID, { [SEALAND_CLIENT_ID]: { Sealand: prod(9, 2) } })).toBe(true)
    expect(nameChecked(SEALAND_CLIENT_ID, { [SEALAND_CLIENT_ID]: { Patagonia: prod(9, 9) } })).toBe(false)
  })

  // Staging's September: the 9 matches of "Sealand" are all its own posts,
  // listed apart, so both parts read none. The check still happened, and the
  // name line then prints "none"; the name as a brand counts nothing.
  it('holds a check whose every match is your own posts, where both parts read none', () => {
    const own = { [SEALAND_CLIENT_ID]: { Sealand: prod(0, 0, { read: 0, brand: 0 }) } }
    expect(nameChecked(SEALAND_CLIENT_ID, own)).toBe(true)
    expect(brandCountState(SEALAND_CLIENT_ID, 'Sealand', own)).toBe('not_yet')
    expect(nameChecked(SEALAND_CLIENT_ID, { [SEALAND_CLIENT_ID]: { Sealand: { ...prod(0, 0), ruleVersion: 'brands_v0' } } })).toBe(false)
    expect(nameChecked(SEALAND_CLIENT_ID, { [SEALAND_CLIENT_ID]: { Sealand: prod(0, 1) } })).toBe(false)
  })
})
