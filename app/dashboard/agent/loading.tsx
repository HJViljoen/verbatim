// Loading skeleton for app/dashboard/agent/page.tsx (pages rebuild, 1 Oct):
// the page's own shape, the title over the one question card
// (Page-Agent.dc.html). Earlier questions are drawn only once there are any,
// so the skeleton does not promise them.

import { Bone } from '@/components/shell/skeleton'

export default function AgentLoading() {
  return (
    <div className="flex flex-col gap-[22px]">
      <span role="status" className="sr-only">Loading…</span>
      <Bone className="h-8 w-32 rounded-md" />
      <div className="flex flex-col gap-5 rounded-[20px] bg-white px-8 pt-[30px] pb-[26px]">
        <div className="flex items-center gap-3.5">
          <Bone className="size-11 rounded-xl" />
          <div className="flex flex-1 flex-col gap-2">
            <Bone className="h-6 w-2/5" />
            <Bone className="h-4 w-3/5" />
          </div>
        </div>
        <Bone className="h-[190px] w-full rounded-[14px]" />
        <div className="flex items-center justify-between gap-4">
          <Bone className="h-10 w-40 rounded-[10px]" />
          <Bone className="h-11 w-72 rounded-[10px]" />
        </div>
      </div>
    </div>
  )
}
