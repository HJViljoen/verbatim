import { surface } from '../../nav'

// Your products' address (depth v2, T5): its params and the one link builder,
// apart from the page's loader so Settings › Your products can link to a
// category's couldn't-tell-which list (`productsHref`, with the month the two
// surfaces share) without importing the page's reads.

/** The page's own address. */
export const PRODUCTS_HREF = surface('products').href

export interface ProductsParams {
  /** A category's id (`product_groups.id`). Settings' "Tag them" link names it. */
  group?: string
  /** A product's id (`products.id`). */
  product?: string
  /** `all` lists every line of the open category's couldn't-tell-which talk. */
  unclear?: string
  /** `?month=YYYY-MM`, as every reading page takes it. */
  month?: string
}

/** One query value: the first of a repeated key, trimmed; empty is absent. */
function paramValue(raw: string | string[] | undefined | null): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw
  const t = typeof v === 'string' ? v.trim() : ''
  return t === '' ? undefined : t
}

/** The page's params from a request's search params. */
export function parseProductsParams(raw: Record<string, string | string[] | undefined> | null | undefined): ProductsParams {
  const sp = raw ?? {}
  const out: ProductsParams = {}
  for (const k of ['group', 'product', 'unclear', 'month'] as const) {
    const v = paramValue(sp[k])
    if (v) out[k] = v
  }
  return out
}

export type OpenKind = 'group' | 'product'

/** Each panel's anchor id. */
export const PANEL_ID: Readonly<Record<OpenKind, string>> = {
  group: 'category-panel',
  product: 'product-panel',
}

/** The anchor of the couldn't-tell-which list inside a category's panel. */
export const UNCLEAR_ID = 'unclear'

/**
 * The page's address with the month kept and at most one item open. `all`
 * keeps the open category's full couldn't-tell-which list. The hash is the
 * open panel's anchor (or the list's), so the browser lands on it.
 */
export function productsHref(params: Pick<ProductsParams, 'month'>, open: { kind: OpenKind; id: string } | null = null, opts: { all?: boolean; at?: 'unclear' } = {}): string {
  const q = new URLSearchParams()
  if (params.month) q.set('month', params.month)
  if (open) q.set(open.kind, open.id)
  if (open?.kind === 'group' && opts.all) q.set('unclear', 'all')
  const s = q.toString()
  const hash = open ? (opts.at === 'unclear' && open.kind === 'group' ? UNCLEAR_ID : PANEL_ID[open.kind]) : null
  return `${PRODUCTS_HREF}${s ? `?${s}` : ''}${hash ? `#${hash}` : ''}`
}

