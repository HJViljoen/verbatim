import { describe, expect, it } from 'vitest'
import { MONTHLY_SLOT_STUBS, isFilled, monthlySlotsFrom, type MonthlySlot } from './monthly-slots'

// The monthly's four slots (market-first WP2.1): typed now, stubbed, and
// filled by the packages that own them.

describe('the slots', () => {
  it('are four stubs, each naming the package that fills it', () => {
    expect(MONTHLY_SLOT_STUBS).toEqual({
      change: { state: 'stub', owner: 'WP2.3' },
      arrivals: { state: 'stub', owner: 'WP2.7' },
      you: { state: 'stub', owner: 'WP2.5' },
      brands: { state: 'stub', owner: 'WP2.6' },
    })
  })

  it('are all stubs from a page that has none of the packages’ blocks', () => {
    expect(monthlySlotsFrom({})).toEqual(MONTHLY_SLOT_STUBS)
    // A copy, never the shared constant: a build that fills one slot must not
    // fill it for every build after it.
    expect(monthlySlotsFrom({})).not.toBe(MONTHLY_SLOT_STUBS)
  })

  it('fill "With this update" from the front page’s own block (WP2.7), and leave it a stub without one', () => {
    // Staging's 20 Sep update, as `update_arrivals` counts it (26 Sep).
    const arrivals = {
      run: { id: 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4', date: '2026-09-20T08:33:47.358Z' },
      months: [{ month: '2026-09-01', videosFirstRead: 395, commentsCaptured: 11999 }],
      current: { month: '2026-09-01', videos: 654, updates: 3 },
      newThemes: [],
      regrouped: null,
    }
    expect(monthlySlotsFrom({ arrivals })).toEqual({ ...MONTHLY_SLOT_STUBS, arrivals: { state: 'filled', value: arrivals } })
    expect(monthlySlotsFrom({ arrivals: undefined })).toEqual(MONTHLY_SLOT_STUBS)
  })

  it('tell a filled slot from a stub, and read a missing one as a stub', () => {
    const filled: MonthlySlot<{ checks: [] }> = { state: 'filled', value: { checks: [] } }
    expect(isFilled(filled)).toBe(true)
    expect(isFilled(MONTHLY_SLOT_STUBS.change)).toBe(false)
    expect(isFilled(undefined)).toBe(false)
    expect(isFilled(null)).toBe(false)
  })
})
