// THE ADVICE RECORD (levels as pages, 17 Oct; board G6-Moves-Record): every
// piece of advice, grouped by what was decided. "Your moves / The advice
// record", no chevron. `?all=1` lists every piece no longer raised. Until 17
// Oct it opened in place (`/dashboard/moves?advice=all`), which redirects
// here for good (lib/nav.ts `redirectFor`). A throw keeps the shell
// (app/dashboard/error.tsx).
import type { Metadata } from 'next'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadRecordPage } from '@/lib/pages/v2/moves-levels-load'
import { MovesFirstRun, MovesRecordPage } from '@/components/pages/v2/moves/levels'
import { surface } from '@/lib/nav'

export const metadata: Metadata = { title: surface('moves').label }

export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | undefined>> }) {
  const sp = (await searchParams) ?? {}
  const { supabase, clientId } = await getSessionContext()
  const page = await loadRecordPage({ supabase, clientId, reading: readingHandle(clientId), params: sp })
  return page ? <MovesRecordPage page={page} /> : <MovesFirstRun />
}
