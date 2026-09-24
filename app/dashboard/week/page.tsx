import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadWeek } from '@/lib/pages/week'
import { WeekPage } from '@/components/pages/week'

// This week — "what needs attention this week?" (Phase 1 WP15, decision P).
//
// The one Phase 1 surface dated by the UPDATE rather than by the month:
// lib/pages/week.ts reads the run's own frozen window and hands back seven
// blocks, and components/pages/week draws them in the weekly report's order.
// WP17 arranges the same block keys into the email, so the page and the
// artefact are one reading rather than two.

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const sp = (await searchParams) ?? {}
  const { supabase, clientId } = await getSessionContext()
  const data = await loadWeek({ supabase, clientId, reading: readingHandle(clientId), params: sp })
  return <WeekPage data={data} params={sp} />
}
