import { PageBar } from '@/components/shell/page-grid'
import { Bone, BoneLines } from '@/components/shell/skeleton'
import { SEG } from '@/components/v2/look'
import { settingsTabs } from '@/lib/settings/rail'
import { cn } from '@/lib/utils'

// One skeleton for every page inside the settings frame
// (components/settings-frame.tsx): the sub-pages under /dashboard/settings,
// plus Team and Billing. It draws what the frame draws (the Page-Settings
// artboard): the title with the Log out button's place, the client's tabs in
// the white segmented control (the audit design, Settings.dc.html), then
// `cards` white cards on the ground, radius 12.
export function SettingsSkeleton({ title, cards = 3 }: { title: string; cards?: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[22px]">
      <span role="status" className="sr-only">Loading {title}…</span>
      <PageBar title={title}>
        <Bone className="h-10 w-[104px] rounded-[8px]" />
      </PageBar>
      <nav aria-hidden className={cn(SEG, 'mb-1.5 self-start')}>
        {settingsTabs(false).map((s, i) => (
          <div key={s.key} className="flex h-9 shrink-0 items-center px-3.5 max-sm:h-11">
            <Bone className={i === 0 ? 'h-3 w-24' : 'h-3 w-14'} />
          </div>
        ))}
      </nav>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-[12px] bg-white p-[26px] max-sm:p-[18px]">
            <Bone className="h-5 w-40" /><Bone className="h-3 w-2/3" /><BoneLines lines={3} />
          </div>
        ))}
      </div>
    </div>
  )
}
