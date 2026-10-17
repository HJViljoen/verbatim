// A GROUP'S PAGE ON VOICES (17 Oct; boards G3-Voices-Group, its phone and its
// thin state): a hub, "Voices / {group}". Who they are, their figures, what
// they want and stop at, the subjects and conversations their videos sit in
// (each opening in Market), the brands and products in their videos, three
// of their comments. `?month=` as the root reads it. A key today's profile
// does not hold prints one calm line with the way back, never a 404; a throw
// keeps the shell (app/dashboard/error.tsx).
import type { Metadata } from 'next'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { levelParams, loadVoicesGroup } from '@/lib/pages/v2/voices-levels'
import { VoicesGroupPage } from '@/components/pages/v2/voices/pages'
import { surface } from '@/lib/nav'
import { routeParam } from '@/lib/route-param'

export const metadata: Metadata = { title: surface('voices').label }

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ key }, sp] = await Promise.all([params, searchParams ?? Promise.resolve({})])
  const { supabase, clientId } = await getSessionContext()
  const p = levelParams(sp ?? {})
  const data = await loadVoicesGroup({ supabase, clientId, reading: readingHandle(clientId), params: p, key: routeParam(key) })
  return <VoicesGroupPage data={data} params={p} />
}
