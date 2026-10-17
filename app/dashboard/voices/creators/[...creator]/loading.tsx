import { VoicesCreatorSkeleton } from '@/components/pages/v2/voices/skeleton'

// Mirrors the creator page's own shape, so its blocks fill in place
// (lib/dashboard-loading.test.ts: every page names its own loader).
export default function Loading() {
  return <VoicesCreatorSkeleton />
}
