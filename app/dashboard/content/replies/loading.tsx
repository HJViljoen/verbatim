import { ContentRepliesSkeleton } from '@/components/pages/v2/content/skeleton'

// Mirrors the reply list's page (G5-Content-Replies), so its blocks fill in
// place (lib/dashboard-loading.test.ts: every page names its own loader).
export default function Loading() {
  return <ContentRepliesSkeleton />
}
