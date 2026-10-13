import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { DIRECTION_WORDS } from '../calibration'
import { barMonth, EARLIER_MONTH, inlineMonth, LAST_FULL_MONTH, monthHeading, readingMonthLabel, THIS_MONTH } from './month-label'
import { readingMonthFor } from './reading-month'

// Decision 3 (13 Oct): keep both clocks, and label a whole-month reading that
// names a month other than the current one, in one helper's words.

describe('readingMonthLabel', () => {
  it('prints nothing for the current calendar month', () => {
    expect(readingMonthLabel('2026-10-01', '2026-10-13T08:00:00.000Z')).toBeNull()
    expect(readingMonthLabel('2026-10-01', '2026-10-31T23:59:59.000Z')).toBeNull()
    expect(readingMonthLabel('2026-10-15T12:00:00.000Z', '2026-10-01T00:00:00.000Z')).toBeNull()
  })

  it('names the month that has just ended "the last full month"', () => {
    expect(readingMonthLabel('2026-09-01', '2026-10-13T08:00:00.000Z')).toBe(LAST_FULL_MONTH)
    expect(readingMonthLabel('2026-09-01', '2026-10-01T00:00:00.000Z')).toBe('the last full month')
    // Across a year.
    expect(readingMonthLabel('2026-12-01', '2027-01-04T06:00:00.000Z')).toBe(LAST_FULL_MONTH)
  })

  it('never calls an older month the last full one (a paused workspace, a ?month=)', () => {
    expect(readingMonthLabel('2026-08-01', '2026-10-13T08:00:00.000Z')).toBe(EARLIER_MONTH)
    expect(readingMonthLabel('2026-09-01', '2026-12-07T08:00:00.000Z')).toBe('an earlier month')
  })

  it('reads the month in UTC, as the reading month does', () => {
    // 23:30 UTC on 31 October is 1 November in Johannesburg; the reading
    // month's rule still says October, and so does the label.
    expect(readingMonthLabel('2026-10-01', '2026-10-31T23:30:00.000Z')).toBeNull()
    expect(readingMonthLabel('2026-10-01', '2026-11-01T00:30:00.000Z')).toBe(LAST_FULL_MONTH)
  })

  it('agrees with the reading month: before the switch it labels, from the switch on it does not', () => {
    // Sealand's calendar (Sunday updates): September leads to 15 Oct, October
    // so far from 16 Oct (lib/reading/reading-month.ts).
    const updates = ['2026-09-27T07:00:00.000Z', '2026-10-04T07:00:00.000Z', '2026-10-11T07:00:00.000Z']
    const videosByMonth = new Map([['2026-08-01', 900], ['2026-09-01', 940], ['2026-10-01', 900]])
    const at = (now: string) => readingMonthFor({ now, updates, videosByMonth, firstRunMonth: '2026-06-01' })
    const early = at('2026-10-13T08:00:00.000Z')
    expect(early.month).toBe('2026-09-01')
    expect(readingMonthLabel(early.month, '2026-10-13T08:00:00.000Z')).toBe(LAST_FULL_MONTH)
    const late = at('2026-10-17T08:00:00.000Z')
    expect(late.month).toBe('2026-10-01')
    expect(readingMonthLabel(late.month, '2026-10-17T08:00:00.000Z')).toBeNull()
  })
})

describe('the two places a label is written', () => {
  it('a bar or meta line: "September · the last full month"; the words alone without one', () => {
    expect(barMonth('September', LAST_FULL_MONTH)).toBe('September · the last full month')
    expect(barMonth('October so far', null)).toBe('October so far')
    expect(barMonth('October so far', undefined)).toBe('October so far')
  })

  it('a column of the month\'s counts: "This month" while it is, the month\'s name once it is not', () => {
    expect(monthHeading('October', null)).toBe(THIS_MONTH)
    expect(monthHeading('September', LAST_FULL_MONTH)).toBe('September')
  })

  it('a sentence: "September, the last full month"', () => {
    expect(inlineMonth('September', LAST_FULL_MONTH)).toBe('September, the last full month')
    expect(inlineMonth('October so far', null)).toBe('October so far')
  })

  it('is calibrated copy: no digit, no em dash, no direction word', () => {
    for (const words of [LAST_FULL_MONTH, EARLIER_MONTH]) {
      expect(words).not.toMatch(/\d/)
      expect(words).not.toContain('—')
      for (const w of DIRECTION_WORDS) expect(words.split(/\s+/), w).not.toContain(w)
    }
  })

  it('is the one place the words are written: no page spells them itself', () => {
    const own = join(__dirname, 'month-label.ts')
    const pages = [
      'components/pages/v2/voices/index.tsx', 'components/pages/v2/products/index.tsx',
      'components/pages/v2/moves/moves.tsx', 'components/pages/v2/home/voices-tile.tsx',
      'components/pages/v2/home/products-tile.tsx', 'components/pages/v2/home/moves-tile.tsx',
      'components/pages/v2/home/parts.tsx', 'components/pages/settings/products/index.tsx',
      'lib/pages/v2/voices.ts', 'lib/pages/v2/products.ts', 'lib/pages/v2/moves.ts', 'lib/settings/products.ts',
    ]
    expect(readFileSync(own, 'utf8')).toContain(`'${LAST_FULL_MONTH}'`)
    for (const p of pages) {
      // The code, not its comments: a comment may quote the words it prints.
      const src = readFileSync(join(__dirname, '../..', p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(src, p).not.toContain(LAST_FULL_MONTH)
      expect(src, p).not.toContain(EARLIER_MONTH)
    }
  })
})
