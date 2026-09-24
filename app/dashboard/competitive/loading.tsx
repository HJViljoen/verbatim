import { PageGrid } from '@/components/shell/page-grid'
import { SkeletonSurface, SkeletonTile, Bone, BoneLines, BoneBars, BoneTable } from '@/components/shell/skeleton'

// Mirrors components/pages/competitive-surface/index.tsx
// (CompetitiveSurfacePage): the surface bar with Export and How to read, the
// band, the bare rival pill row, then the grid at the artboard's spans
// (`SPAN`): months 12×4 · head to head 7×4 beside own claims 5×4 · said about
// them 5×5 beside the questions 7×5 · the playbook 12×5, on the page's own
// `GRID_ROWS` (116px floors, tiles top-aligned).
export default function CompetitiveLoading() {
  return (
    <SkeletonSurface nav="competitive" pills={2} band>
      {/* competitive.rivals · the pill row above the grid */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <Bone className="h-2.5 w-10" />
        {Array.from({ length: 5 }, (_, i) => <Bone key={i} className="h-[28px] w-24 rounded-full" />)}
      </div>
      <PageGrid className="xl:auto-rows-[minmax(116px,auto)] xl:items-start">
        {/* competitive.months */}
        <SkeletonTile col={12} row={4} meta><BoneTable rows={6} cols={6} /></SkeletonTile>
        {/* competitive.h2h · competitive.ownclaims */}
        <SkeletonTile col={7} row={4} meta><BoneBars rows={6} /></SkeletonTile>
        <SkeletonTile col={5} row={4} meta lines={8} />
        {/* competitive.saidabout · competitive.questions */}
        <SkeletonTile col={5} row={5} meta lines={10} />
        <SkeletonTile col={7} row={5} meta lines={10} />
        {/* competitive.playbook */}
        <SkeletonTile col={12} row={5} meta>
          <BoneLines lines={4} />
          <BoneLines lines={4} />
        </SkeletonTile>
      </PageGrid>
    </SkeletonSurface>
  )
}
