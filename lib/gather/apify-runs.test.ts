import { describe, it, expect } from 'vitest'
import {
  settleWaitMs,
  settleDelayForRows,
  withApifyRunContext,
  getApifyRunContext,
  SETTLE_MAX_WAIT_MS,
} from './apify-runs'

const NOW = Date.parse('2026-09-09T12:00:00.000Z')
const at = (secondsAgo: number) => new Date(NOW - secondsAgo * 1000).toISOString()

describe('settleWaitMs — waiting for pay-per-event charges to land', () => {
  it('waits the remainder of the settling minute for a run that just finished', () => {
    expect(settleWaitMs(at(0), NOW)).toBe(60_000)
    expect(settleWaitMs(at(45), NOW)).toBe(15_000)
  })

  it('waits for nothing once the run is old enough', () => {
    expect(settleWaitMs(at(60), NOW)).toBe(0)
    expect(settleWaitMs(at(3600), NOW)).toBe(0)
  })

  it('is bounded — a clock skew into the future cannot hang the step', () => {
    expect(settleWaitMs(new Date(NOW + 86_400_000).toISOString(), NOW)).toBe(SETTLE_MAX_WAIT_MS)
  })

  it('does not wait on a row with no or an unreadable finish time', () => {
    expect(settleWaitMs(null, NOW)).toBe(0)
    expect(settleWaitMs('not-a-date', NOW)).toBe(0)
  })
})

describe('settleDelayForRows', () => {
  it('sleeps once, for the youngest run — the others are already settled by then', () => {
    expect(settleDelayForRows([{ finished_at: at(300) }, { finished_at: at(20) }, { finished_at: at(90) }], NOW))
      .toBe(40_000)
  })

  it('is zero when every run is old enough', () => {
    expect(settleDelayForRows([{ finished_at: at(300) }, { finished_at: at(61) }], NOW)).toBe(0)
  })

  it('is zero with nothing to settle', () => {
    expect(settleDelayForRows([], NOW)).toBe(0)
  })
})

describe('withApifyRunContext', () => {
  it('reaches code that knows nothing about it, across awaits', () => {
    // The whole reason for AsyncLocalStorage: the actor call sites are deep
    // inside gather/owned/transcript code with no run argument in sight.
    return withApifyRunContext({ clientId: 'C', runId: 'R', step: 'comments:instagram:4' }, async () => {
      await Promise.resolve()
      await new Promise((r) => setTimeout(r, 1))
      expect(getApifyRunContext()).toEqual({ clientId: 'C', runId: 'R', step: 'comments:instagram:4' })
    })
  })

  it('does not leak out of the step body', async () => {
    await withApifyRunContext({ clientId: 'C' }, async () => {})
    expect(getApifyRunContext()).toBeUndefined()
  })

  it('nests — an inner step body wins', async () => {
    await withApifyRunContext({ clientId: 'C', step: 'outer' }, async () => {
      await withApifyRunContext({ clientId: 'C', step: 'inner' }, async () => {
        expect(getApifyRunContext()?.step).toBe('inner')
      })
      expect(getApifyRunContext()?.step).toBe('outer')
    })
  })
})
