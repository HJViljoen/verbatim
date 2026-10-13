// THE DASHBOARD AT /dashboard (Design v2, depth plan T8; boards E1-Dashboard
// and E1-Dashboard-Phone). Nav key `home` and NO page key: page key
// `dashboard` is a stored contract (a sent snapshot, a share link, Össur's
// digest schedule) that names the legacy module, which stays in the registry
// and is never a route.
//
// In a route group with its own loader, as Your market was (sw-2 item 8): a
// loader at app/dashboard/loading.tsx would wrap every dashboard address, the
// catch-all's 404 included, and stream it as a 200.
//
// ONE WAVE, STREAMED (lib/pages/v2/home.ts `startDashboard`): every tile's
// reads start here, together, on one session client and one reading handle,
// and nothing is awaited before the page is drawn; each tile streams in
// behind its own bones as its read settles (`DashboardStream`), and a tile
// whose read fails loses only itself.
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { DashboardStream } from '@/components/pages/v2/home'
import { getSessionContext } from '@/lib/auth'
import { mayDecideMoves } from '@/lib/moves-access'
import { frontRedirect, surface, type SearchProps } from '@/lib/nav'
import { readingHandle } from '@/lib/reading/read'
import { startDashboard } from '@/lib/pages/v2/home'

// The tab's title is the page's own name (the root layout's template adds
// ' · Verbatim').
export const metadata: Metadata = { title: surface('home').label }

export default async function Page({ searchParams }: SearchProps) {
  // `/dashboard?month=` is Your market's old address for a month (the monthly
  // email linked it until 1 Oct): it lands there, query and all.
  const away = frontRedirect((await searchParams) ?? {})
  if (away) redirect(away)
  const { supabase, clientId, role } = await getSessionContext()
  const reads = startDashboard({ supabase, clientId, reading: readingHandle(clientId), canDecide: mayDecideMoves(role) })
  return <DashboardStream reads={reads} />
}
