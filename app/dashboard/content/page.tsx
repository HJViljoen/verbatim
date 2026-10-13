import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadWeekReadPage } from '@/lib/pages/week-read'
import { WeekReadPage } from '@/components/pages/week/read-page'
import type { Metadata } from 'next'
import { surface } from '@/lib/nav'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: surface('content').label }

// CONTENT AT /dashboard/content (Design v2, decision 6 of the depth plan):
// what should we post, and what works?
//
// A PLACEHOLDER UNTIL THE CONTENT PAGE LANDS (depth plan T6): This week as it
// was drawn at /dashboard/week, the latest weekly read in full (the pages
// build, 1 Oct; the approved artboard Page-This-week.dc.html), which carried
// what worked and the comments worth a reply. lib/pages/week-read.ts reads the
// newest ready `week_reads` row for the session's client and who each item is
// about; components/pages/week/read-page.tsx draws it. /dashboard/week itself
// redirects to Market, which takes the week's news.
//
// The earlier page (`WeekPage`, `loadWeek`, `WEEK_BLOCKS`) stays in the tree
// for the export module and stored snapshots that name its block keys; this
// route no longer renders it.

export default async function Page() {
  const { supabase, clientId } = await getSessionContext()
  const data = await loadWeekReadPage({ supabase, clientId, reading: readingHandle(clientId), params: {} })
  return <WeekReadPage data={data} title={surface('content').label} />
}
