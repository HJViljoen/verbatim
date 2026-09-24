import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadOverview } from '@/lib/pages/overview'
import { OverviewPage } from '@/components/pages/overview'

// Overview — "what is this month's reading?" (Phase 1 WP11). The front page is
// now the comment-dated monthly reading: lib/pages/overview.ts loads it and
// components/pages/overview draws it as seven blocks, in the monthly report's
// own order.
//
// THE LEGACY DASHBOARD IS STILL REGISTERED, AND IS NO LONGER ON A ROUTE.
// `components/pages/dashboard` stays in the renderable registry (WP9) because
// one sent snapshot, one live share link and two active weekly schedules are
// keyed on `dashboard.*` tiles and would render a section short without it. It
// is simply not what `/dashboard` draws any more — which is also how
// `dashboard.share`'s Ring and the movement tile leave the live product: they
// keep rendering inside the artefacts that already name them, and no reader
// meets them on a page again.

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const sp = (await searchParams) ?? {}
  const { supabase, clientId } = await getSessionContext()
  const data = await loadOverview({ supabase, clientId, reading: readingHandle(clientId), params: sp })
  return <OverviewPage data={data} params={sp} />
}
