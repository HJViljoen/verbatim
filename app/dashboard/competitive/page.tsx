import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadCompetitiveSurface } from '@/lib/pages/competitive-surface'
import { CompetitiveSurfacePage } from '@/components/pages/competitive-surface'
import type { Metadata } from 'next'
import { surface } from '@/lib/nav'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: surface('competitive').label }

// Competitive (renamed from Brands; pages build, 1 Oct), drawn to the approved
// artboard Page-Competitive.dc.html by components/pages/competitive-surface/
// page. The address Competitive Intelligence used to hold; that page is parked
// at /dashboard/competitive-intel until OLD_PAGES_RETIRE_ON.
//
// `?vs=<brand>` names the brand read in full. Neither this page nor its loader reads
// `run_summary.period_share_of_voice`: the parked page keeps that layer, and
// this one is the monthly reading. The page asks its loader for the Brands
// readings (`{ brands: true }`); the quarterly and the briefs do not.

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const sp = (await searchParams) ?? {}
  const { supabase, clientId } = await getSessionContext()
  const data = await loadCompetitiveSurface({ supabase, clientId, reading: readingHandle(clientId), params: sp }, { brands: true })
  return <CompetitiveSurfacePage data={data} params={sp} />
}
