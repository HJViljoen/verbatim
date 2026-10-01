import type { Metadata } from 'next'
import { PageFrame, PageBar } from '@/components/shell/page-grid'
import { openLink } from '@/components/blocks/open-link'
import { surface } from '@/lib/nav'

// The dashboard's 404, inside the shell (finish-list item 25 polish). A
// mistyped or stale address under /dashboard used to get Next's bare "404 |
// This page could not be found" with no sidebar and no way back; now the
// sidebar stays, and the one line under the bar points at the front page.
// app/dashboard/[...rest]/page.tsx routes unmatched addresses here, and any
// page that calls notFound() lands here too.
// THE TAB'S NAME ON A REAL 404 (sw-2 item 8). Once the catch-all answers 404
// (no loader above it streams a 200 first), Next renders this boundary with
// its own segment's metadata, not the page's, and the tab read "Verbatim".
export const metadata: Metadata = { title: 'Page not found' }

export default function DashboardNotFound() {
  const front = surface('home')
  return (
    <PageFrame>
      <PageBar title="Page not found" />
      <section className="rounded-lg bg-tile p-6 shadow-tile text-[13px] leading-[1.5]">
        <p className="m-0">There’s no page at this address. The link may be mistyped, or the page may have moved.</p>
        <p className="mt-4 mb-0 font-medium">{openLink('app', front.href, `Go to ${front.label} →`)}</p>
      </section>
    </PageFrame>
  )
}
