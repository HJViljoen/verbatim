import { canManageTenant, getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadSubjectsPage } from '@/lib/pages/subjects'
import { SubjectsPage } from '@/components/pages/subjects'

// Subjects — "how are we seen on this subject?" A new address in Phase 1
// (there has never been a /dashboard/subjects). WP12 fills it from
// lib/pages/subjects.ts and the `month_subject_readings` the pipeline writes
// once M4 is applied; until then every subject read degrades to a sentence
// saying what is not recorded yet.
//
// `?item=` selects the subject and `?horizon=` the window, so a reader can send
// a colleague the subject rather than the page — which is also how OV2's rows
// link here.

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const sp = (await searchParams) ?? {}
  const { supabase, clientId, role } = await getSessionContext()
  const data = await loadSubjectsPage({ supabase, clientId, reading: readingHandle(clientId), params: sp, canEdit: canManageTenant(role) })
  return <SubjectsPage data={data} params={sp} />
}
