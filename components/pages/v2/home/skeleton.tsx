import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { Bone, BoneLines } from '@/components/shell/skeleton'
import { surface } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { TILE } from './parts'

// The Dashboard while it loads (Design v2, T8): the page's own shape, so each
// tile fills in place. `/dashboard`'s loading.tsx renders the whole of it;
// the route streams each tile on its own behind the same bones
// (`TileBones`), so one slow page's read never holds the others.

/** Each tile's place in the grid, written out whole for Tailwind's scanner. */
export const TILE_SPAN = {
  wide: 'col-span-12 min-[1180px]:col-span-8',
  narrow: 'col-span-12 min-[1180px]:col-span-4',
} as const

/** One tile's bones: its head, a title, a figure and a block. */
export function TileBones({ span, tall = false, label }: { span: keyof typeof TILE_SPAN; tall?: boolean; label?: string }) {
  return (
    <div className={cn(TILE, TILE_SPAN[span])} {...(label ? { role: 'status', 'aria-busy': true, 'aria-label': label } : { 'aria-hidden': true })}>
      <div className="flex items-center justify-between"><Bone className="h-3.5 w-28" /><Bone className="h-3.5 w-14" /></div>
      <Bone className="h-6 w-4/5" />
      <Bone className="h-10 w-24" />
      {tall ? <Bone className="h-[112px] w-full" /> : <BoneLines lines={2} />}
    </div>
  )
}

export function HomeSkeleton() {
  return (
    <PageFrame className="text-foreground">
      <div role="status" aria-busy="true" aria-label="Loading Dashboard" className="flex flex-col gap-5">
        <span className="sr-only">Loading Dashboard…</span>
        <PageBar title={surface('home').label} meta={<Bone className="h-3 w-72" />} />
        <div className="grid grid-cols-12 gap-5">
          <TileBones span="wide" tall />
          <TileBones span="narrow" tall />
        </div>
        <div className="grid grid-cols-12 gap-5">
          <TileBones span="narrow" />
          <TileBones span="narrow" />
          <TileBones span="narrow" />
        </div>
        <div className="grid grid-cols-12 gap-5">
          <TileBones span="wide" />
          <TileBones span="narrow" />
        </div>
      </div>
    </PageFrame>
  )
}
