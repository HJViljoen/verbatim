import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadCompetitive, type CompetitiveParams } from '@/lib/pages/competitive'
import { CompetitivePage } from '@/components/pages/competitive'
import { OldPageBanner } from '@/components/shell/old-page-banner'
import { oldPage, tenantAway } from '@/lib/nav'
import type { Metadata } from 'next'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: oldPage('/dashboard/competitive-intel').label }

// Competitive Intelligence, PARKED at /dashboard/competitive-intel (WP9,
// decision C). Nothing on this page writes.
//
// Competitive Intelligence — "where do we stand vs <competitor>?" Loader in
// lib/pages/competitive.ts, renderers in components/pages/competitive
// (Reports & Exports, 2026-08-29).

export default async function Page({ searchParams }: { searchParams?: Promise<CompetitiveParams> }) {
  const session = await getSessionContext()
  // A tenant no longer reaches this page (lib/nav.ts TENANT_RETIRED, 1 Oct); the operator keeps it.
  const away = tenantAway(session, '/dashboard/competitive-intel')
  if (away) redirect(away)
  const { supabase, clientId } = session
  const sp = (await searchParams) ?? {}
  const data = await loadCompetitive({ supabase, clientId, reading: readingHandle(clientId), params: sp })
  return (
    <>
      <OldPageBanner page={oldPage('/dashboard/competitive-intel')} />
      <CompetitivePage data={data} detail={sp.detail} params={sp} />
    </>
  )
}
