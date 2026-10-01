import { Bone, BoneLines } from '@/components/shell/skeleton'
import { PageTitle } from '@/components/pages/week/read-page'
import { surface } from '@/lib/nav'

// Mirrors components/pages/week/read-page.tsx (the artboard
// Page-This-week.dc.html): the title, then the read's card (In short, then
// findings with the quote beside them), then "Also heard this week". The
// title is the page's own words, so nothing changes when the page lands.
export default function WeekLoading() {
  const title = surface('week').label
  return (
    <div className="flex flex-col gap-[22px]" aria-busy="true">
      <span role="status" className="sr-only">Loading {title}…</span>
      <PageTitle>{title}</PageTitle>
      <section className="flex flex-col gap-4 rounded-[16px] bg-white px-8 pt-7 pb-6">
        <Bone className="h-3 w-20" />
        <BoneLines lines={2} />
        {[0, 1].map((i) => (
          <div key={i} className="grid grid-cols-1 gap-6 border-t border-[#E4E2DC] pt-6 lg:grid-cols-5 lg:gap-9">
            <div className="flex flex-col gap-3 lg:col-span-3"><Bone className="h-5 w-2/3" /><BoneLines lines={4} /></div>
            <div className="flex flex-col gap-3 lg:col-span-2 lg:pt-9"><Bone className="h-24 w-full" /><BoneLines lines={2} /></div>
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-3 rounded-[16px] bg-white px-7 py-6">
        <Bone className="h-5 w-48" />
        <BoneLines lines={3} />
      </section>
    </div>
  )
}
