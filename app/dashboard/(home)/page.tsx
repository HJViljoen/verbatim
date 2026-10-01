// THE DASHBOARD AT /dashboard (the navigation of 1 Oct; page review §2). Nav
// key `home` and NO page key: page key `dashboard` is a stored contract (a
// sent snapshot, a share link, Össur's digest schedule) that names the legacy
// module, which stays in the registry and is never a route.
//
// In a route group with its own loader, as Your market was (sw-2 item 8): a
// loader at app/dashboard/loading.tsx would wrap every dashboard address, the
// catch-all's 404 included, and stream it as a 200.
//
// HOME builds the page (`components/pages/home`, `lib/pages/home.ts`): one
// wave of light reads, and the published weekly read (lib/written/published.ts)
// behind its numbers and tiles.
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { HomePage } from '@/components/pages/home'
import { getSessionContext } from '@/lib/auth'
import { frontRedirect, surface, type SearchProps } from '@/lib/nav'
import { loadHome } from '@/lib/pages/home'

// The tab's title is the page's own name (the root layout's template adds
// ' · Verbatim').
export const metadata: Metadata = { title: surface('home').label }

export default async function Page({ searchParams }: SearchProps) {
  // `/dashboard?month=` is Your market's old address for a month (the monthly
  // email linked it until 1 Oct): it lands there, query and all.
  const away = frontRedirect((await searchParams) ?? {})
  if (away) redirect(away)
  const { supabase, clientId } = await getSessionContext()
  return <HomePage data={await loadHome({ supabase, clientId })} />
}
