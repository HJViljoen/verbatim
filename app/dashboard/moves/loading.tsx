import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { Bone, BoneLines, SkeletonStatStrip } from '@/components/shell/skeleton'
import { CARD } from '@/components/v2'
import { PAGE_TITLE } from '@/lib/pages/v2/moves'

// Mirrors components/pages/v2/moves (MovesV2Page) in the audit design's shape
// (Moves.dc.html, 7 Nov): the title with its two controls and the figures
// row's four bones, three advice cards across (one below 1180px), two move
// cards, the plan, and the conclusions card. The title is the real one, so
// the page does not change its name on arrival. Plain bones, no tile.
export default function MovesLoading() {
  return (
    <PageFrame>
      <span role="status" className="sr-only">Loading {PAGE_TITLE}…</span>
      <div className="flex shrink-0 flex-col">
        <PageBar title={PAGE_TITLE}>
          <div className="flex items-center gap-5">
            <Bone className="h-4 w-24" />
            <Bone className="h-10 w-28 rounded-[8px]" />
          </div>
        </PageBar>
        <div className="mt-5"><SkeletonStatStrip cells={4} /></div>
      </div>
      <Bone className="h-6 w-48" />
      <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={CARD}>
            <Bone className="h-6 w-40" />
            <BoneLines lines={2} widths={['w-full', 'w-3/4']} />
            <BoneLines lines={3} />
            <div className="grid grid-cols-2 gap-3.5 border-t border-track pt-3.5"><BoneLines lines={2} /><BoneLines lines={2} /></div>
            <div className="flex gap-2.5"><Bone className="h-10 w-20 rounded-[8px]" /><Bone className="h-10 w-24 rounded-[8px]" /></div>
          </div>
        ))}
      </div>
      <Bone className="mt-[26px] h-6 w-72" />
      <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className={CARD}>
            <BoneLines lines={2} widths={['w-2/3', 'w-1/2']} />
            <div className="grid grid-cols-3 gap-3.5">{[0, 1, 2].map((j) => <Bone key={j} className="h-16 w-full" />)}</div>
            <BoneLines lines={1} widths={['w-3/4']} />
          </div>
        ))}
      </div>
      <div className={CARD}>
        <BoneLines lines={2} widths={['w-1/3', 'w-1/2']} />
        <Bone className="h-2.5 w-full rounded-[5px]" />
        <BoneLines lines={3} />
      </div>
      <div className={`${CARD} mt-[26px]`}>
        <BoneLines lines={2} widths={['w-1/3', 'w-1/2']} />
        <BoneLines lines={4} />
      </div>
    </PageFrame>
  )
}
