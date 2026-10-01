import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadMarket, type MarketParams } from '@/lib/pages/market'
import { MarketPage } from '@/components/pages/market'
import { OldPageBanner } from '@/components/shell/old-page-banner'
import { oldPage, tenantAway } from '@/lib/nav'
import type { Metadata } from 'next'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: oldPage('/dashboard/market-intel').label }

// Market Intelligence, PARKED at /dashboard/market-intel (WP9, decision C).
// The new Market takes /dashboard/market and reads the same recommendation
// ledger, which is why the status control stays live here rather than being
// disabled for the window: it writes to `rec_decisions` + `recommendations.
// status`, both pages read them, and the action revalidates both addresses.
//
// Market Intelligence — "what should we do?" Loader in lib/pages/market.ts,
// renderers in components/pages/market (Reports & Exports, 2026-08-29).

export default async function Page({ searchParams }: { searchParams?: Promise<MarketParams> }) {
  const session = await getSessionContext()
  // A tenant no longer reaches this page (lib/nav.ts TENANT_RETIRED, 1 Oct); the operator keeps it.
  const away = tenantAway(session, '/dashboard/market-intel')
  if (away) redirect(away)
  const { supabase, clientId } = session
  const sp = (await searchParams) ?? {}
  const data = await loadMarket({ supabase, clientId, reading: readingHandle(clientId), params: sp })
  return (
    <>
      <OldPageBanner page={oldPage('/dashboard/market-intel')} />
      <MarketPage data={data} detail={sp.detail} params={sp} />
    </>
  )
}
