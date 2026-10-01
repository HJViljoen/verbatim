// THE DASHBOARD AT /dashboard (the navigation of 1 Oct; page review §2). Nav
// key `home` and NO page key: page key `dashboard` is a stored contract (a
// sent snapshot, a share link, Össur's digest schedule) that names the legacy
// module, which stays in the registry and is never a route.
//
// In a route group with its own loader, as Your market was (sw-2 item 8): a
// loader at app/dashboard/loading.tsx would wrap every dashboard address, the
// catch-all's 404 included, and stream it as a 200.
//
// HOME (`components/pages/home`, `lib/pages/home.ts`) builds the page. Until it
// merges this renders the title alone and imports nothing of HOME's; the lead
// swaps the body for `<HomePage … />`.
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { frontRedirect, surface, type SearchProps } from '@/lib/nav'

// The tab's title is the page's own name (the root layout's template adds
// ' · Verbatim').
export const metadata: Metadata = { title: surface('home').label }

export default async function Page({ searchParams }: SearchProps) {
  // `/dashboard?month=` is Your market's old address for a month (the monthly
  // email linked it until 1 Oct): it lands there, query and all.
  const away = frontRedirect((await searchParams) ?? {})
  if (away) redirect(away)
  return (
    <PageFrame>
      <PageBar title={surface('home').label} />
    </PageFrame>
  )
}
