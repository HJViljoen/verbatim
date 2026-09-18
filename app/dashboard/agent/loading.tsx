// Loading skeleton for app/dashboard/agent/page.tsx.
//
// THE SHAPE IS THE PAGE'S SHAPE (Block D wave 2, E-ask). It used to draw the
// stage — a centred pill and a sheet flush with the bottom edge — under
// `.agent-fixed`, the class that stopped <main> scrolling. Ask is a two-column
// board of tiles now, and a skeleton in the wrong shape is a layout shift
// dressed as a loading state.

import { Bone } from '@/components/shell/skeleton'

export default function AgentLoading() {
  return (
    <div className="flex flex-col gap-3">
      <span role="status" className="sr-only">Loading…</span>
      <Bone className="h-8 w-64 rounded-md" />
      <div className="flex flex-col items-start gap-4 xl:flex-row">
        <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
          <Bone className="h-[128px] w-full rounded-lg" />
          <Bone className="h-[420px] w-full rounded-lg" />
        </div>
        <div className="flex w-full flex-col gap-4 xl:w-[320px] xl:flex-none">
          <Bone className="h-[180px] w-full rounded-lg" />
          <Bone className="h-[160px] w-full rounded-lg" />
          <Bone className="h-[160px] w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
