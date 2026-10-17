// YOUR POSTS ON CONTENT (depth as pages, 17 Oct; board G5-Content-Posts): your
// own accounts' posts this month in full, each with what people said under it.
// `?all=1` lists every post; `?post=<id>` opens one post's comments. No period
// switch: it reads the month the root's card reads. An old `?posts=1` on the
// root lands here (lib/nav.ts `contentRedirect`). A throw keeps the shell
// (app/dashboard/error.tsx).
import type { Metadata } from 'next'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadContentPosts } from '@/lib/pages/v2/content-posts'
import { ContentPostsPage } from '@/components/pages/v2/content/posts-page'
import { surface } from '@/lib/nav'

export const metadata: Metadata = { title: surface('content').label }

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const params = (await searchParams) ?? {}
  const { supabase, clientId } = await getSessionContext()
  const data = await loadContentPosts({ supabase, clientId, reading: readingHandle(clientId), params })
  return <ContentPostsPage data={data} />
}
