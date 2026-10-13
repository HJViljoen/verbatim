// MARKET AT /dashboard/market (Design v2, depth plan T3): what the market is
// talking about (`lib/pages/v2/market.ts`, `components/pages/v2/market`).
// Your moves held this address until Design v2 and moved to /dashboard/moves.
//
// THE PARAMS. `?period=week|month|time` (the week by default), `?month=` (the
// month and over-time periods; old `overview?month=` links redirect here with
// the period set), `?conv=` (a theme registry id, or a slug from an old
// `?themes=` link), `?subject=`, `?at=` (where the panel opens), `?in=` (the
// table's subject filter) and `?all=1`.
//
// YOUR MOVES' OLD LINKS STILL LAND. `?rec=`, `?item=` and `?ledger=all` named
// Your moves when it lived here; a request carrying one goes to
// `/dashboard/moves?advice=` with its other params (`redirectFor`).
//
// YOUR MARKET (page key `overview`) STAYS REGISTERED. `MarketPicturePage` and
// `loadMarketPicture`, and the legacy `OverviewPage`, render stored snapshots,
// exports and the monthly; neither is on a route.
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadMarket, marketParams } from '@/lib/pages/v2/market'
import { MarketPage } from '@/components/pages/v2/market'
import { redirectFor, surface } from '@/lib/nav'

// The tab's title is the page's own name (the root layout's template adds
// ' · Verbatim').
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
  const data = await loadMarket({ supabase, clientId, reading: readingHandle(clientId), params: marketParams(sp) })
  return <MarketPage data={data} />
}
