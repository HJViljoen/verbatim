import { ContentPostsSkeleton } from '@/components/pages/v2/content/skeleton'

// Mirrors your posts' page (G5-Content-Posts), so its blocks fill in place
// (lib/dashboard-loading.test.ts: every page names its own loader).
export default function Loading() {
  return <ContentPostsSkeleton />
}
