import { Bone } from '@/components/shell/skeleton'

// Mirrors components/pages/subjects/page.tsx (SubjectsPage) with a subject
// open, which is how the page opens: the title, a 260px list beside the open
// subject, and what people say about it beside the questions asked on it. Same
// `lg:` and `xl:` breakpoints as the page, so the real cards land where the
// bones were.
export default function SubjectsLoading() {
  return (
    <div className="flex flex-col gap-[22px]">
      <span role="status" className="sr-only">Loading…</span>
      <Bone className="h-8 w-40 rounded-md" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-3 rounded-2xl bg-white px-5 pt-5 pb-[22px]">
          <Bone className="h-5 w-32" />
          {Array.from({ length: 8 }, (_, i) => <Bone key={i} className={i === 0 ? 'h-[42px] w-full rounded-lg' : 'h-[42px] w-[85%] rounded-lg'} />)}
          <Bone className="h-10 w-36 rounded-[10px]" />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-4 rounded-2xl bg-white px-[30px] pt-[26px] pb-7">
            <Bone className="h-8 w-1/3" />
            <Bone className="h-4 w-3/4" />
            <Bone className="mt-4 h-10 w-1/2" />
            <Bone className="h-2.5 w-full rounded-[5px]" />
            <Bone className="h-4 w-full" />
            <Bone className="h-4 w-2/3" />
          </div>
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-2xl bg-white px-7 pt-6 pb-5">
              <Bone className="h-6 w-1/2" />
              {Array.from({ length: 7 }, (_, i) => <Bone key={i} className="h-6 w-full" />)}
            </div>
            <div className="flex flex-col gap-3 rounded-2xl bg-white px-7 pt-6 pb-5">
              <Bone className="h-6 w-1/2" />
              {Array.from({ length: 3 }, (_, i) => <Bone key={i} className="h-7 w-full" />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
