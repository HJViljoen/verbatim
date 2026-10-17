// A CREATOR'S PAGE ON VOICES (17 Oct; boards G3-Voices-Creator and its
// phone): the evidence, "Voices / {account}", at two segments,
// `/creators/<platform>/<account>` (board decision 1: a pipe would read %7C
// in every shared link); an old `?creator=` that named the account alone lands
// on one segment, resolved as the panel did. `?month=`, and `?video=` /
// `?videos=all` for their own videos alone. Never Reddit (its account is a
// community). An address naming no creator at the floor prints one calm line
// with the way back, never a 404; a throw keeps the shell.
import type { Metadata } from 'next'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { levelParams, loadVoicesCreator } from '@/lib/pages/v2/voices-levels'
import { VoicesCreatorPage } from '@/components/pages/v2/voices/pages'
import { surface } from '@/lib/nav'
import { routeParam } from '@/lib/route-param'

export const metadata: Metadata = { title: surface('voices').label }

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ creator: string[] }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ creator }, sp] = await Promise.all([params, searchParams ?? Promise.resolve({})])
  const { supabase, clientId } = await getSessionContext()
  const p = levelParams(sp ?? {})
  const data = await loadVoicesCreator({ supabase, clientId, reading: readingHandle(clientId), params: p, segments: (creator ?? []).map(routeParam) })
  return <VoicesCreatorPage data={data} params={p} />
}
