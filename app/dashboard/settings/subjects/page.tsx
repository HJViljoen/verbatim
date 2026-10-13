import { redirect } from 'next/navigation'
import { retiredTo } from '@/lib/nav'

// Settings › Subjects MOVED to the Subjects page (pages rebuild, 1 Oct): the
// editor (add, rename, stop, confirm) sat on the list it changes, at
// /dashboard/subjects, through the same write path (`lib/actions/subjects.ts`,
// `canManageTenant` on every subject write). Design v2 folded Subjects into
// Market, so an old link or bookmark lands where /dashboard/subjects does, in
// one hop. The editor has no page of its own until Settings › Your subjects
// is built (the boards: "adding and renaming go to Settings").
export default function SettingsSubjectsMoved(): never {
  redirect(retiredTo('/dashboard/subjects'))
}
