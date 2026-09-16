import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadCompetitiveSurface } from '@/lib/pages/competitive-surface'
import { CompetitiveSurfacePage } from '@/components/pages/competitive-surface'

// Competitive — "who else is in this, and are they gaining?" (Phase 1 WP14).
// The address Competitive Intelligence used to hold; that page is parked at
// /dashboard/competitive-intel until OLD_PAGES_RETIRE_ON.
//
// `?vs=<rival>` scopes the surface and `?horizon=` sets the window. Neither
// this page nor its loader reads `run_summary.period_share_of_voice`: the
// parked page keeps that layer, and this one is the monthly reading.

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const sp = (await searchParams) ?? {}
  const { supabase, clientId } = await getSessionContext()
  const data = await loadCompetitiveSurface({ supabase, clientId, reading: readingHandle(clientId), params: sp })
  return <CompetitiveSurfacePage data={data} params={sp} />
}
