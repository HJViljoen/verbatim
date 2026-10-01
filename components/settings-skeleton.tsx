import { Bone, BoneLines } from '@/components/shell/skeleton'
import { settingsTabs } from '@/lib/settings/rail'

// One skeleton for every page inside the settings frame
// (components/settings-frame.tsx): the sub-pages under /dashboard/settings,
// plus Team and Billing. It draws what the frame draws (the Page-Settings
// artboard): the title with the Log out button's place, the client's tabs as
// pills, then `cards` white cards on the ground.
export function SettingsSkeleton({ title, cards = 3 }: { title: string; cards?: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[22px]">
      <span role="status" className="sr-only">Loading {title}…</span>
      <div className="flex min-h-10 items-center justify-between gap-4">
        <h1 className="m-0 text-[26px] font-bold leading-tight text-[#26292C]">{title}</h1>
        <Bone className="h-10 w-[104px] rounded-[10px]" />
      </div>
      <nav aria-hidden className="flex gap-1 overflow-x-hidden">
        {settingsTabs(false).map((s, i) => (
          <div key={s.key} className="flex h-[38px] shrink-0 items-center px-4">
            <Bone className={i === 0 ? 'h-3 w-24' : 'h-3 w-14'} />
          </div>
        ))}
      </nav>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-2xl bg-white px-[30px] py-[26px]">
            <Bone className="h-5 w-40" /><Bone className="h-3 w-2/3" /><BoneLines lines={3} />
          </div>
        ))}
      </div>
    </div>
  )
}
