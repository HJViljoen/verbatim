import { PageGrid } from '@/components/shell/page-grid'
import { SkeletonSurface, SkeletonTile, Bone, BoneLines, BoneBars } from '@/components/shell/skeleton'

// Mirrors components/pages/market-surface/index.tsx (MarketSurfacePage): the
// surface bar (Market has no horizon, `lib/nav.ts`) with How to read and the
// band, then its two grids. The readings: conclusions and advice, full width.
// The moves: a 5-column stack (the card · say and hear) beside a 7-column
// stack (the moves · plans), then the ways full width, as `MOVES_STACKS` and
// `COLS` lay them out, with the page's own `xl:items-start`.
export default function MarketLoading() {
  return (
    <SkeletonSurface nav="market" pills={1} band>
      <PageGrid>
        {/* market.conclusions */}
        <SkeletonTile col={12} row={2} meta lines={5} />
        {/* market.advice */}
        <SkeletonTile col={12} row={2} meta lines={4} />
      </PageGrid>
      <PageGrid className="xl:items-start">
        <div className="contents xl:col-span-5 xl:flex xl:min-w-0 xl:flex-col xl:gap-4">
          {/* market.card */}
          <SkeletonTile col={12} row={2} meta>
            <Bone className="h-5 w-3/5" />
            <BoneLines lines={4} />
          </SkeletonTile>
          {/* market.sayhear */}
          <SkeletonTile col={12} row={1} meta lines={3} />
        </div>
        <div className="contents xl:col-span-7 xl:flex xl:min-w-0 xl:flex-col xl:gap-4">
          {/* market.moves */}
          <SkeletonTile col={12} row={2} meta><BoneBars rows={5} /></SkeletonTile>
          {/* market.plans */}
          <SkeletonTile col={12} row={1} meta lines={3} />
        </div>
        {/* market.ways */}
        <SkeletonTile col={12} row={2} meta lines={4} />
      </PageGrid>
    </SkeletonSurface>
  )
}
