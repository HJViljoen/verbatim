import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadContent, type ContentParams } from '@/lib/pages/content'
import { ContentPage } from '@/components/pages/content'
import { OldPageBanner } from '@/components/shell/old-page-banner'
import { oldPage } from '@/lib/nav'
import type { Metadata } from 'next'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: oldPage('/dashboard/videos').label }

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
  // The quote gate on the inbox (lib/quote-gate.ts); the weekly report's call does not pass it.
  const data = await loadContent({ supabase, clientId, reading: readingHandle(clientId), params: sp }, { gate: true })
  return (
    <>
      <OldPageBanner page={oldPage('/dashboard/videos')} />
      <ContentPage data={data} params={sp} />
    </>
  )
}
