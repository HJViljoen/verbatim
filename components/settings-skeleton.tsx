import { PageBar } from '@/components/shell/page-grid'
import { Bone, BoneLines } from '@/components/shell/skeleton'
import { SETTINGS_SUBPAGES } from '@/lib/settings/rail'

// One skeleton for every page inside the settings frame
// (components/settings-frame.tsx): the sub-pages under /dashboard/settings,
// plus Team and Billing. It draws what the frame draws since the approved
// preview (market-first WP3.10): the bar, a row of tabs on a hairline, one bone
// per tab (read from the same `SETTINGS_SUBPAGES` the real tabs map), then
// `cards` tiles, as What we read and The record draw them.
export function SettingsSkeleton({ title, cards = 3 }: { title: string; cards?: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <span role="status" className="sr-only">Loading {title}…</span>
      <PageBar title={title} context={<Bone className="h-3 w-32" />}>
        <Bone className="h-3 w-24" />
      </PageBar>
      <nav aria-hidden className="-mt-2 flex items-end gap-8 overflow-x-hidden border-b border-border">
        {SETTINGS_SUBPAGES.map((s, i) => (
          <div key={s.key} className="flex h-11 shrink-0 items-center">
            <Bone className={i % 3 === 0 ? 'h-3 w-24' : i % 3 === 1 ? 'h-3 w-16' : 'h-3 w-20'} />
          </div>
        ))}
      </nav>
      <div className="flex flex-col gap-6">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-lg bg-tile p-4 shadow-tile sm:p-8">
            <Bone className="h-3 w-32" /><Bone className="h-5 w-2/3" /><BoneLines lines={3} />
          </div>
        ))}
      </div>
    </div>
  )
}
