import { PageFrame, PageBar } from '@/components/shell/page-grid'
import { Bone, BoneLines } from '@/components/shell/skeleton'

// Mirrors app/dashboard/studio/new/page.tsx: the bar with "Back to the Studio",
// a bare "Templates" header, then two labelled groups of template cards, two
// abreast from md. Without this file the page inherited the Studio's list and
// detail panes, which it does not draw.
function Card() {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-tile p-4 shadow-tile">
      <Bone className="h-4 w-2/5" />
      <Bone className="h-2.5 w-3/5" />
      <BoneLines lines={2} />
      <Bone className="mt-1 h-[26px] w-24 rounded-full" />
    </div>
  )
}

export default function StudioNewLoading() {
  return (
    <PageFrame className="min-h-0 flex-1">
      <span role="status" className="sr-only">Loading New report…</span>
      <PageBar title="New report" context="pick a starting point">
        <Bone className="h-[26px] w-32 rounded-full" />
      </PageBar>
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-baseline justify-between border-b border-border/70 px-4 pt-3.5 pb-3"><Bone className="h-2.5 w-20" /><Bone className="h-2.5 w-56" /></div>
        <div className="flex flex-col gap-6 px-1 py-4">
          {[2, 4].map((n, g) => (
            <div key={g} className="flex flex-col gap-3">
              <Bone className="mx-1 h-2.5 w-40" />
              <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: n }, (_, i) => <Card key={i} />)}</div>
            </div>
          ))}
        </div>
      </section>
    </PageFrame>
  )
}
