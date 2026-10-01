import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadWeekReadPage } from '@/lib/pages/week-read'
import { WeekReadPage } from '@/components/pages/week/read-page'
import type { Metadata } from 'next'
import { surface } from '@/lib/nav'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: surface('week').label }

// This week: the latest weekly read, in full (the pages build, 1 Oct; the
// approved artboard Page-This-week.dc.html). lib/pages/week-read.ts reads the
// newest ready `week_reads` row for the session's client and who each item is
// about; components/pages/week/read-page.tsx draws it.
//
// The earlier page (`WeekPage`, `loadWeek`, `WEEK_BLOCKS`) stays in the tree
// for the export module and stored snapshots that name its block keys; this
// route no longer renders it.

export default async function Page() {
  const { supabase, clientId } = await getSessionContext()
  const data = await loadWeekReadPage({ supabase, clientId, reading: readingHandle(clientId), params: {} })
  return <WeekReadPage data={data} title={surface('week').label} />
}
