import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadContent, type ContentParams } from '@/lib/pages/content'
import { ContentPage } from '@/components/pages/content'
import { OldPageBanner } from '@/components/shell/old-page-banner'
import { oldPage } from '@/lib/nav'

// Content, retiring (WP9, decision C). It keeps its own address — the label
// and the route never matched — and the banner names This week, which takes
// what worked and what is rising; the reply inbox is Phase 2 and stays here.
//
// Content — "what content works, and who to answer?" Loader in
// lib/pages/content.ts, renderers in components/pages/content (Reports &
// Exports, 2026-08-29).

export default async function Page({ searchParams }: { searchParams?: Promise<ContentParams> }) {
  const { supabase, clientId } = await getSessionContext()
  const sp = (await searchParams) ?? {}
  const data = await loadContent({ supabase, clientId, reading: readingHandle(clientId), params: sp })
  return (
    <>
      <OldPageBanner page={oldPage('/dashboard/videos')} />
      <ContentPage data={data} params={sp} />
    </>
  )
}
