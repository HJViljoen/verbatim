import { redirect } from 'next/navigation'
import { RETIRED_ADDRESSES, withQuery, type SearchProps } from '@/lib/nav'

// REPORTS FOLDED INTO THE STUDIO (the navigation of 1 Oct; page review §1
// Studio and §4). The Studio is shown to clients now (STUDIO_TENANT_VISIBLE)
// and carries their reports, who gets them and every past issue, so this
// address only redirects, with its query intact: an old `?group=sent&item=…`
// or `?view=…` link reaches the Studio's past issues.
//
// No loader: a Suspense boundary above a redirect streams the shell first and
// turns a 307 into a client-side hop (lib/dashboard-loading.test.ts INHERITS).
// The Studio's own guard sends a session that may not see it to the Dashboard,
// never back here (STUDIO_AWAY_HREF), so the two cannot loop.
export default async function ReportsPage({ searchParams }: SearchProps) {
  redirect(withQuery(RETIRED_ADDRESSES['/dashboard/reports'], (await searchParams) ?? {}))
}
