import { ProductsCategorySkeleton } from '@/components/pages/v2/products/level-skeleton'

// Mirrors a category's page (G4-Products-Category), so its blocks fill in
// place (lib/dashboard-loading.test.ts: every page names its own loader).
export default function Loading() {
  return <ProductsCategorySkeleton />
}
