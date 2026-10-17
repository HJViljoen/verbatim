import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getSessionContext } from '@/lib/auth'
import { redirectFor, surface } from '@/lib/nav'
import { readingHandle } from '@/lib/reading/read'
import { loadProductCatalogue } from '@/lib/products/types'
import { loadProducts, parseProductsParams } from '@/lib/pages/v2/products'
import { productGroupOf } from '@/lib/pages/v2/products-levels'
import { ProductsPage } from '@/components/pages/v2/products'

// The tab's title is the page's own name (the root layout's template adds
// ' · Verbatim').
export const metadata: Metadata = { title: surface('products').label }

// YOUR PRODUCTS AT /dashboard/products (Design v2, depth plan T5; boards
// E4-Products and G4-Products): what the market says about what the client
// sells, by the client's own catalogue (Settings › Your products) as the
// products step placed its talk (lib/pages/v2/products.ts). The root: the
// four standouts and the shelf. Every card, column head and tile opens a
// PAGE (17 Oct): a category's (`/dashboard/products/<category id>`, the hub)
// or a product's (`/dashboard/products/<category id>/<product id>`).
//
// OLD LINKS STILL LAND, BEFORE THE PAGE IS READ (`redirectFor`): the panels'
// `?group=`, `?product=` and `?unclear=all` (Settings' "Tag them", the
// Dashboard's tile, Voices, sent weekly emails) go to their pages for good,
// `?month=` kept. A product's page nests under its category, so a `?product=`
// link reads the catalogue first (one call) to find it.
//
// Until the products migration is applied, the client has a catalogue and
// PRODUCT_READINGS_ENABLED is on for it, the page says which of those it is
// waiting for and links to Settings › Your products.

export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = (await searchParams) ?? {}
  const { supabase, clientId, role } = await getSessionContext()
  const reading = readingHandle(clientId)
  const known = sp.product
    ? { productGroup: productGroupOf(await loadProductCatalogue(reading.client, clientId).then((r) => (r.state === 'ready' ? r.catalogue : null)).catch(() => null)) }
    : {}
  const away = redirectFor('/dashboard/products', sp, known)
  if (away) redirect(away)
  const params = parseProductsParams(sp)
  const data = await loadProducts({ supabase, clientId, reading, params, role })
  return <ProductsPage data={data} />
}
