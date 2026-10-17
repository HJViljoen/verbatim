import { MovesMoveSkeleton } from '@/components/pages/v2/moves/levels-skeleton'

// Mirrors a dated move's own shape, the evidence, so its blocks fill in place
// (lib/dashboard-loading.test.ts: every page names its own loader).
export default function Loading() {
  return <MovesMoveSkeleton />
}
