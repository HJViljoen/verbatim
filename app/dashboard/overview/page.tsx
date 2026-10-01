// YOUR MARKET AT /dashboard/overview (1 Oct; page review §5.1). It was the
// front page, in the `(front)` route group so its loader wrapped it alone
// (sw-2 item 8); the Dashboard took `/dashboard`, and this folder is its own
// segment now, so the loader beside it still wraps this page and no other.
//
// "THE BIGGER PICTURE" (pages build, MARKET, to Page-Your-market.dc.html):
// what holds across the record (the newest long-run read), where your market
// stands, the biggest conversations, and what people do in the comments
// (lib/pages/overview-picture.ts, components/pages/overview/picture).
//
// THE LEGACY OVERVIEW IS STILL REGISTERED, AND IS NO LONGER ON A ROUTE.
// `OverviewPage` / `loadOverview` stay for the monthly, the export module and
// stored snapshots (`components/pages/overview`), as the legacy dashboard did
// before it: they keep rendering inside the artefacts that already name them.
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadMarketPicture } from '@/lib/pages/overview-picture'
import { MarketPicturePage } from '@/components/pages/overview/picture'
import type { Metadata } from 'next'
import { surface } from '@/lib/nav'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: surface('overview').label }

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const sp = (await searchParams) ?? {}
  const { supabase, clientId } = await getSessionContext()
  const data = await loadMarketPicture({ supabase, clientId, reading: readingHandle(clientId), params: sp })
  return <MarketPicturePage data={data} />
}
