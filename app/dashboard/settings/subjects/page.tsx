import { SettingsFrame } from '@/components/settings-frame'
import { YourSubjectsTab } from '@/components/pages/settings/subjects'
import { canManageTenant, getSessionContext } from '@/lib/auth'
import { surface } from '@/lib/nav'
import { settingsSubPage } from '@/lib/settings/rail'
import { loadYourSubjects, yourSubjectsView } from '@/lib/settings/your-subjects'
import { assertTenantMay } from '@/lib/tenant-locks'
import type { Metadata } from 'next'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: `${settingsSubPage('subjects').label} · ${surface('settings').label}` }

// Settings › Your subjects (depth redesign v2, T10c). This address redirected
// to the Subjects page from 1 Oct, and to Market once Design v2 folded that
// page in; the editor it carried (add, rename, stop, confirm) had no home
// left, so it is a tab again: the subjects you follow and the suggestions
// waiting, with the same editor and the same write path
// (lib/actions/subjects.ts, `canManageTenant` on every subject write, then
// the tenant lock, decision 7). `canEdit` and `locked` are the affordance;
// the actions are the gate. The lock is a pure check on the session
// (`assertTenantMay`), so asking it here costs no read.

export default async function SettingsSubjectsPage() {
  const session = await getSessionContext()
  const { supabase, clientId, role } = session
  const read = await loadYourSubjects(supabase, clientId).catch((error: unknown) => {
    console.error(`[settings] subjects did not load for ${clientId}: ${(error as { message?: string })?.message ?? String(error)}`)
    return null
  })

  return (
    <SettingsFrame active="subjects" title="Settings" operator={session.operator != null}>
      {read === null ? (
        <p className="m-0 text-[14px] text-[#5F656B]">Your settings did not load. Refresh the page.</p>
      ) : (
        <YourSubjectsTab view={read.state === 'missing' ? null : yourSubjectsView(
          read.rows,
          canManageTenant(role),
          // The tenant lock, asked as the actions ask it (decision 7): a locked
          // tenant's owner or admin sees the controls disabled under the
          // lock's line rather than a refusal after a submit.
          !assertTenantMay(session, clientId, 'tracking').ok,
        )} />
      )}
    </SettingsFrame>
  )
}
