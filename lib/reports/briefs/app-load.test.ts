import { describe, expect, it } from 'vitest'

import { APP_PARTS_BUDGET_MS, APP_PARTS_RESERVE_MS, appPartsBudgetMs, softWithin } from './app-load'
import { BRIEF_STEP_BUDGET_MS, briefClock } from './clock'

// The app's pages are read inside `plan-briefs` (app-load.ts), whose route
// Vercel kills at 300 s before the body's catch can store a failed row or
// alert. So the reads are soft in time as well as in failure: one deadline for
// them all, inside the step's clock, and a part still reading at it is left
// out. No database: the reads are stand-ins.

describe('the app\'s pages are read inside the step\'s clock', () => {
  it('the budget is the cap, or what the clock leaves after the reserve, never negative; the cap alone by hand', () => {
    expect(appPartsBudgetMs()).toBe(APP_PARTS_BUDGET_MS)
    expect(appPartsBudgetMs(null)).toBe(APP_PARTS_BUDGET_MS)
    let at = 0
    const clock = briefClock({ now: () => at })
    expect(appPartsBudgetMs(clock)).toBe(APP_PARTS_BUDGET_MS)
    // The inputs before them took most of the step: what is left, less the reserve.
    at = BRIEF_STEP_BUDGET_MS - 100_000
    expect(appPartsBudgetMs(clock)).toBe(100_000 - APP_PARTS_RESERVE_MS)
    at = BRIEF_STEP_BUDGET_MS - APP_PARTS_RESERVE_MS + 1
    expect(appPartsBudgetMs(clock)).toBe(0)
    at = BRIEF_STEP_BUDGET_MS + 10_000
    expect(appPartsBudgetMs(clock)).toBe(0)
  })

  it('a part read in time is kept; one that fails, or is still reading at the deadline, is left out', async () => {
    expect(await softWithin('groups', async () => ({ groups: 5 }), 1_000)).toEqual({ groups: 5 })
    expect(await softWithin('groups', async () => { throw new Error('PGRST002') }, 1_000)).toBeNull()
    const started = Date.now()
    expect(await softWithin('groups', () => new Promise<never>(() => {}), 20)).toBeNull()
    expect(Date.now() - started).toBeLessThan(1_000)
  })
})
