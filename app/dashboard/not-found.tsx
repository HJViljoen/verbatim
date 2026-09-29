import { PageFrame, PageBar } from '@/components/shell/page-grid'
import { openLink } from '@/components/blocks/open-link'
import { surface } from '@/lib/nav'

// The dashboard's 404, inside the shell (finish-list item 25 polish). A
// mistyped or stale address under /dashboard used to get Next's bare "404 |
// This page could not be found" with no sidebar and no way back; now the
// sidebar stays, and the one line under the bar points at the front page.
// app/dashboard/[...rest]/page.tsx routes unmatched addresses here, and any
// page that calls notFound() lands here too.
export default function DashboardNotFound() {
  const front = surface('overview')
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
