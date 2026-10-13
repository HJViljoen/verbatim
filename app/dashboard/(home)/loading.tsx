import { HomeSkeleton } from '@/components/pages/v2/home/skeleton'

// The Dashboard's loader, in its route group so it wraps `/dashboard` alone
// (lib/dashboard-loading.test.ts): the page's own frame (Design v2, T8), with
// bones where each tile goes, the same bones each tile streams in behind.
export default function DashboardLoading() {
  return <HomeSkeleton />
}
