// A TRACKED SUBJECT'S PAGE ON MARKET (17 Oct; boards F2-Market-Subject,
// -Switcher and -Phone): "Market / {subject}", its read, its numbers and the
// conversations inside it. `?period=` and `?month=` as the top page reads
// them. An id Market does not follow prints one calm line with the way back,
// never a 404; a throw keeps the shell (app/dashboard/error.tsx).
import type { Metadata } from 'next'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadMarket, marketParams } from '@/lib/pages/v2/market'
import { MarketSubjectPage } from '@/components/pages/v2/market/pages'
import { surface } from '@/lib/nav'
import { routeParam } from '@/lib/route-param'

export const metadata: Metadata = { title: surface('market').label }

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams ?? Promise.resolve({})])
  const { supabase, clientId } = await getSessionContext()
  const data = await loadMarket({ supabase, clientId, reading: readingHandle(clientId), params: marketParams(sp ?? {}), view: { kind: 'subject', id: routeParam(id) } })
  return <MarketSubjectPage data={data} />
}
