import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadContentPage } from '@/lib/pages/v2/content'
import { ContentPage } from '@/components/pages/v2/content/page'
import type { Metadata } from 'next'
import { surface } from '@/lib/nav'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: surface('content').label }

// CONTENT AT /dashboard/content (Design v2, depth plan T6; boards E5-Content
// and E5-Content-Open): what should we post next, and what works?
//
// lib/pages/v2/content.ts reads the week's post ideas, what works in the
// market's videos this month, the comments worth a reply, your own posts and
// the other questions asked; components/pages/v2/content draws them. Opens a
// post idea in place with `?idea=<rank>`, the reply list with `?replies=1`,
// your posts with `?posts=1`; `?period=month` reads the month instead of the
// week, `?asked=all` lists every question.
//
// THE PLACEHOLDER IT REPLACES. Until T6 this route drew This week
// (`WeekReadPage`, lib/pages/week-read.ts), which stays in the tree for
// /dashboard/week's history and the weekly read's own surfaces; page key
// `content` and the legacy `WEEK_BLOCKS` / Content module stay registered for
// stored snapshots and exports.

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const params = (await searchParams) ?? {}
  const { supabase, clientId } = await getSessionContext()
  const data = await loadContentPage({ supabase, clientId, reading: readingHandle(clientId), params })
  return <ContentPage data={data} />
}
