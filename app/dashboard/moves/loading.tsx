import { PageBar } from '@/components/shell/page-grid'
import { Bone, BoneLines } from '@/components/shell/skeleton'
import { CARD } from '@/components/v2'
import { PAGE_TITLE } from '@/lib/pages/v2/moves'

// Mirrors components/pages/v2/moves (MovesV2Page, board E6-Moves): the bar
// with its two buttons, three advice cards across (one below 1180px), two
// move cards, and the conclusions card. The title is the real one, so the page
// does not change its name on arrival.
export default function MovesLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy>
      <span role="status" className="sr-only">Loading {PAGE_TITLE}…</span>
      <PageBar title={PAGE_TITLE} meta={<Bone className="h-3 w-72" />}>
        <div className="flex gap-2">
          <Bone className="h-[38px] w-28 rounded-lg" />
          <Bone className="h-[38px] w-28 rounded-lg" />
        </div>
      </PageBar>
      <Bone className="h-5 w-48" />
      <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={CARD}>
            <Bone className="h-6 w-40 rounded-full" />
            <BoneLines lines={2} widths={['w-full', 'w-3/4']} />
            <BoneLines lines={3} />
            <div className="grid grid-cols-2 gap-2.5">
              <Bone className="h-[72px] w-full rounded-[10px]" />
              <Bone className="h-[72px] w-full rounded-[10px]" />
            </div>
            <div className="flex gap-2"><Bone className="h-[38px] w-20 rounded-lg" /><Bone className="h-[38px] w-24 rounded-lg" /></div>
          </div>
        ))}
      </div>
      <Bone className="h-5 w-72" />
      <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className={CARD}>
            <BoneLines lines={2} widths={['w-2/3', 'w-1/2']} />
            <Bone className="h-[120px] w-full rounded-[10px]" />
            <BoneLines lines={1} widths={['w-3/4']} />
          </div>
        ))}
      </div>
      <div className={CARD}>
        <BoneLines lines={2} widths={['w-1/3', 'w-1/2']} />
        <BoneLines lines={4} />
      </div>
    </div>
  )
}
