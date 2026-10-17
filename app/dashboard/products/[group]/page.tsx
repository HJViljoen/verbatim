// A CATEGORY'S PAGE ON YOUR PRODUCTS (17 Oct; boards G4-Products-Category,
// -Category-Phone and -Thin): "Your products / {category}", the hub. Its
// headline in code's words, its products as cards and a list, the
// couldn't-tell-which list with Tag for owners and admins (`?unclear=all`
// lists it whole), the numbers, the products against the category, a comment
// naming each product, the Agent. `?month=` as the root reads it. A category
// the catalogue does not hold prints one calm line with the way back, never a
// 404; a throw keeps the shell (app/dashboard/error.tsx).
import type { Metadata } from 'next'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { parseProductsParams } from '@/lib/pages/v2/products'
import { loadProductsLevel } from '@/lib/pages/v2/products-levels'
import { ProductsCategoryPage } from '@/components/pages/v2/products'
import { surface } from '@/lib/nav'
import { routeParam } from '@/lib/route-param'

export const metadata: Metadata = { title: surface('products').label }

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ group: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ group }, sp] = await Promise.all([params, searchParams ?? Promise.resolve({})])
  const { supabase, clientId, role } = await getSessionContext()
  const data = await loadProductsLevel({ supabase, clientId, reading: readingHandle(clientId), params: parseProductsParams(sp ?? {}), role, ask: { kind: 'category', id: routeParam(group) } })
  return <ProductsCategoryPage data={data} />
}
