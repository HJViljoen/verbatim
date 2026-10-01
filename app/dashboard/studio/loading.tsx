import { PageBar } from '@/components/shell/page-grid'
import { Bone } from '@/components/shell/skeleton'
import { surface } from '@/lib/nav'

// Mirrors app/dashboard/studio/page.tsx since the pages build (the Page-Studio
// artboard): the title, then "Your reports", one row per report (the weekly
// and the four monthly briefs), with the card's own grid. Past issues has no
// bone: it is drawn only once an issue has gone out, and a bone for a card the
// page may not draw is a jump when it lands. The operator's workbench below
// streams with the page.
const COLS = 'grid grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.7fr)_minmax(0,1.25fr)_120px] gap-5'

export default function StudioLoading() {
  const title = surface('studio').label
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[22px]">
      <span role="status" className="sr-only">Loading {title}…</span>
      <PageBar title={title} />
      <section className="flex flex-col gap-4 rounded-[16px] bg-white px-[30px] pt-[26px] pb-[22px]">
        <Bone className="h-5 w-36" />
        <div className="-mx-1 overflow-x-hidden px-1">
          <div className="flex min-w-[880px] flex-col">
            <div className={`${COLS} pb-2.5`}>{Array.from({ length: 5 }, (_, i) => <Bone key={i} className="h-3 w-16" />)}</div>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className={`${COLS} items-center border-t border-[#E4E2DC] py-[18px]`}>
                <div className="flex flex-col gap-1.5"><Bone className="h-4 w-2/3" /><Bone className="h-3 w-4/5" /></div>
                <Bone className="h-3.5 w-3/4" />
                <Bone className="h-3.5 w-2/3" />
                <div className="flex gap-1.5"><Bone className="h-7 w-24 rounded-full" /><Bone className="h-7 w-24 rounded-full" /></div>
                <Bone className="h-3.5 w-3/4" />
                <div />
              </div>
            ))}
          </div>
        </div>
        <Bone className="h-3 w-1/2" />
      </section>
    </div>
  )
}
