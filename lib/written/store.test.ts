import { describe, expect, it } from 'vitest'

import { standsAsMonthRead } from './store'

// The run that closes a month writes its long-run read unless one stands
// already (`longRunWritten`). A read the backfill wrote before the month
// closed (`partialThrough`, scripts/backfill-platform.ts) does not stand: the
// closing run still writes the full one, which then takes its place.

describe('standsAsMonthRead', () => {
  it('a ready or thin read stands; a failed one does not', () => {
    expect(standsAsMonthRead({ status: 'ready' })).toBe(true)
    expect(standsAsMonthRead({ status: 'thin', partial_through: null })).toBe(true)
    expect(standsAsMonthRead({ status: 'failed' })).toBe(false)
  })
  it('a read written before its month closed does not stand, ready or not', () => {
    expect(standsAsMonthRead({ status: 'ready', partial_through: '2026-09-27' })).toBe(false)
    expect(standsAsMonthRead({ status: 'thin', partial_through: '2026-09-27' })).toBe(false)
  })
})
