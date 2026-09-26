import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from './config'
import { WEEK_LINE, WEEK_LINE_METHOD_V1, weekLineConfigFor } from './week-line-config'

// WEEK_LINE's pin (plan §4.2, WP3.13). It moves into lib/config.test.ts with
// the constant after the 4 Oct run (lib/week-line-config.ts's header).

describe('WEEK_LINE', () => {
  it('is Sealand only, from the week of 28 Sep at 14 days, not printed, with no mix until the line first prints', () => {
    expect(Object.keys(WEEK_LINE)).toEqual([SEALAND_CLIENT_ID])
    expect(WEEK_LINE[SEALAND_CLIENT_ID]).toEqual({
      firstWeek: '2026-09-28', ageDays: 14, print: false, methodVersion: WEEK_LINE_METHOD_V1, mix: null,
    })
  })

  it('gives Össur no entry, so no same-age row at all', () => {
    expect(weekLineConfigFor(OSSUR_CLIENT_ID)).toBeNull()
    expect(weekLineConfigFor('toString')).toBeNull()
    expect(weekLineConfigFor(SEALAND_CLIENT_ID)?.print).toBe(false)
  })
})
