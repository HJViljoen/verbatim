// THE WEEK'S READ ON MARKET (17 Oct; board F2-Market-Week): the published
// read Market's top page reads, in full. No period switch (a read is one
// week's). Thin, failed or none: one calm line in the page.
import type { Metadata } from 'next'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadMarket, marketParams } from '@/lib/pages/v2/market'
import { MarketWeekPage } from '@/components/pages/v2/market/pages'
import { surface } from '@/lib/nav'

export const metadata: Metadata = { title: surface('market').label }

export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | undefined>> }) {
  const sp = (await searchParams) ?? {}
  const { supabase, clientId } = await getSessionContext()
  const data = await loadMarket({ supabase, clientId, reading: readingHandle(clientId), params: marketParams(sp), view: { kind: 'week' } })
  return <MarketWeekPage data={data} />
}
