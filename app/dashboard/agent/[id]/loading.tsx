// Loading skeleton for app/dashboard/agent/[id]/page.tsx — one thread.
//
// THE SHAPE IS THE THREAD'S SHAPE (Block D wave 3). Its sibling
// `../loading.tsx` was rewritten to the index's shape when this package
// re-drew Ask, and says why in its own comment: "a skeleton in the wrong shape
// is a layout shift dressed as a loading state". This one was not touched, so
// until now every reader who clicked a row in "Earlier questions" saw the page
// the port DELETED — no page bar, no record band, no ask-box tile, no rail,
// two shadcn `Card`s (which MASTER retires in favour of `Tile`) and an
// `h-14 rounded-2xl` bar at the foot, the 56px composer pill this package
// replaced — and then watched it snap into a two-column board of tiles.
//
// It now draws what the route composes: `AskShell`'s bar and record band over
// `AskColumns` — a left column that grows (the ask box, then the answer) and a
// 320px rail of three, collapsing to one column at `xl` exactly as
// `AskColumns` does. Plain bones rather than `SkeletonTile`, so the two Ask
// skeletons read as siblings.

import { Bone } from '@/components/shell/skeleton'
import { AskCrowd } from '@/components/pages/agent/crowd'

export default function AgentThreadLoading() {
  return (
    <div className="flex flex-col gap-3">
      <span role="status" className="sr-only">Loading…</span>
      {/* The crowd `AskShell` draws behind the tiles, already arrived. */}
      <AskCrowd />
      {/* The page bar, and under it the record band `hasRecord` gives Ask —
          both mounted by `AskShell` on this route. */}
      <Bone className="h-8 w-64 rounded-md" />
      <Bone className="h-[30px] w-[340px] max-w-full rounded-2xl" />
      <div className="flex flex-col items-start gap-4 xl:flex-row">
        <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
          {/* The ask box, then the answer — which runs to any height, so it is
              the tallest bone on the page rather than a card. */}
          <Bone className="h-[172px] w-full rounded-lg" />
          <Bone className="h-[620px] w-full rounded-lg" />
        </div>
        <div className="flex w-full flex-col gap-4 xl:w-[320px] xl:flex-none">
          <Bone className="h-[232px] w-full rounded-lg" />
          <Bone className="h-[196px] w-full rounded-lg" />
          <Bone className="h-[232px] w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
