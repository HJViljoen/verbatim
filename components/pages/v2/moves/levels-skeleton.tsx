import { PageFrame } from '@/components/shell/page-grid'
import { Bone, BoneLines, SkeletonStatStrip } from '@/components/shell/skeleton'
import { CARD } from '@/components/v2'
import { cn } from '@/lib/utils'

// Your moves' level pages loading (levels as pages, 17 Oct; the G6 boards):
// each page's own shape, so its blocks fill in place. The routes' loading.tsx
// render these.

/** A piece of advice loading (Moves-Advice.dc.html): the title block with
 *  its tags, its decisions and four figures, the argument's tile, the
 *  conversations' table, the numbers, the comments, the history. */
export function MovesAdviceSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the advice" className="flex flex-col gap-[22px]">
        <AuditBar label="Your moves" cells={4} controls />
        <div className={cn(CARD, 'gap-[22px] sm:p-[30px]')}>
          <Bone className="h-8 w-4/5" />
          <div className="grid grid-cols-1 gap-9 border-t border-track pt-[22px] min-[900px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"><BoneLines lines={4} /><BoneLines lines={3} /></div>
        </div>
        <Bone className="mt-[26px] h-6 w-64" />
        <div className={CARD}><BoneLines lines={8} /></div>
        <Bone className="mt-[26px] h-6 w-40" />
        <div className={CARD}><BoneLines lines={7} /></div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className={CARD}><BoneLines lines={4} /></div>)}</div>
      </div>
    </PageFrame>
  )
}

/** A dated move loading (Moves-Move.dc.html): the title block with its
 *  status and four figures, the lead tile beside its months, the videos and
 *  the facts' tile beside them. */
export function MovesMoveSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the move" className="flex flex-col gap-[22px]">
        <AuditBar label="Your moves" cells={4} controls />
        <div className={cn(CARD, 'grid grid-cols-1 gap-10 sm:p-[30px] xl:grid-cols-2')}>
          <BoneLines lines={4} />
          <Bone className="h-[110px] w-full rounded-[10px]" />
        </div>
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-[18px]">
            <Bone className="mt-[26px] h-6 w-56" />
            {[0, 1, 2].map((i) => <div key={i} className={CARD}><Bone className="h-5 w-48" /><BoneLines lines={4} /></div>)}
          </div>
          <div className={cn(CARD, 'xl:mt-[67px]')}><Bone className="h-5 w-24" /><BoneLines lines={10} /></div>
        </div>
      </div>
    </PageFrame>
  )
}

/** The audit design's title block (7 Nov), drawn as bones: the crumb row,
 *  the title, the line under it and the figures row; no tile, no label. */
function AuditBar({ label, cells, controls = false }: { label: string; cells: number; controls?: boolean }) {
  return (
    <div role="presentation" className="flex flex-col">
      <span className="sr-only">{label}</span>
      <div className="pb-2 max-sm:hidden"><Bone className="h-[22px] w-64 max-w-full" /></div>
      <Bone className="h-6 w-28 sm:hidden" />
      <div className="mt-2.5 flex flex-wrap items-start justify-between gap-3.5">
        <div className="flex min-w-0 flex-col gap-2"><Bone className="h-8 w-96 max-w-full" /><Bone className="h-4 w-64 max-w-full" /></div>
        {controls ? <div className="flex gap-2"><Bone className="h-10 w-52 rounded-[8px]" /><Bone className="h-10 w-24 rounded-[8px]" /></div> : null}
      </div>
      <div className="mt-5"><SkeletonStatStrip cells={cells} /></div>
    </div>
  )
}

/** The advice record loading (Moves-AdviceList.dc.html): the title block and
 *  its four figures, three tiles of rows. */
export function MovesRecordSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the advice record" className="flex flex-col gap-[22px]">
        <AuditBar label="Your moves" cells={4} />
        {[3, 4, 6].map((n, i) => (
          <div key={i} className={cn(CARD, 'gap-3.5')}>
            <Bone className="h-6 w-56" />
            <BoneLines lines={n} />
          </div>
        ))}
      </div>
    </PageFrame>
  )
}
