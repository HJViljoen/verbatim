import { PageFrame } from '@/components/shell/page-grid'

// The catch-all resolves at once (it only throws notFound()), so its loader is
// the bar's height and nothing more: without its own, an unknown address
// flashed Your market's skeleton (app/dashboard/loading.tsx) before the 404.
export default function Loading() {
  return (
    <PageFrame>
      <div role="status" aria-label="Loading" className="h-8 w-48 rounded-md bg-muted/60" />
    </PageFrame>
  )
}
