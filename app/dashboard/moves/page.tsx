import { getSessionContext } from '@/lib/auth'
import { canManageTenant } from '@/lib/roles'
import { readingHandle } from '@/lib/reading/read'
import { loadStatements } from '@/lib/pages/moves-statements'
import { loadMovesPage } from '@/lib/pages/v2/moves'
import { mayDecideMoves } from '@/lib/moves-access'
import { maySeeStatements } from '@/lib/statements/visibility'
import { MovesV2Page } from '@/components/pages/v2/moves'
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

// Your moves, Design v2 (depth plan T7; boards E6-Moves and E6-Moves-Open), at
// /dashboard/moves (decision 6: Market took /dashboard/market). Page key
// `market` is unchanged, and so are its blocks, `MARKET_BLOCKS`,
// `MarketSurfacePage` and `loadMarketSurface`, which stored snapshots, share
// links, the briefs and the quarterly still read; this route reads its own
// loader (lib/pages/v2/moves.ts).
//
// `?advice=` IS THE PAGE'S ONE SELECTION: a lineage opens that piece of advice
// in place, `all` opens the advice record. The old `?rec=<id>` (four sent
// emails and every digest until WP17), `?item=<lineage>` and `?ledger=all`
// name Your moves at /dashboard/market, which sends them here as `?advice=`
// (lib/nav.ts `redirectFor`); a recommendation id resolves to its lineage.
//
// WHO MAY DECIDE (lib/moves-access.ts): Accept, Not for us, Date a move and a
// move's status are drawn for an owner or an admin only, and the actions
// refuse anyone else. Your statements stays held from tenants until Heinrich
// decides (open ruling #7, lib/statements/visibility.ts): a tenant's page
// reads no statement; the operator's is as built.

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const params = (await searchParams) ?? {}
  const { supabase, clientId, role, operator } = await getSessionContext()
  const db = supabase as SupabaseClient
  const [data, statements] = await Promise.all([
    loadMovesPage({ supabase, clientId, reading: readingHandle(clientId), params }, { canDecide: mayDecideMoves(role) }),
    maySeeStatements({ operator }) ? loadStatements(db, clientId, { canEdit: canManageTenant(role), brand: '' }) : Promise.resolve(null),
  ])
  return <MovesV2Page data={data} statements={statements ? { ...statements, brand: data?.brand ?? 'your brand' } : null} />
}
