import { PageBar } from '@/components/shell/page-grid'
import { Bone } from '@/components/shell/skeleton'
import { surface } from '@/lib/nav'

// Mirrors app/dashboard/studio/page.tsx since the audit design (7 Nov,
// Studio.dc.html): the title, then "Your reports" as its card, a table head
// and one row (the weekly alone until the briefs are built). The monthly
// briefs and past issues have no bones: each is drawn only once there is
// one, and a bone for a card the page may not draw is a jump when it lands.
// The operator's workbench below streams with the page.

export default function StudioLoading() {
  const title = surface('studio').label
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[22px]">
      <span role="status" className="sr-only">Loading {title}…</span>
      <PageBar title={title} />
      <section aria-hidden className="flex flex-col gap-3.5 rounded-[12px] bg-white p-[26px] shadow-card max-sm:p-[18px]">
        <Bone className="h-6 w-40" />
        <div className="flex gap-4 pb-2 max-sm:hidden">
          <Bone className="h-3 w-24" />
          <Bone className="ml-auto h-3 w-16" />
          <Bone className="h-3 w-20" />
          <Bone className="h-3 w-20" />
          <Bone className="h-3 w-20" />
        </div>
        <div className="flex flex-col gap-2 border-t border-track pt-3.5">
          <Bone className="h-4 w-40" />
          <Bone className="h-3.5 w-3/4" />
          <Bone className="h-3.5 w-1/2" />
        </div>
        <Bone className="h-3 w-1/2" />
      </section>
    </div>
  )
}
