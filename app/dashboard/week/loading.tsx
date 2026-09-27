import { PageGrid, TileColumns } from '@/components/shell/page-grid'
import { SkeletonSurface, SkeletonTile, BoneLines, BoneBars } from '@/components/shell/skeleton'

// Mirrors components/pages/week/index.tsx (WeekPage; market-first WP3.7, the
// approved preview's This week): the week bar (no horizon: it is dated by the
// update) with its one line, How to read and Export, then the blocks in
// `WEEK_BLOCKS` order at their `COLS` widths: with this update · week by week
// · heard for the first time · your market's subjects (6) beside for sales (6)
// · worth a reply · what worked · what brands you track posted · checks on
// this update. Nothing under the grid (25 Sep rulings).
export default function WeekLoading() {
  return (
    <SkeletonSurface nav="week" pills={3}>
      <PageGrid className="gap-6 xl:auto-rows-auto">
        {/* week.came-in · the sentence and the came-in table */}
        <SkeletonTile col={12} row={2}>
          <TileColumns of={2}>
            <BoneLines lines={4} />
            <div className="xl:pl-4"><BoneBars rows={3} /></div>
          </TileColumns>
        </SkeletonTile>
        {/* week.weeks */}
        <SkeletonTile col={12} row={2}><BoneBars rows={4} /></SkeletonTile>
        {/* week.heard */}
        <SkeletonTile col={12} row={2}><BoneBars rows={3} /></SkeletonTile>
        {/* week.subjects (6) · week.sales (6) */}
        <SkeletonTile col={6} row={2}><BoneBars rows={5} /></SkeletonTile>
        <SkeletonTile col={6} row={2} lines={5} />
        {/* week.reply */}
        <SkeletonTile col={12} row={2} lines={5} />
        {/* week.worked · formats beside hooks */}
        <SkeletonTile col={12} row={2}>
          <TileColumns of={2}>
            <BoneBars rows={4} />
            <div className="xl:pl-4"><BoneBars rows={4} /></div>
          </TileColumns>
        </SkeletonTile>
        {/* week.rival-posts */}
        <SkeletonTile col={12} row={2} lines={5} />
        {/* week.checks · three abreast */}
        <SkeletonTile col={12} row={1}>
          <TileColumns of={3}>
            <BoneLines lines={2} />
            <div className="xl:pl-4"><BoneLines lines={2} /></div>
            <div className="xl:pl-4"><BoneLines lines={2} /></div>
          </TileColumns>
        </SkeletonTile>
      </PageGrid>
    </SkeletonSurface>
  )
}
