import { Bone, BoneLines } from '@/components/shell/skeleton'

// Your market's loading skeleton (pages build): the page's own shape, so the
// blocks fill in place. The page's name, the long-run read (its lead and
// three ideas beside their evidence), where your market stands (five rows
// with bars and a quote panel, three name-only rows), then the two blocks
// side by side. The route's loading.tsx renders this.

function Rows({ n, label = 'basis-[45%] sm:basis-[300px]' }: { n: number; label?: string }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3.5 border-t border-[#E4E2DC] py-[9px]">
          <div className={`flex shrink-0 flex-col gap-1.5 ${label}`}>
            <Bone className="h-4 w-3/4" />
            <Bone className="h-3 w-1/2" />
          </div>
          <Bone className="h-2 flex-grow" />
          <Bone className="h-4 w-[40px]" />
        </div>
      ))}
    </div>
  )
}

export function MarketPictureSkeleton() {
  return (
    <div className="flex flex-col gap-[22px]" role="status" aria-busy="true" aria-label="Loading Your market">
      <div className="flex min-h-10 items-center">
        <Bone className="h-7 w-40" />
      </div>
      <div className="flex flex-col gap-[14px] rounded-[16px] bg-white px-5 pb-2.5 pt-7 sm:px-8">
        <Bone className="h-3 w-64" />
        <BoneLines lines={3} className="max-w-[1000px]" widths={['w-full', 'w-11/12', 'w-2/3']} />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="grid grid-cols-1 gap-6 border-t border-[#E4E2DC] py-6 md:grid-cols-5 md:gap-9">
            <div className="flex flex-col gap-3 md:col-span-3">
              <Bone className="h-6 w-4/5" />
              <BoneLines lines={4} />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Bone className="h-3 w-1/2" />
              <Bone className="h-4 w-full" />
              <Bone className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-[14px] rounded-[16px] bg-white px-5 pb-2.5 pt-6 sm:px-7">
        <Bone className="h-5 w-56" />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="grid grid-cols-1 gap-8 border-t border-[#E4E2DC] py-5 md:grid-cols-2">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3.5">
                <Bone className="h-5 w-[130px] sm:w-[170px]" />
                <Bone className="h-2.5 flex-grow" />
                <Bone className="h-4 w-[44px]" />
              </div>
              <BoneLines lines={2} />
            </div>
            <Bone className="h-24 w-full rounded-[12px]" />
          </div>
        ))}
        {Array.from({ length: 3 }, (_, i) => (
          <div key={`n${i}`} className="border-t border-[#E4E2DC] py-4"><Bone className="h-5 w-48" /></div>
        ))}
      </div>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <div className="flex flex-col gap-[14px] rounded-[16px] bg-white px-5 py-6 sm:px-7">
          <Bone className="h-5 w-56" />
          <Rows n={5} />
        </div>
        <div className="flex flex-col gap-[14px] rounded-[16px] bg-white px-5 py-6 sm:px-7">
          <Bone className="h-5 w-64" />
          <Rows n={6} label="w-[150px] sm:w-[230px]" />
        </div>
      </div>
    </div>
  )
}
