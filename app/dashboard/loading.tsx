import { PageGrid } from '@/components/shell/page-grid'
import { SkeletonSurface, SkeletonTile, Bone, BoneLines, BoneBars } from '@/components/shell/skeleton'

// Mirrors components/pages/overview/index.tsx (OverviewPage), Your market since
// deploy 2 (market-first WP1.6): the surface bar with Export alone (the
// preview's bar; How to read is in Settings) and its one line (no horizon
// row, no "How sound" band), then the page's own order and spans
// (`FRONT_COLS`, `ROWS`): the month (its size and clause beside the voices) ·
// the theme board · the kinds and mood · the asks · the subjects
// (8) beside the brands' one line (4) · what changed. The grid is
// `xl:auto-rows-auto` there, so it is here: the tiles are as tall as their
// bones, which are sized to the blocks. No tile carries a meta bone: a block
// header is its title alone (25 Sep rulings).
//
// `lib/dashboard-loading.test.ts` fails a page that has no loader of its own
// or a named shared one.
/** The front page's frame: each block draws a 32px inset and 24px between
 *  its title and body (`BlockFrame`'s `roomy`), so the skeleton does too. */
const ROOMY = 'gap-6 px-4 py-6 sm:px-8 sm:py-8'

export default function DashboardLoading() {
  return (
    <SkeletonSurface nav="overview" pills={1}>
      <PageGrid className="gap-6 xl:auto-rows-auto">
        {/* overview.sentence · the month beside its voices */}
        <SkeletonTile col={12} row={3} className={ROOMY}>
          <div className="grid grid-cols-1 gap-x-16 gap-y-6 xl:grid-cols-[minmax(0,1fr)_304px]">
            <div className="flex flex-col gap-3">
              <Bone className="h-7 w-3/4" />
              <Bone className="h-7 w-1/2" />
              <BoneLines lines={3} />
            </div>
            <div className="flex flex-col gap-3 rounded-md bg-inner p-6">
              <BoneLines lines={2} />
              <BoneLines lines={3} />
            </div>
          </div>
        </SkeletonTile>

        {/* overview.themes · ten board rows and the makers line */}
        <SkeletonTile col={12} row={4} className={ROOMY}>
          <BoneBars rows={10} />
          <Bone className="h-10 w-full rounded-[6px]" />
        </SkeletonTile>

        {/* overview.category · the kinds beside the mood */}
        <SkeletonTile col={12} row={3} className={ROOMY}>
          <div className="grid grid-cols-1 gap-x-16 gap-y-6 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
            <BoneBars rows={8} />
            <BoneBars rows={4} />
          </div>
        </SkeletonTile>

        {/* overview.asks · three short lists */}
        <SkeletonTile col={12} row={3} className={ROOMY}>
          <div className="grid grid-cols-1 gap-x-12 gap-y-6 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => <BoneLines key={i} lines={4} />)}
          </div>
        </SkeletonTile>

        {/* overview.subjects · overview.rivals, one line (full width at
            deploy 2, as the page draws them) */}
        <SkeletonTile col={12} row={3} className={ROOMY}>
          <BoneBars rows={8} />
        </SkeletonTile>
        <SkeletonTile col={12} row={1} className={ROOMY}>
          <BoneLines lines={2} />
        </SkeletonTile>

        {/* overview.change · two lines and the month strip */}
        <SkeletonTile col={12} row={2} className={ROOMY}>
          <BoneLines lines={3} />
        </SkeletonTile>
      </PageGrid>
    </SkeletonSurface>
  )
}
