import type { Metadata } from 'next'
import { getSessionContext } from '@/lib/auth'
import { surface } from '@/lib/nav'
import { readingHandle } from '@/lib/reading/read'
import { loadProducts, parseProductsParams } from '@/lib/pages/v2/products'
import { ProductsPage } from '@/components/pages/v2/products'

// The tab's title is the page's own name (the root layout's template adds
// ' · Verbatim').
export const metadata: Metadata = { title: surface('products').label }

// YOUR PRODUCTS AT /dashboard/products (Design v2, depth plan T5; boards
// E4-Products and E4-Products-Liners): what the market says about what the
// client sells, by the client's own catalogue (Settings › Your products) as
// the products step placed its talk (lib/pages/v2/products.ts). One item opens
// in place under the catalogue: `?group=<id>` a category (Settings' "Tag them"
// link names one), `?product=<id>` a product; `?unclear=all` lists every line
// of the open category's couldn't-tell-which talk.
//
// WHO MAY TAG: the Tag controls are drawn for an owner or an admin (and the
// operator viewing a tenant, who arrives as its owner), and `tagProduct`
// refuses anyone else anyway (lib/actions/product-tags.ts).
//
// Until the products migration is applied, the client has a catalogue and
// PRODUCT_READINGS_ENABLED is on for it, the page says which of those it is
// waiting for and links to Settings › Your products.

export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, clientId, role } = await getSessionContext()
  const params = parseProductsParams((await searchParams) ?? {})
  const data = await loadProducts({ supabase, clientId, reading: readingHandle(clientId), params, role })
  return <ProductsPage data={data} />
}
