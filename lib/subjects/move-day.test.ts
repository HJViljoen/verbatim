import { describe, expect, it } from 'vitest'

import { earliestMoveDay, moveDay } from './move-day'

// MF5's window (moves_dated_on_window, 20261103091000): from the first of the
// month two months before the day a move is declared, to that day.

describe('earliestMoveDay', () => {
  it('is the first of the month two months back', () => {
    expect(earliestMoveDay('2026-10-02')).toBe('2026-08-01')
    expect(earliestMoveDay('2026-09-30')).toBe('2026-07-01')
    expect(earliestMoveDay('2026-03-31')).toBe('2026-01-01')
  })

  it('crosses the year', () => {
    expect(earliestMoveDay('2027-01-15')).toBe('2026-11-01')
    expect(earliestMoveDay('2027-02-01')).toBe('2026-12-01')
  })
})

describe('moveDay', () => {
  const today = '2026-10-02'

  it('stores nothing for no day, or for today: the declaration day says it', () => {
    expect(moveDay(null, today)).toEqual({ day: null })
    expect(moveDay('', today)).toEqual({ day: null })
    expect(moveDay(' 2026-10-02 ', today)).toEqual({ day: null })
  })

  it('stores a day inside the window, its first day included', () => {
    expect(moveDay('2026-09-15', today)).toEqual({ day: '2026-09-15' })
    expect(moveDay('2026-08-01', today)).toEqual({ day: '2026-08-01' })
  })

  it('refuses a day after today or before the window, in the reader’s words', () => {
    expect(moveDay('2026-10-03', today)).toBe('Pick a day from 1 Aug to today.')
    expect(moveDay('2026-07-31', today)).toBe('Pick a day from 1 Aug to today.')
  })

  it('refuses what is not a day', () => {
    expect(moveDay('15 Sep', today)).toBe('Pick the day you made the change.')
    expect(moveDay('2026-09-31', today)).toBe('Pick the day you made the change.')
    expect(moveDay('2026-9-15', today)).toBe('Pick the day you made the change.')
  })
})
