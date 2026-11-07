import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { Bone, BoneLines, SkeletonStatStrip } from '@/components/shell/skeleton'
import { surface } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { DASHBOARD_GRID, TILE } from './parts'

// The Dashboard while it loads, in the audit design's shape (7 Nov): the
// title, the figures row's four cells as bones, and the tiles' bones on the
// one three-column grid, so each tile fills in place. `/dashboard`'s
// loading.tsx renders the whole of it; the route streams each tile on its
// own behind the same bones (`TileBones`), so one slow page's read never
// holds the others.

/** Each tile's place in the grid, written out whole for Tailwind's scanner. */
export const TILE_SPAN = {
  wide: 'min-[1180px]:col-span-2',
  narrow: 'min-[1180px]:col-span-1',
} as const

/** One tile's bones: its head (the label and its link), a heading, and a
 *  block (a list's rows, or the tall tiles' table and chart). No icon bone:
 *  the tiles draw none. */
export function TileBones({ span, tall = false, label }: { span: keyof typeof TILE_SPAN; tall?: boolean; label?: string }) {
  return (
    <div className={cn(TILE, TILE_SPAN[span])} {...(label ? { role: 'status', 'aria-busy': true, 'aria-label': label } : { 'aria-hidden': true })}>
      <div className="flex items-center justify-between"><Bone className="h-3.5 w-28" /><Bone className="h-3.5 w-20" /></div>
      <Bone className="h-6 w-4/5" />
      {tall ? <Bone className="h-[150px] w-full" /> : <BoneLines lines={3} />}
    </div>
  )
}

export function HomeSkeleton() {
  return (
    <PageFrame className="text-foreground">
      <div role="status" aria-busy="true" aria-label="Loading Dashboard" className="flex flex-col gap-5">
        <span className="sr-only">Loading Dashboard…</span>
        <div className="flex shrink-0 flex-col">
          <PageBar title={surface('home').label} />
          <div className="mt-5"><SkeletonStatStrip cells={4} /></div>
        </div>
        <div className={DASHBOARD_GRID}>
          <TileBones span="wide" tall />
          <TileBones span="narrow" tall />
          <TileBones span="narrow" />
          <TileBones span="narrow" />
          <TileBones span="narrow" />
          <TileBones span="wide" />
          <TileBones span="narrow" />
        </div>
      </div>
    </PageFrame>
  )
}
