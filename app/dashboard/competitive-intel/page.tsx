import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadCompetitive, type CompetitiveParams } from '@/lib/pages/competitive'
import { CompetitivePage } from '@/components/pages/competitive'
import { OldPageBanner } from '@/components/shell/old-page-banner'
import { oldPage } from '@/lib/nav'

// Competitive Intelligence, PARKED at /dashboard/competitive-intel (WP9,
// decision C). Nothing on this page writes.
//
// Competitive Intelligence — "where do we stand vs <competitor>?" Loader in
// lib/pages/competitive.ts, renderers in components/pages/competitive
// (Reports & Exports, 2026-08-29).

export default async function Page({ searchParams }: { searchParams?: Promise<CompetitiveParams> }) {
  const { supabase, clientId } = await getSessionContext()
  const sp = (await searchParams) ?? {}
  const data = await loadCompetitive({ supabase, clientId, reading: readingHandle(clientId), params: sp })
  return (
    <>
      <OldPageBanner page={oldPage('/dashboard/competitive-intel')} />
      <CompetitivePage data={data} detail={sp.detail} params={sp} />
    </>
  )
}
