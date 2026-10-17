import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadContentPage, readIdeas } from '@/lib/pages/v2/content'
import { CONTENT_ROOT, ideaLanding, ideaRankParam } from '@/lib/pages/v2/content-address'
import { anchorFrom } from '@/lib/pages/v2/content-levels'
import { loadPublishedWeekRead } from '@/lib/written/published'
import { ContentPage } from '@/components/pages/v2/content'
import { redirectFor, surface } from '@/lib/nav'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: surface('content').label }

// CONTENT AT /dashboard/content (Design v2, depth plan T6; boards E5-Content,
// and since 17 Oct G5-Content): what should we post next, and what works?
//
// lib/pages/v2/content.ts reads the week's post ideas, what works in the
// market's videos this month, the comments worth a reply, your own posts and
// the other questions asked; components/pages/v2/content draws them.
// `?period=month` reads the month instead of the week, `?asked=all` lists
// every question.
//
// CONTENT'S DEPTH IS PAGES (depth as pages, 17 Oct): a post idea is its own
// page (`/dashboard/content/ideas/<id>`), and so are the reply list
// (`/dashboard/content/replies`) and your posts (`/dashboard/content/posts`);
// nothing opens in place. OLD LINKS STILL LAND, BEFORE THE PAGE IS READ:
// `?replies=1`, `?reply=<intent>` and `?posts=1` through `redirectFor`
// (lib/nav.ts `contentRedirect`), every other param kept; `?idea=<rank>`
// names a week's place, not an idea, so the route reads the set the root
// shows (its ideas and the published read, the root's anchor) and sends it to
// that rank's idea (`ideaLanding`), or to the root where the set has none.
// Stored snapshots, sent emails and share pages carry them; a stored
// `#worth-a-reply` lands on the root's card, which keeps the id.
//
// THE PLACEHOLDER IT REPLACED. Until T6 this route drew This week
// (`WeekReadPage`, lib/pages/week-read.ts), which stays in the tree for
// /dashboard/week's history and the weekly read's own surfaces; page key
// `content` and the legacy `WEEK_BLOCKS` / Content module stay registered for
// stored snapshots and exports.

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const sp = (await searchParams) ?? {}
  const away = redirectFor(CONTENT_ROOT, sp)
  if (away) redirect(away)
  const { supabase, clientId } = await getSessionContext()
  const reading = readingHandle(clientId)
  if (ideaRankParam(sp) != null) {
    // The set the root shows: its ideas, unless too old to print (the anchor).
    const [ideas, published] = await Promise.all([
      readIdeas(supabase, clientId).catch(() => null),
      loadPublishedWeekRead(reading.client, clientId).catch(() => null),
    ])
    redirect(ideaLanding(sp, anchorFrom(ideas, published, new Date()).ideas))
  }
  const data = await loadContentPage({ supabase, clientId, reading, params: sp })
  return <ContentPage data={data} />
}
