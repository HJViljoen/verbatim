// A PRODUCT'S PAGE ON YOUR PRODUCTS (17 Oct; boards G4-Products-Product,
// -Product-Phone, -Switcher and -Thin): "Your products / {category} /
// {product}", the evidence. Its line in code's words, every video naming it
// this month with the comments naming it under each (`?video=` one video's in
// full, `?videos=all` every video, both honoured only for the product's own
// videos), the facts, its siblings, the Agent. `?month=` as the root reads
// it. A product asked under another category redirects to its own (one hop);
// one the catalogue does not hold prints one calm line with the way back.
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { parseProductsParams } from '@/lib/pages/v2/products'
import { loadProductsLevel } from '@/lib/pages/v2/products-levels'
import { ProductsProductPage } from '@/components/pages/v2/products'
import { surface } from '@/lib/nav'
import { routeParam } from '@/lib/route-param'

export const metadata: Metadata = { title: surface('products').label }

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ group: string; product: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ group, product }, sp] = await Promise.all([params, searchParams ?? Promise.resolve({})])
  const { supabase, clientId, role } = await getSessionContext()
  const data = await loadProductsLevel({ supabase, clientId, reading: readingHandle(clientId), params: parseProductsParams(sp ?? {}), role, ask: { kind: 'product', group: routeParam(group), id: routeParam(product) } })
  if (data.redirect) redirect(data.redirect)
  return <ProductsProductPage data={data} />
}
