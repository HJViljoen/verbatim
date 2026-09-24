import { PageGrid, TileColumns } from '@/components/shell/page-grid'
import { SkeletonSurface, SkeletonTile, Bone, BoneLines, BoneBars } from '@/components/shell/skeleton'

// Mirrors components/pages/week/index.tsx (WeekPage): the week bar (no
// horizon, no band: it is dated by the update) with its context, How to read
// and Export, then the blocks in `WEEK_BLOCKS` order at their `COLS` widths:
// unusual · worth a reply · subjects · what came in · rival posts · what
// worked (5) beside sales (7) · rising, and the coverage footnote bare under
// the grid. "Flagged" is not drawn: the page folds it into "Worth a reply"
// whenever it is quiet, which is the usual case.
export default function WeekLoading() {
  return (
    <SkeletonSurface nav="week" pills={3}>
      <PageGrid>
        {/* week.unusual · two columns */}
        <SkeletonTile col={12} row={2} meta>
          <TileColumns of={2}>
            <BoneLines lines={4} />
            <div className="xl:pl-4"><BoneLines lines={4} /></div>
          </TileColumns>
        </SkeletonTile>
        {/* week.reply */}
        <SkeletonTile col={12} row={2} meta lines={5} />
        {/* week.subjects */}
        <SkeletonTile col={12} row={2} meta><BoneBars rows={4} /></SkeletonTile>
        {/* week.camein · two columns */}
        <SkeletonTile col={12} row={2} meta>
          <TileColumns of={2}>
            <BoneBars rows={3} />
            <div className="xl:pl-4"><BoneBars rows={3} /></div>
          </TileColumns>
        </SkeletonTile>
        {/* week.rivalposts */}
        <SkeletonTile col={12} row={1} meta lines={3} />
        {/* week.worked (5) · week.sales (7) */}
        <SkeletonTile col={5} row={2} meta lines={4} />
        <SkeletonTile col={7} row={2} meta lines={4} />
        {/* week.rising · three abreast */}
        <SkeletonTile col={12} row={2} meta>
          <TileColumns of={3}>
            <BoneLines lines={3} />
            <div className="xl:pl-4"><BoneLines lines={3} /></div>
            <div className="xl:pl-4"><BoneLines lines={3} /></div>
          </TileColumns>
        </SkeletonTile>
      </PageGrid>
      {/* week.coverage · the bare footnote */}
      <Bone className="h-2.5 w-2/3" />
    </SkeletonSurface>
  )
}
