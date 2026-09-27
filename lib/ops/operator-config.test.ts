import { describe, expect, it } from 'vitest'

import { directionHits } from '../calibration'
import { checkDescription, DESCRIPTION_NOTE, parseWatched, plan, WATCHED_NOTE } from '../../scripts/operator-config'

// scripts/operator-config.ts (WP3.10): market_description and watched_brands,
// operator-only, logged through recordConfigChange (surface 'other'). The
// write itself is not run here; these are the pure halves.

describe('checkDescription', () => {
  it('trims to one line', () => {
    expect(checkDescription('  sustainable   travel bags ')).toBe('sustainable travel bags')
  })
  it('refuses empty, too long, and an em dash', () => {
    expect(() => checkDescription('  ')).toThrow(/empty/)
    expect(() => checkDescription('x'.repeat(161))).toThrow(/over 160/)
    expect(() => checkDescription('bags — for travel')).toThrow(/em dash/)
  })
})

describe('parseWatched', () => {
  it('is the whole list, de-duplicated case-blind, the first spelling kept; "" clears it', () => {
    expect(parseWatched('Osprey, Peak Design,osprey, ')).toEqual(['Osprey', 'Peak Design'])
    expect(parseWatched('')).toEqual([])
  })
  it('refuses a name that is not one', () => {
    expect(() => parseWatched('O')).toThrow(/not a brand name/)
    expect(() => parseWatched(Array.from({ length: 21 }, (_, i) => `Brand ${i}`).join(','))).toThrow(/keep it to 20/)
  })
})

describe('plan', () => {
  const stored = { market_description: null, watched_brands: [] }
  it('writes only what moves', () => {
    expect(plan(stored, { description: 'sustainable travel bags', watched: [] })).toEqual([
      { field: 'market_description', before: null, after: 'sustainable travel bags', note: DESCRIPTION_NOTE },
    ])
    expect(plan({ market_description: 'x', watched_brands: ['Osprey'] }, { description: 'x', watched: ['Osprey'] })).toEqual([])
    expect(plan(stored, { watched: ['Osprey'] })[0]).toMatchObject({ field: 'watched_brands', before: [], after: ['Osprey'] })
  })
  it('stores notes that hold to the copy rules (plan §4.0)', () => {
    for (const note of [DESCRIPTION_NOTE, WATCHED_NOTE]) {
      expect(note).not.toMatch(/\d|—/)
      expect(directionHits(note)).toEqual([])
    }
  })
})
