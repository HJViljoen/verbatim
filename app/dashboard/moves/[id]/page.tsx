// A DATED MOVE, THE EVIDENCE (levels as pages, 17 Oct; board G6-Moves-Move):
// "Your moves / {move}". `?video=<videos.id>` opens one video's comments in
// full and `?videos=all` lists every video, each honoured only for the move's
// own videos since its day. Mark done and Stop it are drawn for an owner or an
// admin only (`mayDecideMoves`); the action refuses anyone else. An id among
// none of this tenant's moves prints one calm line with the way back, never a
// 404; a throw keeps the shell (app/dashboard/error.tsx).
import type { Metadata } from 'next'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { mayDecideMoves } from '@/lib/moves-access'
import { loadMovePage } from '@/lib/pages/v2/moves-levels-load'
import { MOVE_MISSING } from '@/lib/pages/v2/moves-levels'
import { MovesFirstRun, MovesMissing, MovesMovePage } from '@/components/pages/v2/moves/levels'
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
  const page = await loadMovePage({ supabase, clientId, reading: readingHandle(clientId), params: sp ?? {} }, routeParam(id), { canDecide: mayDecideMoves(role) })
  if (page === null) return <MovesFirstRun />
  if (page === 'missing') return <MovesMissing line={MOVE_MISSING} />
  return <MovesMovePage page={page} />
}
