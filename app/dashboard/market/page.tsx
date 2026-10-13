// MARKET AT /dashboard/market (Design v2, decision 6 of the depth plan): what
// the market is talking about. Your moves held this address until Design v2
// and moved to /dashboard/moves.
//
// A PLACEHOLDER UNTIL THE MARKET PAGE LANDS (depth plan T3): Your market's
// bigger picture as it was drawn at /dashboard/overview (the newest long-run
// read, where your market stands, the biggest conversations, what people do
// in the comments: lib/pages/overview-picture.ts,
// components/pages/overview/picture), which this page replaces.
//
// YOUR MOVES' OLD LINKS STILL LAND. `?rec=` (four sent emails and every digest
// until WP17), `?item=` (the advice ledger's row) and `?ledger=all` named Your
// moves when it lived here; a request carrying one goes to
// `/dashboard/moves?advice=` with its other params (`redirectFor`). This
// page's loader wraps the redirect, so it lands by the client-side hop rather
// than a 307 (the Dashboard's `?month=` redirect does the same).
//
// THE LEGACY OVERVIEW IS STILL REGISTERED, AND IS NOT ON A ROUTE.
// `OverviewPage` / `loadOverview` stay for the monthly, the export module and
// stored snapshots (`components/pages/overview`), under page key `overview`.
import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadMarketPicture } from '@/lib/pages/overview-picture'
import { MarketPicturePage } from '@/components/pages/overview/picture'
import type { Metadata } from 'next'
import { redirectFor, surface } from '@/lib/nav'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: surface('market').label }

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const sp = (await searchParams) ?? {}
  const moves = redirectFor('/dashboard/market', sp)
  if (moves) redirect(moves)
  const { supabase, clientId } = await getSessionContext()
  const data = await loadMarketPicture({ supabase, clientId, reading: readingHandle(clientId), params: sp })
  return <MarketPicturePage data={data} />
}
