// Apify's own figure for the billing cycle: GET /v2/users/me/usage/monthly
// (verified 17 Nov 2026). It is the USAGE billed in the cycle (the plan fee
// is not in it), the same thing the Costs page's "Apify this cycle" paces
// against the cap. Read with APIFY_TOKEN; no other vendor is fetched (D4).

export interface ApifyCycleUsage {
  /** The cycle's first and last day, as Apify dates them (UTC). */
  periodStart: string
  periodEnd: string
  usd: number
}

const day = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)

/** The response, read. Null when it is not the shape Apify documents. */
export function parseApifyUsage(body: unknown): ApifyCycleUsage | null {
  const data = (body as { data?: Record<string, unknown> } | null)?.data
  if (!data || typeof data !== 'object') return null
  const cycle = data.usageCycle as { startAt?: unknown; endAt?: unknown } | undefined
  const periodStart = day(cycle?.startAt)
  const periodEnd = day(cycle?.endAt)
  const raw = data.totalUsageCreditsUsdAfterVolumeDiscount ?? data.totalUsageCreditsUsdBeforeVolumeDiscount
  const usd = typeof raw === 'number' ? raw : Number.NaN
  if (!periodStart || !periodEnd || !Number.isFinite(usd) || usd < 0 || periodEnd < periodStart) return null
  return { periodStart, periodEnd, usd: Math.round(usd * 10000) / 10000 }
}

export async function fetchApifyUsage(token: string, fetchImpl: typeof fetch = fetch): Promise<ApifyCycleUsage> {
  const r = await fetchImpl('https://api.apify.com/v2/users/me/usage/monthly', { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`Apify usage: HTTP ${r.status}`)
  const parsed = parseApifyUsage(await r.json())
  if (!parsed) throw new Error('Apify usage: the answer was not the expected shape')
  return parsed
}
