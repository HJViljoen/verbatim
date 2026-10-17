// Your products' addresses (depth v2, T5; as pages, 17 Oct, the G4 boards):
// its params and its link builders, apart from the page's loader so Settings
// › Your products, Voices, the Dashboard and the weekly email can link to a
// category or a product without importing the page's reads.
//
// THE PAGES (Heinrich approved the G4 boards on 17 Oct, nested addresses):
//
//   /dashboard/products                              the root: the standouts and the shelf
//   /dashboard/products/<category id>                a category, the hub
//   /dashboard/products/<category id>/<product id>   a product, the evidence
//
// Every level reads `?month=` (`YYYY-MM`) as the root does. A category's page
// reads `?unclear=all` (its whole couldn't-tell-which list, `#unclear`); a
// product's reads `?video=<videos.id>` (one video's comments naming it, in
// full) and `?videos=all` (every video naming it). The root's `?group=`,
// `?product=` and `?unclear=all` opened a panel in place until 17 Oct: they
// redirect to these pages for good (lib/nav.ts `redirectFor`).
//
// NO IMPORT OF lib/nav.ts. The redirect table there builds these addresses,
// so this module is its leaf: the root's address is written here once and
// pinned equal to the sidebar's (`surface('products').href`) by a test.

/** The page's own address (`surface('products').href`, pinned equal). */
export const PRODUCTS_HREF = '/dashboard/products'

export interface ProductsParams {
  /** A category's id (`product_groups.id`). The root's old panel param:
   *  redirected to the category's page. */
  group?: string
  /** A product's id (`products.id`). The root's old panel param: redirected
   *  to the product's page. */
  product?: string
  /** `all` lists a category's whole couldn't-tell-which list. */
  unclear?: string
  /** `?month=YYYY-MM`, as every reading page takes it. */
  month?: string
  /** A product's page: one of its videos' comments naming it, in full. */
  video?: string
  /** A product's page: `all` lists every video naming it. */
  videos?: string
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
  for (const k of ['group', 'product', 'unclear', 'month', 'video', 'videos'] as const) {
    const v = paramValue(sp[k])
    if (v) out[k] = v
  }
  return out
}

export type OpenKind = 'group' | 'product'

/** What a link opens: a category, or a product with its category (the
 *  address nests it). A product named without its category is the old
 *  `?product=` link, which redirects in one hop: a builder that has the
 *  category always passes it. */
export type ProductsTarget =
  | { kind: 'group'; id: string }
  | { kind: 'product'; id: string; group?: string | null }

/** The anchor of a category's couldn't-tell-which list. */
export const UNCLEAR_ID = 'unclear'
/** The anchor of a product's list of videos. */
export const WHERE_NAMED_ID = 'where-named'

/** A category's page. */
export const productsCategoryPath = (groupId: string): string => `${PRODUCTS_HREF}/${encodeURIComponent(groupId)}`
/** A product's page, under its own category. */
export const productsProductPath = (groupId: string, productId: string): string => `${productsCategoryPath(groupId)}/${encodeURIComponent(productId)}`

/**
 * A Your products address with the month kept. Nothing: the root. A category:
 * its page (`all` with `?unclear=all`; `at: 'unclear'` lands on the list). A
 * product with its category: its page. A product without one: the old panel
 * address, which redirects to its page (`redirectFor`).
 */
export function productsHref(params: Pick<ProductsParams, 'month'>, open: ProductsTarget | null = null, opts: { all?: boolean; at?: 'unclear' } = {}): string {
  const q = new URLSearchParams()
  if (params.month) q.set('month', params.month)
  let path = PRODUCTS_HREF
  let hash: string | null = null
  if (open?.kind === 'group') {
    path = productsCategoryPath(open.id)
    if (opts.all) q.set('unclear', 'all')
    if (opts.at === 'unclear') hash = UNCLEAR_ID
  } else if (open?.kind === 'product') {
    if (open.group) path = productsProductPath(open.group, open.id)
    else q.set('product', open.id)
  }
  const s = q.toString()
  return `${path}${s ? `?${s}` : ''}${hash ? `#${hash}` : ''}`
}

/** A product's page with its own params: one video opened (its card's
 *  anchor), or every video listed (the list's). */
export function productPageHref(groupId: string, productId: string, params: Pick<ProductsParams, 'month'>, opts: { video?: string | null; videos?: 'all' | null } = {}): string {
  const q = new URLSearchParams()
  if (params.month) q.set('month', params.month)
  if (opts.video) q.set('video', opts.video)
  if (opts.videos) q.set('videos', opts.videos)
  const s = q.toString()
  const hash = opts.video ? `video-${opts.video}` : opts.videos ? WHERE_NAMED_ID : null
  return `${productsProductPath(groupId, productId)}${s ? `?${s}` : ''}${hash ? `#${hash}` : ''}`
}
