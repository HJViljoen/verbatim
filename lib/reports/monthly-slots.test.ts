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

  it('are all stubs from the loader until a package wires its own', () => {
    expect(monthlySlotsFrom({})).toEqual(MONTHLY_SLOT_STUBS)
    // A copy, never the shared constant: a build that fills one slot must not
    // fill it for every build after it.
    expect(monthlySlotsFrom({})).not.toBe(MONTHLY_SLOT_STUBS)
  })

  it('tell a filled slot from a stub, and read a missing one as a stub', () => {
    const filled: MonthlySlot<{ checks: [] }> = { state: 'filled', value: { checks: [] } }
    expect(isFilled(filled)).toBe(true)
    expect(isFilled(MONTHLY_SLOT_STUBS.change)).toBe(false)
    expect(isFilled(undefined)).toBe(false)
    expect(isFilled(null)).toBe(false)
  })
})
