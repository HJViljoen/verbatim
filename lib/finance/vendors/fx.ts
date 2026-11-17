// The dollar's rate in rand, for the COST side only (invoices keep their
// profile's fixed rate): Frankfurter's ECB reference rate, no key
// (GET https://api.frankfurter.dev/v1/latest?from=USD&to=ZAR, verified 17 Nov
// 2026). ECB publishes on working days, so the date can be a day or three old.

export interface UsdZar {
  rate: number
  /** The day the ECB published it. */
  on: string
}

/** A rand-per-dollar rate outside this band is a bad answer, not a market. */
export const SANE_USD_ZAR = { min: 5, max: 60 } as const

export function parseUsdZar(body: unknown): UsdZar | null {
  const b = body as { base?: unknown; date?: unknown; rates?: { ZAR?: unknown } } | null
  if (!b || b.base !== 'USD' || typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return null
  const rate = b.rates?.ZAR
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < SANE_USD_ZAR.min || rate > SANE_USD_ZAR.max) return null
  return { rate: Math.round(rate * 10000) / 10000, on: b.date }
}

export async function fetchUsdZar(fetchImpl: typeof fetch = fetch): Promise<UsdZar> {
  const r = await fetchImpl('https://api.frankfurter.dev/v1/latest?from=USD&to=ZAR')
  if (!r.ok) throw new Error(`Exchange rate: HTTP ${r.status}`)
  const parsed = parseUsdZar(await r.json())
  if (!parsed) throw new Error('Exchange rate: the answer was not a sane USD/ZAR rate')
  return parsed
}
