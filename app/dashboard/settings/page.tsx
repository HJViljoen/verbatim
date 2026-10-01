import { SettingsFrame } from '@/components/settings-frame'
import { SearchTerms } from '@/components/pages/settings/search-terms'
import { YourAccounts } from '@/components/pages/settings/your-accounts'
import { BrandsYouTrack, Communities, NotYourMarket } from '@/components/pages/settings/tracked-cards'
import { canManageTenant, getSessionContext } from '@/lib/auth'
import { surface } from '@/lib/nav'
import { loadWhatYouTrack } from '@/lib/pages/settings'
import { notMyMarketCount } from './market-read'
import { updateOwnHandles } from './actions'
import type { Metadata } from 'next'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: surface('settings').label }

// Settings › What you track (the key and the address stay `tracking`), as the
// Page-Settings artboard draws it (pages build, 1 Oct): two columns, Search
// terms and Your accounts on the left, Brands you track and Communities on the
// right, then the videos marked as not your market where there are any.
//
// SETTINGS, NOT READINGS. The market card, the search set's history, where the
// market came from, where we read it, searches each update, term performance,
// the makers rules and the save-state strip are gone (the page review's cuts:
// each one is a reading or our machinery, rules 1 and 3).
//
// EVERY ADD IS THE ACTION IT ALWAYS WAS. Terms through `updateSearchTerms`,
// brands through `updateTrackingConfig` (and the logged rename), communities
// through `updateCommunity`, your accounts through `updateOwnHandles`. Each
// checks the role and the tenant lock itself; a locked tenant's term, brand or
// account change waits for the 1st and says the date.
//
// Owners and admins see the controls; everyone else reads the lists.

export default async function SettingsTrackingPage() {
  const session = await getSessionContext()
  const { supabase, clientId, role } = session
  const canEdit = canManageTenant(role)
  const { model, failed } = await loadWhatYouTrack(supabase, clientId, notMyMarketCount)

  return (
    <SettingsFrame active="tracking" title="Settings" operator={session.operator != null}>
      {failed ? (
        <p className="m-0 text-[14px] text-[#5F656B]">Your settings did not load. Refresh the page.</p>
      ) : !model ? (
        <p className="m-0 text-[14px] text-[#5F656B]">Nothing is tracked yet. We set this up with you.</p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <SearchTerms terms={model.terms} canEdit={canEdit} />
            <YourAccounts rows={model.ownAccounts} handles={model.ownHandles} canEdit={canEdit} action={updateOwnHandles} />
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <BrandsYouTrack brands={model.brands} names={model.names} canEdit={canEdit} />
            <Communities communities={model.communities} canEdit={canEdit} />
            <NotYourMarket count={model.notMine} />
          </div>
        </div>
      )}
    </SettingsFrame>
  )
}
