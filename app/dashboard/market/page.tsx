import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadMarketSurface } from '@/lib/pages/market-surface'
import { MarketSurfacePage } from '@/components/pages/market-surface'

// Market — "what should we do, and is it working?" (Phase 1 WP14). The address
// Market Intelligence used to hold; that page is parked at
// /dashboard/market-intel until OLD_PAGES_RETIRE_ON and still answers.
//
// THE LEGACY `?rec=<id>` ALIAS LANDS HERE. Four sent emails and every digest
// until WP17 carry that parameter, and the loader resolves it to the LINEAGE
// the recommendation belongs to — the row's own id is deleted and reinserted
// every update, so the id in a three-week-old email names nothing while its
// lineage still names the same advice.

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const sp = (await searchParams) ?? {}
  const { supabase, clientId } = await getSessionContext()
  const data = await loadMarketSurface({ supabase, clientId, reading: readingHandle(clientId), params: sp })
  return <MarketSurfacePage data={data} params={sp} />
}
