// A PIECE OF ADVICE, THE HUB (levels as pages, 17 Oct; board G6-Moves-Advice):
// "Your moves / {advice}", by its lineage or, from an old `?rec=` link, a
// recommendation id. The decision controls are drawn for an owner or an admin
// only (`mayDecideMoves`), and the actions refuse anyone else before anything
// is read. An id this tenant's advice does not hold prints one calm line with
// the way back, never a 404; a throw keeps the shell (app/dashboard/error.tsx).
import type { Metadata } from 'next'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { mayDecideMoves } from '@/lib/moves-access'
import { loadAdvicePage } from '@/lib/pages/v2/moves-levels-load'
import { ADVICE_MISSING } from '@/lib/pages/v2/moves-levels'
import { MovesAdvicePage, MovesFirstRun, MovesMissing } from '@/components/pages/v2/moves/levels'
import { surface } from '@/lib/nav'
import { routeParam } from '@/lib/route-param'

export const metadata: Metadata = { title: surface('moves').label }

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams ?? Promise.resolve({})])
  const { supabase, clientId, role } = await getSessionContext()
  const page = await loadAdvicePage({ supabase, clientId, reading: readingHandle(clientId), params: sp ?? {} }, routeParam(id), { canDecide: mayDecideMoves(role) })
  if (page === null) return <MovesFirstRun />
  if (page === 'missing') return <MovesMissing line={ADVICE_MISSING} />
  return <MovesAdvicePage page={page} />
}
