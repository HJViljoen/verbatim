import { addMonths } from './dates'

// The variable spend, as `cost_usage_by_month` returns it (month × vendor ×
// client, already summed in SQL), pivoted into the page's two tables: by
// vendor and by client, one column a month. Pure.

export const VENDORS = ['openai', 'transcripts', 'apify'] as const
export type Vendor = (typeof VENDORS)[number]

export const VENDOR_LABEL: Record<Vendor, string> = {
  openai: 'OpenAI',
  transcripts: 'Transcripts',
  apify: 'Apify',
}

export interface UsageRow {
  /** The month's first day, 'YYYY-MM-01'. */
  month: string
  vendor: Vendor
  clientId: string | null
  clientName: string | null
  usd: number
}

export function usageFromRow(r: Record<string, unknown>): UsageRow | null {
  const vendor = String(r.vendor) as Vendor
  if (!(VENDORS as readonly string[]).includes(vendor)) return null
  return {
    month: String(r.month).slice(0, 10),
    vendor,
    clientId: r.client_id == null ? null : String(r.client_id),
    clientName: r.client_name == null ? null : String(r.client_name),
    usd: Number(r.usd ?? 0),
  }
}

/** The last `n` months, oldest first, this month last: 'YYYY-MM-01' each. */
export function monthAxis(today: string, n = 6): string[] {
  const first = `${today.slice(0, 7)}-01`
  return Array.from({ length: n }, (_, i) => addMonths(first, i - (n - 1)))
}

export interface PivotRow {
  key: string
  label: string
  /** One figure a month, in the axis's order. */
  cells: number[]
  total: number
}

export interface Pivot {
  months: string[]
  rows: PivotRow[]
  /** Each month's total across the rows. */
  totals: number[]
  grand: number
}

export const NO_CLIENT = 'No client'

/**
 * By vendor: OpenAI, transcripts, Apify, always all three and in that order,
 * so a month with nothing reads as nothing rather than a missing row. By
 * client: biggest spender first, spend with no client last.
 */
export function pivot(rows: readonly UsageRow[], months: readonly string[], by: 'vendor' | 'client'): Pivot {
  const index = new Map(months.map((m, i) => [m, i]))
  const acc = new Map<string, PivotRow>()
  const ensure = (key: string, label: string) => {
    let r = acc.get(key)
    if (!r) {
      r = { key, label, cells: months.map(() => 0), total: 0 }
      acc.set(key, r)
    }
    return r
  }
  if (by === 'vendor') for (const v of VENDORS) ensure(v, VENDOR_LABEL[v])
  for (const u of rows) {
    const i = index.get(u.month)
    if (i === undefined) continue
    const r = by === 'vendor'
      ? ensure(u.vendor, VENDOR_LABEL[u.vendor])
      : ensure(u.clientId ?? '', u.clientId ? (u.clientName ?? 'Unknown client') : NO_CLIENT)
    r.cells[i] += u.usd
    r.total += u.usd
  }
  let list = [...acc.values()]
  if (by === 'client') {
    list = list.sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : b.total - a.total || a.label.localeCompare(b.label)))
  }
  const totals = months.map((_, i) => list.reduce((s, r) => s + r.cells[i], 0))
  return { months: [...months], rows: list, totals, grand: totals.reduce((s, t) => s + t, 0) }
}
