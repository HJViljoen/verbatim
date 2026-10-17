import { marketSubjectPath } from '../nav'
import type { SupabaseClient } from '@supabase/supabase-js'

import { originLine } from '../pages/subjects'
import { isMissingSubjects, SUBJECTS_MAX, TABLE_SUBJECTS, type SubjectOrigin } from '../subjects/types'

// Settings › Your subjects (depth redesign v2, T10c): the subjects this
// workspace follows and the suggestions waiting for it, as the tab reads them.
//
// WHY IT IS BACK IN SETTINGS. Design v2 folded the Subjects page into Market,
// and `/dashboard/subjects` only redirects there, so the editor that lived on
// it (add, rename, confirm, stop following) had no address. It is the same
// editor (components/pages/subjects/editor.tsx) on the same write path
// (lib/actions/subjects.ts, `canManageTenant` on every subject write) at the
// address Settings › Subjects always had.
//
// SETTINGS, NOT READINGS. The tab lists names and what each covers; a
// subject's level, its month and its line are Market's. One read, of the
// subjects table alone.
//
// TWO LISTS, BECAUSE THEY ARE TWO STATEMENTS. A followed subject (`active`) is
// counted; a suggestion (`proposed`) measures nothing until someone confirms
// it (decision E). A stopped one (`retired`) is not listed: its months are
// closed and nothing on this tab can change it.

export interface SubjectSettingsRow {
  id: string
  name: string
  description: string | null
  status: 'active' | 'proposed'
  origin: SubjectOrigin
  namedAt: string
}

export type YourSubjectsRead =
  | { state: 'missing' }
  | { state: 'ready'; rows: SubjectSettingsRow[] }

/** The subjects followed and suggested, oldest first. On the session's own
 *  client: members read their subjects under M4's own-client policy. */
export async function loadYourSubjects(db: SupabaseClient, clientId: string): Promise<YourSubjectsRead> {
  const { data, error } = await db
    .from(TABLE_SUBJECTS)
    .select('id, name, description, origin, status, named_at')
    .eq('client_id', clientId)
    .in('status', ['active', 'proposed'])
    .order('named_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) {
    if (isMissingSubjects(error)) return { state: 'missing' }
    throw new Error(`subjects: ${(error as { message?: string }).message ?? String(error)}`)
  }
  const rows = ((data ?? []) as { id: string; name: string; description: string | null; origin: SubjectOrigin; status: 'active' | 'proposed'; named_at: string }[])
    .map((s) => ({ id: s.id, name: s.name, description: s.description, status: s.status, origin: s.origin, namedAt: s.named_at }))
  return { state: 'ready', rows }
}

export interface FollowedSubject extends SubjectSettingsRow {
  /** The subject on Market's board. */
  href: string
}

export interface SuggestedSubject extends SubjectSettingsRow {
  /** Where the suggestion came from: the argument for confirming it. */
  because: string
}

export interface YourSubjectsView {
  following: FollowedSubject[]
  waiting: SuggestedSubject[]
  /** Followed subjects, against the ceiling the editor holds (SUBJECTS_MAX). */
  activeCount: number
  max: number
  canEdit: boolean
  /** An owner or admin the tenant lock holds (`assertTenantMay`, `tracking`;
   *  decision 7): the controls are drawn disabled, under the lock's own line
   *  (`SUBJECTS_HELD`), rather than refusing after a submit, as Settings ›
   *  Your products does. Never true for the operator, or for a reader who
   *  cannot edit anyway. */
  locked: boolean
}

/** Where a followed subject is read: its page on Market (17 Oct). */
export const marketSubjectHref = (id: string): string => marketSubjectPath(id)

/** The tab, from the read. `locked` is the tenant lock's answer for this
 *  session (the route asks `assertTenantMay`, the call the actions make). PURE. */
export function yourSubjectsView(rows: readonly SubjectSettingsRow[], canEdit: boolean, locked = false): YourSubjectsView {
  const following = rows.filter((r) => r.status === 'active').map((r) => ({ ...r, href: marketSubjectHref(r.id) }))
  const waiting = rows.filter((r) => r.status === 'proposed').map((r) => ({ ...r, because: originLine(r.origin) }))
  return { following, waiting, activeCount: following.length, max: SUBJECTS_MAX, canEdit, locked: canEdit && locked }
}
