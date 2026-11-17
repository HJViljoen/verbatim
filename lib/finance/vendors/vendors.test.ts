import { describe, expect, it } from 'vitest'
import { fetchApifyUsage, parseApifyUsage } from './apify'
import { fetchUsdZar, parseUsdZar } from './fx'

// The two vendor answers the daily job reads, parsed. Fixtures are the shapes
// the live APIs returned on 17 Nov 2026, with made-up figures.

const APIFY = {
  data: {
    usageCycle: { startAt: '2026-11-09T00:00:00.000Z', endAt: '2026-12-08T23:59:59.999Z' },
    monthlyServiceUsage: { DATASET_READS: { quantity: 10, baseAmountUsd: 0.000004, baseUnitPriceUsd: 4e-7, amountAfterVolumeDiscountUsd: 0.000004, priceTiers: [] } },
    dailyServiceUsages: [{ date: '2026-11-09T00:00:00.000Z', serviceUsage: {}, totalUsageCreditsUsd: 0.1 }],
    totalUsageCreditsUsdBeforeVolumeDiscount: 12.345678,
    totalUsageCreditsUsdAfterVolumeDiscount: 12.345678,
  },
}

describe('Apify\'s cycle usage', () => {
  it('reads the cycle\'s days and its spend after discount', () => {
    expect(parseApifyUsage(APIFY)).toEqual({ periodStart: '2026-11-09', periodEnd: '2026-12-08', usd: 12.3457 })
  })

  it('refuses an answer that is not the documented shape', () => {
    expect(parseApifyUsage(null)).toBeNull()
    expect(parseApifyUsage({ error: { type: 'token-not-valid' } })).toBeNull()
    expect(parseApifyUsage({ data: { ...APIFY.data, usageCycle: {} } })).toBeNull()
    expect(parseApifyUsage({ data: { ...APIFY.data, totalUsageCreditsUsdAfterVolumeDiscount: -1, totalUsageCreditsUsdBeforeVolumeDiscount: -1 } })).toBeNull()
    expect(parseApifyUsage({ data: { ...APIFY.data, totalUsageCreditsUsdAfterVolumeDiscount: 'x', totalUsageCreditsUsdBeforeVolumeDiscount: undefined } })).toBeNull()
  })

  it('sends the token as a bearer and fails loudly on a bad status', async () => {
    let auth = ''
    const ok = (async (_u: string, init?: RequestInit) => {
      auth = String((init?.headers as Record<string, string>).Authorization)
      return new Response(JSON.stringify(APIFY), { status: 200 })
    }) as unknown as typeof fetch
    expect((await fetchApifyUsage('tok', ok)).usd).toBe(12.3457)
    expect(auth).toBe('Bearer tok')
    const bad = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch
    await expect(fetchApifyUsage('tok', bad)).rejects.toThrow('HTTP 401')
  })
})

describe('the dollar in rand', () => {
  it('reads the ECB rate and its day', () => {
    expect(parseUsdZar({ amount: 1, base: 'USD', date: '2026-11-17', rates: { ZAR: 16.93274 } })).toEqual({ rate: 16.9327, on: '2026-11-17' })
  })

  it('refuses another base, a missing rate or one outside the sane band', () => {
    expect(parseUsdZar({ amount: 1, base: 'EUR', date: '2026-11-17', rates: { ZAR: 19.5 } })).toBeNull()
    expect(parseUsdZar({ amount: 1, base: 'USD', date: '2026-11-17', rates: {} })).toBeNull()
    expect(parseUsdZar({ amount: 1, base: 'USD', date: '2026-11-17', rates: { ZAR: 0.06 } })).toBeNull()
    expect(parseUsdZar({ amount: 1, base: 'USD', date: 'today', rates: { ZAR: 17 } })).toBeNull()
  })

  it('fails loudly on a bad answer', async () => {
    const bad = (async () => new Response(JSON.stringify({ base: 'USD', date: '2026-11-17', rates: { ZAR: 999 } }), { status: 200 })) as unknown as typeof fetch
    await expect(fetchUsdZar(bad)).rejects.toThrow('not a sane')
  })
})
