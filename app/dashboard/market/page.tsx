// MARKET AT /dashboard/market (Design v2, depth plan T3; analysis first, as
// pages, 17 Oct): the top layer (`lib/pages/v2/market.ts`,
// `components/pages/v2/market`). Your moves held this address until Design v2
// and moved to /dashboard/moves.
//
// THE PARAMS. `?period=week|month|time` (the week by default), `?month=` (the
// month and over-time periods; old `overview?month=` links redirect here with
// the period set), `?in=` (the table's subject filter) and `?all=1`. `?at=`
// is retired: nothing opens in place.
//
// OLD LINKS STILL LAND, BEFORE ANYTHING IS READ (`redirectFor`): Your moves'
// `?rec=`, `?item=` and `?ledger=all` go to `/dashboard/moves?advice=`, and an
// open panel's `?conv=` and `?subject=` to that conversation's or subject's
// page (17 Oct), every other param kept. Stored snapshots, sent emails and
// share pages carry them, so these redirects are permanent.
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
  const away = redirectFor('/dashboard/market', sp)
  if (away) redirect(away)
  const { supabase, clientId } = await getSessionContext()
  const data = await loadMarket({ supabase, clientId, reading: readingHandle(clientId), params: marketParams(sp) })
  return <MarketPage data={data} />
}
