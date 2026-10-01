import { PageBar } from '@/components/shell/page-grid'
import { Bone, BoneLines } from '@/components/shell/skeleton'
import { surface } from '@/lib/nav'

// The Dashboard while it loads: the page's own frame (components/pages/home),
// bones where its words and numbers go. The title is real, because it does
// not change when the page lands. "Week by week" has no bone: it is drawn only
// once two settled weeks exist, and a bone for a block the page may not draw
// is a jump when it lands. `/dashboard`'s loading.tsx renders this.

const SHADOW = 'shadow-[0_1px_2px_rgba(0,0,0,0.05),0_4px_14px_rgba(0,0,0,0.04)]'

export function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-5 leading-[normal] text-[#26292C]">
      <span role="status" className="sr-only">Loading Dashboard…</span>
      <PageBar title={surface('home').label} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className={`flex flex-col gap-[18px] rounded-[16px] bg-white px-[26px] py-[22px] self-start xl:col-span-2 ${SHADOW}`}>
          <Bone className="h-5 w-56" />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="flex flex-col gap-[14px]">
                <Bone className="h-3.5 w-48" />
                <div className="grid grid-cols-2 gap-4">
                  {[0, 1].map((j) => (
                    <div key={j} className="flex flex-col gap-1.5">
                      <Bone className="h-10 w-24" />
                      <Bone className="h-3 w-16" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className={`flex flex-col gap-[14px] rounded-[16px] bg-white p-[22px] ${SHADOW}`}>
          <div className="flex items-center gap-2.5">
            <Bone className="size-8 rounded-[8px]" />
            <Bone className="h-5 w-20" />
          </div>
          <BoneLines lines={2} />
          <Bone className="h-[150px] w-full rounded-[10px]" />
          <Bone className="h-11 w-full rounded-[10px]" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`flex flex-col gap-2.5 rounded-[14px] bg-white px-[22px] py-5 ${SHADOW}`}>
            <div className="flex items-center justify-between">
              <Bone className="h-4 w-28" />
              <Bone className="h-3.5 w-12" />
            </div>
            <div className="flex items-end gap-2.5">
              <Bone className="h-9 w-14" />
              <Bone className="h-3.5 w-36" />
            </div>
            <div className="flex flex-col gap-[7px]">
              {[0, 1, 2].map((j) => <Bone key={j} className="h-3.5 w-full" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
