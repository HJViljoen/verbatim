import { getSessionContext } from '@/lib/auth'
import { canManageTenant } from '@/lib/roles'
import { readingHandle } from '@/lib/reading/read'
import { loadMarketSurface } from '@/lib/pages/market-surface'
import { loadStatements } from '@/lib/pages/moves-statements'
import { maySeeStatements } from '@/lib/statements/visibility'
import { MovesPage } from '@/components/pages/moves'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import { surface } from '@/lib/nav'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: surface('market').label }

// Adding a statement measures it after the response (`after()` in
// lib/actions/statements.ts): embedding, band, judge and one stance call, which
// run on this route's clock.
export const maxDuration = 300

// Your moves (pages build, 1 Oct; Page-Your-moves.dc.html). The advice, the
// moves and the plans come off the Market surface's loader, the statements off
// their own two reads, in ONE wave with the workspace's name.
//
// THE LEGACY `?rec=<id>` ALIAS STILL LANDS HERE. Four sent emails and every
// digest until WP17 carry it; the loader resolves it to the lineage, and the
// named row keeps its anchor in "Moves worth considering" while it is current.

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const sp = (await searchParams) ?? {}
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
