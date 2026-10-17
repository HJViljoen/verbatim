import { MovesRecordSkeleton } from '@/components/pages/v2/moves/levels-skeleton'

// Mirrors the advice record's own shape, so its groups fill in place
// (lib/dashboard-loading.test.ts: every page names its own loader).
export default function Loading() {
  return <MovesRecordSkeleton />
}
