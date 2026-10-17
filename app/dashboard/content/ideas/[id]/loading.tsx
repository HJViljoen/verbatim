import { ContentIdeaSkeleton } from '@/components/pages/v2/content/skeleton'

// Mirrors a post idea's page (G5-Content-Idea), so its blocks fill in place
// (lib/dashboard-loading.test.ts: every page names its own loader).
export default function Loading() {
  return <ContentIdeaSkeleton />
}
