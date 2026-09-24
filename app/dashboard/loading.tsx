import { PageGrid, TileColumns } from '@/components/shell/page-grid'
import { SkeletonSurface, SkeletonTile, Bone, BoneLines, BoneBars } from '@/components/shell/skeleton'

// Mirrors components/pages/overview/index.tsx (OverviewPage): the surface bar
// with How to read and Export, the horizon row and the "how sound" band, then
// ONE column of full-width tiles in the page's own order and spans (`ROWS`):
// the sentence (hero, 3) · subjects (3) · the category (3) · rivals (3) ·
// moves (3) · the record (1). The grid is `xl:auto-rows-auto` there, so it is
// here: the tiles are as tall as their bones, which are sized to the blocks.
//
// This file used to draw the PRE-redesign dashboard (strip · executive brief
// 7×3 · sentiment 5×1 …), and every page without a loader of its own
// inherited it. `lib/dashboard-loading.test.ts` now fails a page that has no
// loader of its own or a named shared one.
export default function DashboardLoading() {
  return (
    <SkeletonSurface nav="overview" pills={2} band>
      <PageGrid className="xl:auto-rows-auto">
        {/* overview.sentence · the reading beside its voices (rail 400) */}
        <SkeletonTile col={12} row={3} variant="hero" meta>
          <TileColumns of={2} rail={400}>
            <div className="flex flex-col gap-3">
              <Bone className="h-6 w-11/12" />
              <Bone className="h-6 w-3/5" />
              <BoneLines lines={4} />
            </div>
            <div className="flex flex-col gap-3 xl:pl-4">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex flex-col gap-1.5"><BoneLines lines={2} /><Bone className="h-2.5 w-24" /></div>
              ))}
            </div>
          </TileColumns>
        </SkeletonTile>

        {/* overview.subjects · one row per subject */}
        <SkeletonTile col={12} row={3} meta>
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Bone className="h-3 w-40" />
                <Bone className="h-2 flex-1" />
                <Bone className="h-3 w-16" />
              </div>
            ))}
          </div>
        </SkeletonTile>

        {/* overview.category · kinds · mood · movers, then attention */}
        <SkeletonTile col={12} row={3} meta>
          <TileColumns of={3}>
            <BoneBars rows={4} />
            <div className="xl:pl-4"><BoneBars rows={4} /></div>
            <div className="xl:pl-4"><BoneBars rows={4} /></div>
          </TileColumns>
          <Bone className="h-[110px] w-full rounded-[6px]" />
        </SkeletonTile>

        {/* overview.rivals · a ranked table */}
        <SkeletonTile col={12} row={3} meta>
          <BoneBars rows={5} />
        </SkeletonTile>

        {/* overview.moves · two columns of moves */}
        <SkeletonTile col={12} row={3} meta>
          <TileColumns of={2}>
            <BoneLines lines={5} />
            <div className="xl:pl-4"><BoneLines lines={5} /></div>
          </TileColumns>
        </SkeletonTile>

        {/* overview.record */}
        <SkeletonTile col={12} row={1} lines={2} />
      </PageGrid>
    </SkeletonSurface>
  )
}
