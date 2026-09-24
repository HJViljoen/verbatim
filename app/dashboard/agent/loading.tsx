// Loading skeleton for app/dashboard/agent/page.tsx.
//
// THE SHAPE IS THE PAGE'S SHAPE (Block D wave 2, E-ask). It used to draw the
// stage — a centred pill and a sheet flush with the bottom edge — under a class
// that stopped <main> scrolling, both since deleted. Ask is a board of tiles
// now, and a skeleton in the wrong shape is a layout shift dressed as a loading
// state.

import { Bone } from '@/components/shell/skeleton'
import { AskCrowd } from '@/components/pages/agent/crowd'

export default function AgentLoading() {
  return (
    <div className="flex flex-col gap-3">
      <span role="status" className="sr-only">Loading…</span>
      {/* The crowd `AskShell` draws behind the tiles, and the one place its
          entrance plays: this paints first, the page lands on the arrived ring. */}
      <AskCrowd enter />
      {/* The page bar, and under it the record band — the index passes
          `AskShell` a record too. */}
      <Bone className="h-8 w-64 rounded-md" />
      <Bone className="h-[30px] w-[340px] max-w-full rounded-2xl" />
      {/* The INDEX's shape, which is not the thread's: the box over three
          tiles, not the box beside a rail (`AskIndexColumns`). A skeleton in
          the wrong shape is a layout shift dressed as a loading state, and this
          file is the skeleton for `page.tsx` alone. */}
      <Bone className="h-[128px] w-full rounded-lg" />
      {/* History at seven columns, the two short tiles stacked in five. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Bone className="h-[260px] w-full rounded-lg xl:col-span-7" />
        <div className="flex flex-col gap-4 xl:col-span-5">
          <Bone className="h-[140px] w-full rounded-lg" />
          <Bone className="h-[104px] w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
