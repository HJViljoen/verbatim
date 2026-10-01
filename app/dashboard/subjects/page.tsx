import { canManageTenant, getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadSubjectsPage } from '@/lib/pages/subjects'
import { loadSubjectReadLine } from '@/lib/pages/subjects-read'
import { subjectsView } from '@/lib/pages/subjects-view'
import { createAdminClient } from '@/lib/supabase-admin'
import { SubjectsPage } from '@/components/pages/subjects'
import type { Metadata } from 'next'
import { surface } from '@/lib/nav'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: surface('subjects').label }

// Subjects (pages rebuild, 1 Oct; Page-Subjects.dc.html): every subject you
// follow, with the editor that moved in from Settings, and the open subject in
// full. `?item=` selects the subject, so a reader can send a colleague the
// subject rather than the page.
//
// TWO READS, ONE AFTER THE OTHER. The page's own loader, read lean (the reads
// that fed only the retired blocks are not made), then the week read's line on
// the subject it opened, which needs to know which subject that is. The week
// read is service-role only (review L2), scoped to the session's client.

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const sp = (await searchParams) ?? {}
  const { supabase, clientId, role } = await getSessionContext()
  const data = await loadSubjectsPage(
    { supabase, clientId, reading: readingHandle(clientId), params: sp, canEdit: canManageTenant(role) },
    { lean: true },
  )
  const read = data?.selected
    ? await loadSubjectReadLine(createAdminClient(), clientId, data.selected.id).catch((error: unknown) => {
        console.error(`[subjects] week read: ${(error as { message?: string })?.message ?? String(error)}`)
        return null
      })
    : null
  return <SubjectsPage view={data ? subjectsView(data, read, clientId) : null} />
}
