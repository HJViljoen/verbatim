import type { MonthProductReadingRow } from './types'
import { monthStartOf } from '../reading/month-key'

// ONE BASIS FOR A PRODUCT'S MONTH (depth v2, T5; the lead's ruling of 13 Oct):
// every video of the month, EVERY audience pooled, the client's included. A
// creator's video that names the client is where talk about its products
// lives, and the comments under its own posts are the market speaking on the
// brand's post; what the client's own posts SAY never places anything (the
// products step's `contentFields`, lib/products/readings.ts), so pooling the
// client's audience adds the market's words about the products and none of
// the brand's. Your products (lib/pages/v2/products.ts) and Settings › Your
// products (lib/settings/products.ts, "this month") both pool through
// `marketProductMonth`, so the two surfaces never print two numbers for one
// product. A month never adds to another (AGENTS.md: denominators do not add
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
 * One object's month pooled over every audience (or over `audiences` where a
 * caller names them), or null where the month holds no row for it: an unread
 * object is never a zero. Audiences of one month are disjoint, so the sums are
 * distinct videos; a repeat of an audience is counted once. PURE.
 *
 * THE ONE BASIS. Settings › Your products' "this month" reads through this
 * too, so the two surfaces never disagree.
 */
export function marketProductMonth(
  rows: readonly Pick<ProductMonthRow, 'month' | 'audience' | 'object_id' | 'k_named' | 'k_unclear' | 'k_unbranded' | 'k_any' | 'comments' | 'n' | 'catalogue_version'>[],
  month: string,
  objectId: string,
  audiences: readonly string[] | ReadonlySet<string> | null = null,
): PooledProductMonth | null {
  const keep = audiences == null ? null : audiences instanceof Set ? audiences : new Set(audiences as readonly string[])
  const m = monthStartOf(month)
  const seen = new Set<string>()
  let out: PooledProductMonth | null = null
  for (const r of rows) {
    if (r.object_id !== objectId || (keep && !keep.has(r.audience)) || monthStartOf(r.month) !== m || seen.has(r.audience)) continue
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

