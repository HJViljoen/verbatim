// THE COMMENTS WORTH A REPLY ON CONTENT (depth as pages, 17 Oct; board
// G5-Content-Replies): the root card's list in full, each comment under the
// video it was written on. `?period=month` reads the month, as the root does;
// `?kind=<section>` lists one kind in full on a phone. An old `?replies=1` or
// `?reply=<intent>` on the root lands here (lib/nav.ts `contentRedirect`). A
// throw keeps the shell (app/dashboard/error.tsx).
import type { Metadata } from 'next'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadContentReplies } from '@/lib/pages/v2/content-replies'
import { ContentRepliesPage } from '@/components/pages/v2/content/replies-page'
import { surface } from '@/lib/nav'

export const metadata: Metadata = { title: surface('content').label }

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const params = (await searchParams) ?? {}
  const { supabase, clientId } = await getSessionContext()
  const data = await loadContentReplies({ supabase, clientId, reading: readingHandle(clientId), params })
  return <ContentRepliesPage data={data} />
}
