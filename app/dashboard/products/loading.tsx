import { Bone, BoneLines, SkeletonStatStrip } from '@/components/shell/skeleton'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { CARD } from '@/components/v2'
import { surface } from '@/lib/nav'
import { cn } from '@/lib/utils'

// Mirrors app/dashboard/products/page.tsx in the audit design's shape
// (Products.dc.html, 7 Nov): the title and the figures row's bones, the four
// standout cards across, then "Your catalogue" and its rows, each a head
// beside its tiles. Plain bones, no numbers, no tile icon.
export default function ProductsLoading() {
  return (
    <PageFrame>
      <span role="status" className="sr-only">Loading {surface('products').label}…</span>
      <div className="flex shrink-0 flex-col">
        <PageBar title={surface('products').label} />
        <div className="mt-5"><SkeletonStatStrip cells={5} /></div>
      </div>
      <div className="grid grid-cols-1 gap-5 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={cn(CARD, 'gap-3.5')}>
            <Bone className="h-3 w-28" />
            <BoneLines lines={2} />
            <Bone className="h-8 w-24" />
            <Bone className="h-4 w-32" />
          </div>
        ))}
      </div>
      <Bone className="mt-[26px] h-5 w-48" />
      <div className={cn(CARD, 'gap-[18px] sm:p-[30px]')}>
        <BoneLines lines={2} />
        <Bone className="h-[30px] w-96 max-w-full" />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="grid grid-cols-1 gap-x-7 gap-y-3.5 border-t border-track py-[22px] min-[900px]:grid-cols-[220px_minmax(0,1fr)]">
            <BoneLines lines={3} />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-2">
              {Array.from({ length: 6 }, (_, j) => <Bone key={j} className="h-[44px] w-full rounded-[8px]" />)}
            </div>
          </div>
        ))}
      </div>
    </PageFrame>
  )
}
