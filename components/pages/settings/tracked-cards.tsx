import { renameTrackedRival } from '@/app/dashboard/settings/rivals-actions'
import { updateCommunity, updateTrackingConfig } from '@/app/dashboard/settings/actions'
import { RIVALS_PRESENT } from '@/app/dashboard/settings/constants'
import { Card, CardTitle } from '@/components/pages/studio/ui'
import type { BrandRow } from '@/lib/pages/settings'
import { InlineAdd } from './inline-add'
import { BrandMenu } from './brand-menu'

// The right-hand column of What you track (Page-Settings artboard): Brands you
// track, with their accounts, and the Reddit communities that count as the
// market. Then, where any exist, the videos marked as not your market.
//
// SINCE THE AUDIT DESIGN (7 Nov, Settings.dc.html): no icon tile and no dot
// before a brand's name; a brand's accounts are a list, one a line, each
// platform beside its handle in ink (no mono); the communities a plain list
// of r/ names (the card's line already says they are Reddit's).

const LEAD = 'm-0 mt-1.5 text-[15px] leading-[1.55] text-secondary-foreground'

export function BrandsYouTrack({ brands, names, canEdit }: { brands: readonly BrandRow[]; names: string[]; canEdit: boolean }) {
  if (!canEdit && brands.length === 0) return null
  return (
    <Card className="p-[26px] max-sm:p-[18px]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <CardTitle>Brands you track</CardTitle>
          <p className={LEAD}>Each brand and its own accounts. The names people call them by are under Search terms.</p>
        </div>
        {canEdit ? (
          <InlineAdd
            label="Add a brand"
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
      <div className="mt-[18px] flex flex-col">
        {brands.map((b) => (
          <div key={b.name} className="flex items-start justify-between gap-4 border-t border-track py-4 last:pb-0">
            <div className="min-w-0">
              <h3 className="m-0 text-[16px] font-semibold">{b.name}</h3>
              {b.accounts.length > 0 ? (
                <ul className="m-0 mt-2 list-none p-0 text-[14.5px] leading-[1.7] text-secondary-foreground">
                  {b.accounts.map((a) => (
                    <li key={a.platform}>
                      {a.platform}
                      {a.handle ? <> <span className="break-all text-foreground">{a.handle}</span></> : null}
                    </li>
                  ))}
                </ul>
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
    <Card className="p-[26px] max-sm:p-[18px]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <CardTitle>Communities</CardTitle>
          <p className={LEAD}>Reddit communities that count as your market.</p>
        </div>
        {canEdit ? (
          <InlineAdd
            label="Add a community"
            field="name"
            inputLabel="The community's name"
            placeholder="r/community"
            action={updateCommunity}
            hidden={<input type="hidden" name="op" value="add" />}
          />
        ) : null}
      </div>
      {communities.length > 0 ? (
        <ul className="m-0 mt-[18px] list-none p-0 text-[15px] font-semibold">
          {communities.map((c) => (
            <li key={c} className="border-t border-track py-[13px] last:pb-0">r/{c}</li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}

/** The videos marked "this is not my market". Not on the artboard (Sealand
 *  had none), so it is drawn only where there is one, in the cards' idiom. */
export function NotYourMarket({ count }: { count: number | null }) {
  if (!count) return null
  return (
    <Card className="p-[26px] max-sm:p-[18px]">
      <CardTitle>Not your market</CardTitle>
      <p className={LEAD}>
        <span data-copy="figure">{count}</span> {count === 1 ? 'video' : 'videos'} you marked as not your market.
      </p>
    </Card>
  )
}
