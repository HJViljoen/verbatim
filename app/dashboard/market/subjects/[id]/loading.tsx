import { MarketSubjectSkeleton } from '@/components/pages/v2/market/skeleton'

// Mirrors the Market subject page's own shape, so its blocks fill in place
// (lib/dashboard-loading.test.ts: every page names its own loader).
export default function Loading() {
  return <MarketSubjectSkeleton />
}
