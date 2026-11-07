import { PageFrame } from '@/components/shell/page-grid'
import { Bone, BoneLines } from '@/components/shell/skeleton'

// Mirrors app/dashboard/studio/new/page.tsx (the audit design, Studio-New.dc
// .html): the crumb row, the title with "Back to the Studio" at the right,
// the "Templates" head with its note, then the template tiles two abreast
// from md, each with its two facts and its button. Without this file the
// page inherited the Studio's own loading screen, which it does not draw.
function Tile() {
  return (
    <div className="flex flex-col gap-3.5 rounded-[12px] bg-white p-[26px] max-sm:p-[18px]">
      <Bone className="h-5 w-2/5" />
      <div className="grid grid-cols-2 gap-4"><Bone className="h-8 w-24" /><Bone className="h-8 w-24" /></div>
      <BoneLines lines={3} />
      <Bone className="mt-1 h-10 w-40 rounded-[8px]" />
    </div>
  )
}

export default function StudioNewLoading() {
  return (
    <PageFrame>
      <span role="status" className="sr-only">Loading New report…</span>
      <div className="flex flex-col">
        <Bone className="h-3 w-36" />
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-4">
          <Bone className="h-8 w-48" />
          <Bone className="h-3 w-32" />
        </div>
      </div>
      <div className="mt-[26px] flex items-baseline justify-between gap-4"><Bone className="h-5 w-28" /><Bone className="h-3 w-56" /></div>
      <div className="grid gap-5 md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Tile key={i} />)}</div>
    </PageFrame>
  )
}
