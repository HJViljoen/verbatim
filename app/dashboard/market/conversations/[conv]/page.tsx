// A CONVERSATION'S PAGE ON MARKET (17 Oct; board F2-Market-Conversation): the
// conversation in full, E2's anatomy, by its registry id or an old link's
// slug (as `?conv=` took them). `?period=` and `?month=` as the top page reads
// them. An id Market cannot name prints one calm line with the way back,
// never a 404; a throw keeps the shell (app/dashboard/error.tsx).
import type { Metadata } from 'next'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadMarket, marketParams } from '@/lib/pages/v2/market'
import { MarketConversationPage } from '@/components/pages/v2/market/pages'
import { surface } from '@/lib/nav'
import { routeParam } from '@/lib/route-param'

export const metadata: Metadata = { title: surface('market').label }

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ conv: string }>
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const [{ conv }, sp] = await Promise.all([params, searchParams ?? Promise.resolve({})])
  const { supabase, clientId } = await getSessionContext()
  const data = await loadMarket({ supabase, clientId, reading: readingHandle(clientId), params: marketParams(sp ?? {}), view: { kind: 'conversation', id: routeParam(conv) } })
  return <MarketConversationPage data={data} />
}
