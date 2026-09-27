import { PageGrid } from '@/components/shell/page-grid'
import { SkeletonSurface, SkeletonTile, BoneLines, BoneBars, BoneTable } from '@/components/shell/skeleton'

// Mirrors components/pages/competitive-surface/index.tsx (the Brands page,
// market-first WP3.5, `BRANDS_LINES`): the surface bar with its one line and
// Export as the 40px button (no horizon pills), then the preview's grid,
// 24px apart: your name 12 · the brands 12 · a brand in full 8 beside what is
// asked under its content 4 · where a rival's talk differs 12 · what they post
// and say 12 · how the market makes content 6 beside the share of what our
// searches found 6.
export default function BrandsLoading() {
  return (
    <SkeletonSurface nav="competitive" button>
      <PageGrid className="gap-6">
        {/* competitive.name */}
        <SkeletonTile col={12} row={2} lines={3} />
        {/* competitive.topics */}
        <SkeletonTile col={12} row={3}><BoneTable rows={5} cols={4} /></SkeletonTile>
        {/* competitive.rivals · competitive.questions */}
        <SkeletonTile col={8} row={4}><BoneTable rows={6} cols={3} /></SkeletonTile>
        <SkeletonTile col={4} row={4} lines={6} />
        {/* competitive.findings */}
        <SkeletonTile col={12} row={3}><BoneLines lines={5} /></SkeletonTile>
        {/* competitive.ownclaims */}
        <SkeletonTile col={12} row={3}><BoneBars rows={6} /></SkeletonTile>
        {/* competitive.playbook · competitive.months */}
        <SkeletonTile col={6} row={2} lines={5} />
        <SkeletonTile col={6} row={2} lines={3} />
      </PageGrid>
    </SkeletonSurface>
  )
}
