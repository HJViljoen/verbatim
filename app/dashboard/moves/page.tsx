import { getSessionContext } from '@/lib/auth'
import { canManageTenant } from '@/lib/roles'
import { readingHandle } from '@/lib/reading/read'
import { LEDGER_ALL_PARAM, LEDGER_ALL_VALUE, loadMarketSurface } from '@/lib/pages/market-surface'
import { loadStatements } from '@/lib/pages/moves-statements'
import { maySeeStatements } from '@/lib/statements/visibility'
import { MovesPage } from '@/components/pages/moves'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import { surface } from '@/lib/nav'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: surface('moves').label }

// Adding a statement measures it after the response (`after()` in
// lib/actions/statements.ts): embedding, band, judge and one stance call, which
// run on this route's clock.
export const maxDuration = 300

// Your moves (pages build, 1 Oct; Page-Your-moves.dc.html), at
// /dashboard/moves since Design v2 (decision 6 of the depth plan: Market took
// /dashboard/market). The advice, the moves and the plans come off the Market
// surface's loader (page key `market`, unchanged), the statements off their
// own two reads, in ONE wave with the workspace's name.
//
// `?advice=` IS YOUR MOVES' DEEP LINK NOW. The old `?rec=<id>` (four sent
// emails and every digest until WP17), `?item=<lineage>` and `?ledger=all`
// still name Your moves at /dashboard/market, which sends them here as
// `?advice=` (lib/nav.ts `redirectFor`). Until this page reads it itself
// (depth plan T7) it is handed to the loader as the param it reads: `all` as
// `?ledger=all`, anything else as `?item=`, which the loader resolves as a
// recommendation id or a lineage, and the named row keeps its anchor in
// "Moves worth considering" while it is current.

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const { advice, ...rest } = (await searchParams) ?? {}
  const sp = advice === undefined ? rest : advice === LEDGER_ALL_VALUE ? { ...rest, [LEDGER_ALL_PARAM]: advice } : { ...rest, item: advice }
  const { supabase, clientId, role, operator } = await getSessionContext()
  const db = supabase as SupabaseClient
  // Your statements is held from tenants until Heinrich decides (open ruling
  // #7, lib/statements/visibility.ts): a tenant's page reads no statement and
  // draws neither the section nor the add form; the operator's is as built.
  const [market, client, statements] = await Promise.all([
    loadMarketSurface({ supabase, clientId, reading: readingHandle(clientId), params: sp }, { shortlist: true }),
    db.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    maySeeStatements({ operator }) ? loadStatements(db, clientId, { canEdit: canManageTenant(role), brand: '' }) : Promise.resolve(null),
  ])
  const brand = market?.brand || ((client.data as { company_name?: string | null } | null)?.company_name ?? '').trim() || 'your brand'
  return <MovesPage market={market} statements={statements ? { ...statements, brand } : null} params={sp} />
}
