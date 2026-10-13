import type { MonthProductReadingRow } from './types'
import { monthStartOf } from '../reading/month-key'

// ONE BASIS FOR A PRODUCT'S MONTH (depth v2, T5; the lead's call, 13 Oct):
// the market's talk. Your products (lib/pages/v2/products.ts) and Settings ›
// Your products (lib/settings/products.ts, "this month") both pool a
// product's or a category's `month_product_readings` rows through
// `marketProductMonth`, over the audiences the Market page pools
// (`marketAudiences`, lib/reading/market.ts: the tracked rivals' and the
// category's), so the two surfaces never print two numbers for one product.
// The client's own posts are in no row (the products step reads
// `market_month_videos`, which leaves out every video filed under the
// client); a rival no longer tracked is left out as the Market page leaves
// it out. A month never adds to another (AGENTS.md: denominators do not add
// across months), and an audience counted twice is counted once.

/** A stored product month as the page reads it. */
export type ProductMonthRow = Pick<MonthProductReadingRow,
  'month' | 'audience' | 'object_kind' | 'object_id' | 'group_id' | 'product_id' | 'k_named' | 'k_unclear' | 'k_unbranded' | 'k_any' | 'comments' | 'n' | 'catalogue_version' | 'status'>

export interface PooledProductMonth {
  k_named: number
  k_unclear: number
  k_unbranded: number
  k_any: number
  comments: number
  n: number
  catalogueVersion: string | null
}

/**
 * One object's month pooled over the market's audiences (the Market page's
 * pooling: the tracked rivals' and the category's, never the client's), or
 * null where the month holds no row for it in any of them: an unread object
 * is never a zero. Audiences of one month are disjoint, so the sums are
 * distinct videos; a repeat of an audience is counted once. PURE.
 *
 * THE ONE BASIS. Settings › Your products' "this month" reads through this
 * too, so the two surfaces never disagree.
 */
export function marketProductMonth(
  rows: readonly Pick<ProductMonthRow, 'month' | 'audience' | 'object_id' | 'k_named' | 'k_unclear' | 'k_unbranded' | 'k_any' | 'comments' | 'n' | 'catalogue_version'>[],
  month: string,
  objectId: string,
  audiences: readonly string[] | ReadonlySet<string>,
): PooledProductMonth | null {
  const keep = audiences instanceof Set ? audiences : new Set(audiences as readonly string[])
  const m = monthStartOf(month)
  const seen = new Set<string>()
  let out: PooledProductMonth | null = null
  for (const r of rows) {
    if (r.object_id !== objectId || !keep.has(r.audience) || monthStartOf(r.month) !== m || seen.has(r.audience)) continue
    seen.add(r.audience)
    out ??= { k_named: 0, k_unclear: 0, k_unbranded: 0, k_any: 0, comments: 0, n: 0, catalogueVersion: r.catalogue_version ?? null }
    out.k_named += Number(r.k_named) || 0
    out.k_unclear += Number(r.k_unclear) || 0
    out.k_unbranded += Number(r.k_unbranded) || 0
    out.k_any += Number(r.k_any) || 0
    out.comments += Number(r.comments) || 0
    out.n += Number(r.n) || 0
  }
  return out
}

