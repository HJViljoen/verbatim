import { HomeSkeleton } from '@/components/pages/home/skeleton'

// The Dashboard's loader, in its route group so it wraps `/dashboard` alone
// (lib/dashboard-loading.test.ts): the page's own frame with bones where its
// words and numbers go (HOME's skeleton).
export default function DashboardLoading() {
  return <HomeSkeleton />
}
