// Loading skeleton for app/dashboard/agent/page.tsx: the page's own shape, the
// title over the pill in the middle of the pane (1 Oct). The sheet of earlier
// questions is drawn only once there are any, so the skeleton does not promise
// its handle. The bones are the track's grey: the page's ground is the
// skeleton's own light tone, which would draw nothing on it.

import { Bone } from '@/components/shell/skeleton'

export default function AgentLoading() {
  return (
    <div className="flex min-h-full flex-col gap-[22px]">
      <span role="status" className="sr-only">Loading…</span>
      <Bone className="h-8 w-32 rounded-md bg-track" />
      <div className="flex flex-1 items-center justify-center pt-4 pb-24 max-sm:pb-20">
        <div className="flex w-full max-w-[800px] flex-col items-center gap-7">
          <div className="flex w-full flex-col items-center gap-4">
            <Bone className="size-12 rounded-[14px] bg-track" />
            <Bone className="h-8 w-3/5 rounded-md bg-track" />
          </div>
          <Bone className="h-16 w-full rounded-full border border-border bg-tile" />
          <div className="flex w-full items-center justify-between gap-4 px-1">
            <Bone className="h-9 w-36 rounded-full bg-track" />
            <Bone className="h-9 w-80 rounded-full bg-track max-sm:w-32" />
          </div>
        </div>
      </div>
    </div>
  )
}
