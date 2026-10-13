import { Bone, BoneBars, BoneLines } from '@/components/shell/skeleton'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { CARD } from '@/components/v2'
import { surface } from '@/lib/nav'
import { cn } from '@/lib/utils'

// Mirrors app/dashboard/products/page.tsx (boards E4-Products): the title and
// its meta line, the four standout cards across, then the catalogue card with
// its five columns of tiles. Plain bones, no numbers.
export default function ProductsLoading() {
  return (
    <PageFrame className="gap-5">
      <span role="status" className="sr-only">Loading {surface('products').label}…</span>
      <PageBar title={surface('products').label} meta={<Bone className="h-3 w-96 max-w-full" />} />
      <div className="grid grid-cols-1 gap-5 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={cn(CARD, 'gap-3.5')}>
            <Bone className="h-3 w-28" />
            <BoneLines lines={2} />
            <Bone className="h-7 w-20" />
            <BoneBars rows={2} />
          </div>
        ))}
      </div>
      <div className={CARD}>
        <Bone className="h-5 w-48" />
        <BoneLines lines={2} />
        <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Bone className="h-[150px] w-full rounded-[10px]" />
              {Array.from({ length: 4 }, (_, j) => <Bone key={j} className="h-[38px] w-full rounded-lg" />)}
            </div>
          ))}
        </div>
      </div>
    </PageFrame>
  )
}
