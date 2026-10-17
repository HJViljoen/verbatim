import { MovesAdviceSkeleton } from '@/components/pages/v2/moves/levels-skeleton'

// Mirrors a piece of advice's own shape, the hub, so its blocks fill in place
// (lib/dashboard-loading.test.ts: every page names its own loader).
export default function Loading() {
  return <MovesAdviceSkeleton />
}
