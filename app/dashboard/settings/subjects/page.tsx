import { redirect } from 'next/navigation'

// Settings › Subjects MOVED to the Subjects page (pages rebuild, 1 Oct): the
// editor (add, rename, stop, confirm) sits on the list it changes, at
// /dashboard/subjects, through the same write path (`lib/actions/subjects.ts`,
// `canManageTenant` on every subject write). An old link or bookmark lands
// there.
export default function SettingsSubjectsMoved(): never {
  redirect('/dashboard/subjects')
}
