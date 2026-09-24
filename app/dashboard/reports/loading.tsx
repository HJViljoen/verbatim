import { PageFrame, PageBar, PageGrid } from '@/components/shell/page-grid'
import { SkeletonTile, Bone, BoneLines } from '@/components/shell/skeleton'
import { surface } from '@/lib/nav'

// Mirrors app/dashboard/reports/page.tsx: the title bar with its question,
// How to read and "Open the Studio", then the role briefs (a heading line and
// three cards, two-up from md and three-up from lg, 248px floors, as
// components/reports/brief-cards.tsx lays them), the quarterly card (7)
// beside the Studio card (5), and the archive full width. The old skeleton
// drew a rail · list · detail master-detail the page stopped drawing.
//
// Also the loader for reports/[id] and reports/new, which only redirect.
export default function ReportsLoading() {
  const s = surface('reports')
  return (
    <PageFrame className="gap-4">
      <span role="status" className="sr-only">Loading {s.label}…</span>
      <PageBar title={s.label} context={<Bone className="h-3 w-56" />} subtitle={s.question ?? undefined}>
        <Bone className="h-[26px] w-20 rounded-full" />
        <Bone className="h-[26px] w-28 rounded-full" />
      </PageBar>

      {/* the role briefs */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-4"><Bone className="h-2.5 w-28" /><Bone className="h-2.5 w-48" /></div>
        <Bone className="h-2.5 w-2/3" />
      </div>
      <PageGrid className="md:grid-cols-2 lg:grid-cols-3 xl:auto-rows-min">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonTile key={i} col={4} row={2} meta className="xl:min-h-[248px]">
            <BoneLines lines={2} />
            <Bone className="h-5 w-24 rounded-full" />
            <div className="flex flex-col gap-1.5 rounded-[4px] bg-inner px-3 py-2.5">
              {Array.from({ length: 3 }, (_, r) => (
                <div key={r} className="flex justify-between gap-3"><Bone className="h-2.5 w-1/2 bg-tile" /><Bone className="h-2.5 w-10 bg-tile" /></div>
              ))}
            </div>
          </SkeletonTile>
        ))}
      </PageGrid>

      {/* the quarterly card · the Studio card */}
      <PageGrid className="xl:auto-rows-min">
        <SkeletonTile col={7} row={2} meta lines={4} />
        <SkeletonTile col={5} row={2} meta>
          <BoneLines lines={2} />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 5 }, (_, i) => <Bone key={i} className="h-6 w-20 rounded-full" />)}
          </div>
        </SkeletonTile>
      </PageGrid>

      {/* the archive */}
      <PageGrid className="xl:auto-rows-min">
        <SkeletonTile col={12} row={4} meta>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 4 }, (_, i) => <Bone key={i} className="h-[26px] w-24 rounded-full" />)}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.25fr_1fr_0.75fr]">
            {Array.from({ length: 3 }, (_, c) => (
              <div key={c} className="flex min-w-0 flex-col gap-2">
                <div className="flex justify-between gap-2"><Bone className="h-2.5 w-24" /><Bone className="h-2.5 w-10" /></div>
                {Array.from({ length: 5 }, (_, r) => (
                  <div key={r} className="flex flex-col gap-1 py-1"><Bone className="h-3 w-[90%]" /><Bone className="h-2.5 w-3/5" /></div>
                ))}
              </div>
            ))}
          </div>
        </SkeletonTile>
      </PageGrid>
    </PageFrame>
  )
}
