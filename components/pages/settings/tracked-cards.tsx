import { renameTrackedRival } from '@/app/dashboard/settings/rivals-actions'
import { updateCommunity, updateTrackingConfig } from '@/app/dashboard/settings/actions'
import { RIVALS_PRESENT } from '@/app/dashboard/settings/constants'
import { Ban, Users } from 'lucide-react'
import { NAV_ICON } from '@/components/nav-icons'
import { Card, CardTitle } from '@/components/pages/studio/ui'
import type { BrandRow } from '@/lib/pages/settings'
import { InlineAdd } from './inline-add'
import { BrandMenu } from './brand-menu'

// The right-hand column of What you track (Page-Settings artboard): Brands you
// track, with their accounts, and the Reddit communities that count as the
// market. Then, where any exist, the videos marked as not your market. A
// tracked brand carries the rival grey's dot (the colour roles, 1 Oct).

export function BrandsYouTrack({ brands, names, canEdit }: { brands: readonly BrandRow[]; names: string[]; canEdit: boolean }) {
  if (!canEdit && brands.length === 0) return null
  return (
    <Card className="gap-3.5 px-[30px] pt-[26px] pb-3.5">
      <div className="flex items-center justify-between gap-3">
        <CardTitle icon={NAV_ICON.competitive}>Brands you track</CardTitle>
        {canEdit ? (
          <InlineAdd
            label="Add a brand"
            kind="secondary"
            field="competitor_names"
            inputLabel="The brand's name"
            placeholder="a brand"
            action={updateTrackingConfig}
            hidden={<>
              <input type="hidden" name={RIVALS_PRESENT} value="1" />
              {names.map((n) => <input key={n} type="hidden" name="competitor_names" value={n} />)}
            </>}
          />
        ) : null}
      </div>
      <div className="flex flex-col">
        {brands.map((b) => (
          <div key={b.name} className="flex items-center justify-between gap-3 border-t border-[#E4E2DC] py-[13px]">
            <div className="flex min-w-0 flex-col gap-[3px]">
              <div className="flex items-center gap-2 text-[15px] font-bold"><span aria-hidden className="size-2 shrink-0 rounded-full bg-comp" />{b.name}</div>
              {b.accounts.length > 0 ? (
                <div className="text-[13px]">
                  {b.accounts.map((a, i) => (
                    <span key={a.platform}>
                      {i > 0 ? ' · ' : ''}{a.platform}
                      {a.handle ? <> <span className="font-mono text-[12px] text-[#5F656B]">{a.handle}</span></> : null}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            {canEdit ? <BrandMenu name={b.name} id={b.id} names={names} rename={renameTrackedRival} save={updateTrackingConfig} /> : null}
          </div>
        ))}
      </div>
    </Card>
  )
}

export function Communities({ communities, canEdit }: { communities: readonly string[]; canEdit: boolean }) {
  if (!canEdit && communities.length === 0) return null
  return (
    <Card className="gap-3.5 px-[30px] pt-[26px] pb-3.5">
      <div className="flex items-center justify-between gap-3">
        <CardTitle icon={Users}>Communities</CardTitle>
        {canEdit ? (
          <InlineAdd
            label="Add a community"
            kind="secondary"
            field="name"
            inputLabel="The community's name"
            placeholder="r/community"
            action={updateCommunity}
            hidden={<input type="hidden" name="op" value="add" />}
          />
        ) : null}
      </div>
      <p className="m-0 -mt-1 text-[14px] text-[#5F656B]">Reddit communities that count as your market.</p>
      {communities.length > 0 ? (
        <div className="flex flex-col">
          {communities.map((c) => (
            <div key={c} className="flex items-center justify-between border-t border-[#E4E2DC] py-3">
              <div className="text-[15px] font-semibold">r/{c}</div>
              <div className="text-[13px] text-[#5F656B]">Reddit</div>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  )
}

/** The videos marked "this is not my market". Not on the artboard (Sealand
 *  had none), so it is drawn only where there is one, in the cards' idiom. */
export function NotYourMarket({ count }: { count: number | null }) {
  if (!count) return null
  return (
    <Card className="gap-3.5 px-[30px] pt-[26px] pb-[22px]">
      <CardTitle icon={Ban}>Not your market</CardTitle>
      <p className="m-0 -mt-1 text-[14px] text-[#5F656B]">
        <span data-copy="figure">{count}</span> {count === 1 ? 'video' : 'videos'} you marked as not your market.
      </p>
    </Card>
  )
}
