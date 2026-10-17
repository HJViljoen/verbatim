import { PageFrame } from '@/components/shell/page-grid'
import { Bone, BoneLines } from '@/components/shell/skeleton'
import { CARD } from '@/components/v2'
import { cn } from '@/lib/utils'

// Your moves' level pages loading (levels as pages, 17 Oct; the G6 boards):
// each page's own shape, so its blocks fill in place. The routes' loading.tsx
// render these.

/** The path and the title block, as `LevelBar` draws them. */
function Bar({ label, controls = false }: { label: string; controls?: boolean }) {
  return (
    <div role="presentation" className="flex flex-col">
      <span className="sr-only">{label}</span>
      <div className="border-b border-border pt-3 pb-[11px] max-sm:hidden sm:-mx-4 sm:-mt-[18px] sm:px-4 md:-mx-10 md:-mt-7 md:px-10"><Bone className="h-[22px] w-72 max-w-full" /></div>
      <Bone className="h-6 w-28 sm:hidden" />
      <div className="mt-2.5 flex flex-wrap items-end justify-between gap-3.5">
        <div className="flex min-w-0 items-center gap-3.5">
          <Bone className="size-[46px] shrink-0 rounded-[11px] max-sm:size-[38px]" />
          <div className="flex min-w-0 flex-col gap-1.5"><Bone className="h-3 w-24" /><Bone className="h-7 w-96 max-w-full" /></div>
        </div>
        {controls ? <div className="flex gap-2"><Bone className="h-[38px] w-52 rounded-lg" /><Bone className="h-[38px] w-24 rounded-lg" /></div> : null}
      </div>
      <Bone className="mt-3 h-3 w-80 max-w-full" />
    </div>
  )
}

/** A piece of advice loading: the header card and its four figures, the
 *  argument, three conversation cards, the numbers, the comments, the history. */
export function MovesAdviceSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the advice" className="flex flex-col gap-[22px]">
        <Bar label="Your moves" controls />
        <div className={cn(CARD, 'gap-5 overflow-hidden sm:px-[34px] sm:pt-[30px] sm:pb-0 max-sm:pb-0')}>
          <Bone className="h-5 w-56" />
          <Bone className="h-9 w-4/5" />
          <div className="-mx-[34px] grid grid-cols-2 gap-px border-t border-track bg-inner max-sm:-mx-[18px] min-[1180px]:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="flex flex-col gap-2 px-[22px] pt-5 pb-[22px]"><Bone className="h-8 w-16" /><Bone className="h-3 w-32" /></div>)}</div>
        </div>
        <div className={cn(CARD, 'gap-6')}>
          <div className="grid grid-cols-1 gap-10 min-[1180px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"><BoneLines lines={6} /><BoneLines lines={4} /></div>
        </div>
        <Bone className="h-5 w-64" />
        <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className={CARD}><Bone className="size-[26px] rounded-[7px]" /><Bone className="h-5 w-3/4" /><BoneLines lines={3} /></div>)}
        </div>
        <Bone className="h-5 w-40" />
        <div className={CARD}><BoneLines lines={7} /></div>
        <div className={CARD}><BoneLines lines={4} /></div>
      </div>
    </PageFrame>
  )
}

/** A dated move loading: the flat header with its line, the videos and the
 *  facts beside them, the other moves. */
export function MovesMoveSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the move" className="flex flex-col gap-[22px]">
        <Bar label="Your moves" />
        <div className="grid grid-cols-1 gap-5 border-b border-border pb-[22px] min-[1180px]:grid-cols-[minmax(0,1fr)_460px]">
          <BoneLines lines={4} />
          <Bone className="h-[140px] w-full rounded-[10px]" />
        </div>
        <div className="grid grid-cols-1 items-start gap-11 min-[1180px]:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex flex-col gap-4">
            <Bone className="h-5 w-56" />
            {[0, 1, 2].map((i) => <div key={i} className={CARD}><Bone className="h-9 w-48" /><BoneLines lines={4} /></div>)}
          </div>
          <div className="flex flex-col gap-3"><Bone className="h-4 w-24" /><BoneLines lines={10} /></div>
        </div>
      </div>
    </PageFrame>
  )
}

/** The advice record loading: three list cards. */
export function MovesRecordSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the advice record" className="flex flex-col gap-[22px]">
        <Bar label="Your moves" />
        {[3, 4, 6].map((n, i) => (
          <div key={i} className={cn(CARD, 'gap-3')}>
            <Bone className="h-5 w-48" />
            {Array.from({ length: n }, (_, j) => <div key={j} className="flex items-center gap-3.5"><Bone className="size-[26px] shrink-0 rounded-[7px]" /><BoneLines lines={2} widths={['w-2/3', 'w-1/2']} /></div>)}
          </div>
        ))}
      </div>
    </PageFrame>
  )
}
