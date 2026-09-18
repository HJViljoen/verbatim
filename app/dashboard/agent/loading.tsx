// Loading skeleton for app/dashboard/agent/page.tsx.
//
// THE SHAPE IS THE PAGE'S SHAPE (Block D wave 2, E-ask). It used to draw the
// stage — a centred pill and a sheet flush with the bottom edge — under a class
// that stopped <main> scrolling, both since deleted. Ask is a board of tiles
// now, and a skeleton in the wrong shape is a layout shift dressed as a loading
// state.

import { Bone } from '@/components/shell/skeleton'

export default function AgentLoading() {
  return (
    <div className="flex flex-col gap-3">
      <span role="status" className="sr-only">Loading…</span>
      <Bone className="h-8 w-64 rounded-md" />
      {/* The INDEX's shape, which is not the thread's: the box over three
          tiles, not the box beside a rail (`AskIndexColumns`). A skeleton in
          the wrong shape is a layout shift dressed as a loading state, and this
          file is the skeleton for `page.tsx` alone. */}
      <Bone className="h-[128px] w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Bone className="h-[220px] w-full rounded-lg" />
        <Bone className="h-[220px] w-full rounded-lg" />
        <Bone className="h-[220px] w-full rounded-lg" />
      </div>
    </div>
  )
}
