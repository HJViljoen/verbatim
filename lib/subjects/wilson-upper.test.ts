import { describe, expect, it } from 'vitest'

import { SUBJECT_PRECISION_FLOOR, WILSON_Z_95, wilsonUpper } from './types'

// The boundaries WP1.1 pins (plan §4.2 and decision C), on real calibrations:
// staging's hand-labelled precision was measured on n = 33 (DR F30), with
// Repair & warranty at 0.33, Looks & style at 0.86 and Comfort at 0.92.

describe('wilsonUpper', () => {
  it('Repair & warranty, 0.333 on 33 labels: the top of its range is about 0.50, under the floor (failed)', () => {
    const upper = wilsonUpper(0.333, 33)
    expect(upper).toBeCloseTo(0.5036, 3)
    expect(upper).toBeLessThan(SUBJECT_PRECISION_FLOOR)
  })

  it('0.80 on 25 labels reaches about 0.91, so the floor is still in range (provisional, not failed)', () => {
    const upper = wilsonUpper(0.8, 25)
    expect(upper).toBeCloseTo(0.9114, 3)
    expect(upper).toBeGreaterThanOrEqual(SUBJECT_PRECISION_FLOOR)
  })

  it('Looks & style, 0.86 on 33, and Comfort, 0.92 on 33, reach well past the floor', () => {
    expect(wilsonUpper(0.86, 33)).toBeGreaterThan(0.93)
    expect(wilsonUpper(0.92, 33)).toBeGreaterThan(0.97)
  })

  it('stays inside [0, 1] at the edges, where the normal interval collapses', () => {
    // 0 of 33 still reaches z² / (n + z²), about 0.10.
    expect(wilsonUpper(0, 33)).toBeCloseTo((WILSON_Z_95 ** 2) / (33 + WILSON_Z_95 ** 2), 10)
    expect(wilsonUpper(1, 33)).toBe(1)
  })

  it('tightens as labels grow, at the same precision', () => {
    expect(wilsonUpper(0.333, 100)).toBeLessThan(wilsonUpper(0.333, 33))
    expect(wilsonUpper(0.333, 33)).toBeLessThan(wilsonUpper(0.333, 10))
  })

  it('rises with the precision, at the same labels', () => {
    expect(wilsonUpper(0.8, 25)).toBeGreaterThan(wilsonUpper(0.7, 25))
  })

  it('a wider z gives a higher bound', () => {
    expect(wilsonUpper(0.8, 25, 2.575829)).toBeGreaterThan(wilsonUpper(0.8, 25))
  })

  it('no labels is no bound: n ≤ 0 answers 1, so nothing is called failed on no sample', () => {
    expect(wilsonUpper(0.333, 0)).toBe(1)
    expect(wilsonUpper(0.333, -4)).toBe(1)
  })

  it('an impossible precision, or anything not finite, is NaN and fails every comparison', () => {
    for (const v of [
      wilsonUpper(Number.NaN, 33), wilsonUpper(1.2, 33), wilsonUpper(-0.1, 33),
      wilsonUpper(0.5, Number.NaN), wilsonUpper(0.5, Number.POSITIVE_INFINITY), wilsonUpper(0.5, 33, Number.NaN),
    ]) {
      expect(Number.isNaN(v)).toBe(true)
      expect(v < SUBJECT_PRECISION_FLOOR).toBe(false)
      expect(v >= SUBJECT_PRECISION_FLOOR).toBe(false)
    }
  })
})
