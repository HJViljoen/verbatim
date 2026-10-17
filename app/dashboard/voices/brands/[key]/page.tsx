// A BRAND'S PAGE ON VOICES (17 Oct; boards G3-Voices-Brand, its phone and its
// switcher): a hub, "Voices / {brand}", for any tracked brand, by its brand
// key ('client', a competitor's id, 'watched:<slug>'), or an old link's name
// or `competitor:<name>`. `?month=` as the root reads it. A brand the
// workspace does not track prints one calm line with the way back, never a
// 404; a throw keeps the shell (app/dashboard/error.tsx).
import type { Metadata } from 'next'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { levelParams, loadVoicesBrand } from '@/lib/pages/v2/voices-levels'
import { VoicesBrandPage } from '@/components/pages/v2/voices/pages'
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
  const data = await loadVoicesBrand({ supabase, clientId, reading: readingHandle(clientId), params: p, key: routeParam(key) })
  return <VoicesBrandPage data={data} params={p} />
}
