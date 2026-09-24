import { describe, expect, it } from 'vitest'
import { carriesShare, levelText, LEVEL_FLOOR_N } from './level'

describe('levelText', () => {
  it('prints a count under the floor, never a percentage', () => {
    expect(levelText(5, 5)).toEqual({ text: '5 of 5', kind: 'count' })
    expect(levelText(2, 8)).toEqual({ text: '2 of 8', kind: 'count' })
    expect(levelText(0, 12)).toEqual({ text: '0 of 12', kind: 'count' })
  })

  it('prints a whole-number share at or over the floor', () => {
    expect(LEVEL_FLOOR_N).toBe(100)
    expect(levelText(317, 625)).toEqual({ text: '51%', kind: 'share' })
    expect(levelText(25, 100)).toEqual({ text: '25%', kind: 'share' })
    expect(levelText(1362, 18986)?.text).toBe('7%')
  })

  it('has no reading without a population', () => {
    expect(levelText(0, 0)).toBeNull()
    expect(levelText(3, null)).toBeNull()
    expect(carriesShare(99)).toBe(false)
    expect(carriesShare(100)).toBe(true)
  })
})
