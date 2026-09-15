import { describe, it, expect } from 'vitest'

import type { FigureTable as ReadingFigures } from '../reading/verdicts'
import { proseFigures } from './figures'
import { verdictBlock } from './interpret'
import { dropDigitSentences } from './scrub'

const reading: ReadingFigures = {
  share_now: { value: 3.42, unit: 'pct', label: 'share of the category this month' },
  change: { value: -4.13, unit: 'pts', label: 'change since June, in share points' },
  videos: { value: 1596, unit: 'videos', label: 'videos read' },
  comments: { value: 48_231, unit: 'comments', label: 'comments read' },
  one_point: { value: 1, unit: 'pts', label: 'one point' },
}

describe('proseFigures — one crossing between the measured figure and the printed one', () => {
  it('prints each unit the way the product prints it', () => {
    const out = proseFigures(reading)
    expect(out.share_now).toEqual({ label: 'share of the category this month', value: '3.4%', kind: 'pct' })
    expect(out.change).toEqual({ label: 'change since June, in share points', value: '-4.1 pts', kind: 'count' })
    expect(out.videos).toEqual({ label: 'videos read', value: '1,596', kind: 'count' })
    expect(out.comments.value).toBe('48,231')
  })

  it('keeps a change’s sign, because +4.1 and −4.1 are different claims', () => {
    expect(proseFigures({ up: { value: 4.13, unit: 'pts', label: 'change' } }).up.value).toBe('+4.1 pts')
    expect(proseFigures({ flat: { value: 0, unit: 'pts', label: 'change' } }).flat.value).toBe('0 pts')
  })

  it('singularises one point', () => {
    expect(proseFigures(reading).one_point.value).toBe('+1 pt')
  })

  it('keeps the label, because the label is the only half the model ever sees', () => {
    const block = verdictBlock([], proseFigures(reading))
    expect(block).toContain('- [[share_now]] — share of the category this month')
    expect(block).not.toContain('3.4%')
    expect(block).not.toContain('1,596')
  })

  it('produces a table the digit rule can check a cited key against', () => {
    const figures = proseFigures(reading)
    expect(dropDigitSentences('Share stands at [[share_now]] of the category.', figures).dropped).toBe(0)
    expect(dropDigitSentences('Share stands at [[share_last_year]].', figures).dropped).toBe(1)
  })

  it('is empty for an empty reading, which is a policy and not an oversight', () => {
    expect(proseFigures({})).toEqual({})
    expect(verdictBlock([], proseFigures({}))).toContain('Any digit you type deletes the sentence it is in.')
  })
})
