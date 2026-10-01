import { PageBar } from '@/components/shell/page-grid'
import { Bone, BoneLines } from '@/components/shell/skeleton'
import { PAGE_TITLE } from '@/components/pages/moves/words'

// Mirrors components/pages/moves (MovesPage): the head with its two buttons,
// then the artboard's two white cards, Your statements (the add field and
// three four-column rows) and Moves worth considering (three advice rows).
// The title is the real one, so the page does not change its name on arrival.
export default function MovesLoading() {
  return (
    <div className="flex flex-col gap-[22px]" aria-busy>
      <span role="status" className="sr-only">Loading {PAGE_TITLE}…</span>
      <PageBar title={PAGE_TITLE}>
        <Bone className="h-10 w-[140px] rounded-[10px]" />
        <Bone className="h-10 w-[140px] rounded-[10px]" />
      </PageBar>
      <section className="flex flex-col gap-3 rounded-[16px] bg-white px-7 pt-6 pb-2.5">
        <div className="flex items-baseline justify-between gap-4">
          <Bone className="h-5 w-40" />
          <Bone className="h-3 w-64" />
        </div>
        <BoneLines lines={1} widths={['w-3/5']} />
        <Bone className="h-11 w-full rounded-[10px]" />
        <div className="flex flex-col pt-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid grid-cols-1 items-start gap-4 border-t border-[#E4E2DC] py-[18px] lg:grid-cols-[minmax(0,1.05fr)_220px_minmax(0,1.45fr)_32px] lg:gap-7">
              <BoneLines lines={2} widths={['w-full', 'w-1/2']} />
              <div className="flex flex-col gap-2"><Bone className="h-7 w-20" /><Bone className="h-2 w-full" /></div>
              <BoneLines lines={3} />
              <div />
            </div>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-[10px] rounded-[16px] bg-white px-7 pt-6 pb-2">
        <div className="flex items-baseline justify-between gap-4">
          <Bone className="h-5 w-56" />
          <Bone className="h-3 w-48" />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2 border-t border-[#E4E2DC] py-5">
            <Bone className="h-[26px] w-32 rounded-full" />
            <Bone className="h-4 w-3/4" />
            <BoneLines lines={2} />
          </div>
        ))}
      </section>
    </div>
  )
}
