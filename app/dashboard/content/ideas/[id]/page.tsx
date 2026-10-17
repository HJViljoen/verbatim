// A POST IDEA'S PAGE ON CONTENT (depth as pages, 17 Oct; board
// G5-Content-Idea): the idea in full, the hub, by its row id
// (`post_ideas.id`), never its rank. `?sub=<n>` opens one sub-question's
// comments. An id Content cannot name (unknown, another workspace's, or
// malformed) prints one calm line with the way back, never a 404; a throw keeps
// the shell (app/dashboard/error.tsx).
import type { Metadata } from 'next'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadContentIdea } from '@/lib/pages/v2/content-idea'
import { ContentIdeaPage } from '@/components/pages/v2/content/idea-page'
import { surface } from '@/lib/nav'
import { routeParam } from '@/lib/route-param'

export const metadata: Metadata = { title: surface('content').label }

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams ?? Promise.resolve({})])
  const { supabase, clientId } = await getSessionContext()
  const data = await loadContentIdea({ supabase, clientId, reading: readingHandle(clientId), params: sp ?? {} }, routeParam(id))
  return <ContentIdeaPage data={data} />
}
