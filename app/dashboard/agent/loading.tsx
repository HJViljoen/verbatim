// Loading skeleton for app/dashboard/agent/page.tsx: the page's own shape
// since the audit design (7 Nov, Agent.dc.html): the title, then the
// question's tile (its heading, the label, the field and Ask, the controls on
// a hairline). Earlier questions are drawn only once there are any, so the
// skeleton does not promise their tile. The tile's bones are the track's
// grey on the card.

import { Bone } from '@/components/shell/skeleton'
import { CARD } from '@/components/v2'
import { cn } from '@/lib/utils'

export default function AgentLoading() {
  return (
    <div className="flex flex-col gap-[22px]">
      <span role="status" className="sr-only">Loading…</span>
      <Bone className="h-8 w-32 rounded-md bg-track" />
      <div aria-hidden className={cn(CARD, 'w-full max-w-[1000px] gap-[18px] p-[30px] max-sm:gap-4 max-sm:p-[18px]')}>
        <Bone className="h-8 w-3/5 rounded-md bg-track" />
        <div className="flex flex-col gap-2">
          <Bone className="h-3.5 w-28 bg-track" />
          <div className="flex gap-2.5">
            <Bone className="h-14 flex-1 rounded-[10px] bg-track" />
            <Bone className="h-14 w-[74px] rounded-[10px] bg-track" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-7 gap-y-4 border-t border-track pt-[18px]">
          <Bone className="h-10 w-56 rounded-[8px] bg-track" />
          <Bone className="h-11 w-64 rounded-[10px] bg-track" />
          <Bone className="h-4 w-60 bg-track" />
        </div>
      </div>
    </div>
  )
}
