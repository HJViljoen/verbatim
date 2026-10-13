import { Bone, BoneBars, BoneLines } from '@/components/shell/skeleton'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { CARD } from '@/components/v2'
import { surface } from '@/lib/nav'
import { cn } from '@/lib/utils'

// Mirrors app/dashboard/voices/page.tsx (boards E3-Voices): the title and its
// meta line, who is in your market, the groups three to a row, then brands
// beside creators. Plain bones, no numbers.
export default function VoicesLoading() {
  return (
    <PageFrame className="gap-5">
      <span role="status" className="sr-only">Loading {surface('voices').label}…</span>
      <PageBar title={surface('voices').label} meta={<Bone className="h-3 w-80 max-w-full" />} />
      <div className={CARD}>
        <Bone className="h-5 w-48" />
        <BoneBars rows={5} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={cn(CARD, 'gap-3.5 rounded-[14px] px-[22px] py-5')}>
            <Bone className="h-4 w-44" />
            <BoneLines lines={2} />
            <Bone className="h-7 w-24" />
            <BoneBars rows={3} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className={CARD}>
          <Bone className="h-5 w-48" />
          <BoneBars rows={5} />
        </div>
        <div className={CARD}>
          <Bone className="h-5 w-48" />
          <BoneBars rows={5} />
        </div>
      </div>
    </PageFrame>
  )
}
