import type { Metadata } from 'next'
import { ProductsPage } from '@/components/pages/products'
import { surface } from '@/lib/nav'

// The tab's title is the page's own name (the root layout's template adds
// ' · Verbatim').
export const metadata: Metadata = { title: surface('products').label }

// YOUR PRODUCTS AT /dashboard/products (Design v2, decision 6 of the depth
// plan). A placeholder that reads nothing until the page lands (depth plan T5):
// components/pages/products.
export default function Page() {
  return <ProductsPage />
}
