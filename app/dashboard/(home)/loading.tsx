import { SkeletonSurface } from '@/components/shell/skeleton'

// The Dashboard's loader, in its route group so it wraps `/dashboard` alone
// (lib/dashboard-loading.test.ts). Until HOME merges this is the bar alone, as
// the page is; HOME's skeleton replaces it with the page's own blocks.
export default function DashboardLoading() {
  return <SkeletonSurface nav="home">{null}</SkeletonSurface>
}
