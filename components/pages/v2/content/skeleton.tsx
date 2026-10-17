import { PageFrame } from '@/components/shell/page-grid'
import { Bone, BoneLines } from '@/components/shell/skeleton'
import { CARD } from '@/components/v2'
import { cn } from '@/lib/utils'

// Content's level pages loading (depth as pages, 17 Oct; the G5 boards): each
// page's own shape, so its blocks fill in place. The routes' loading.tsx
// render these.

/** The path and the title block (the crumb row with its hairline, then the
 *  tile, the level label, the title and the meta). */
function LevelBar() {
  return (
    <div role="presentation" className="flex flex-col">
      <div className="border-b border-border pt-3 pb-[11px] max-sm:hidden sm:-mx-4 sm:-mt-[18px] sm:px-4 md:-mx-10 md:-mt-7 md:px-10"><Bone className="h-[22px] w-64 max-w-full" /></div>
      <Bone className="h-6 w-24 sm:hidden" />
      <div className="mt-2.5 flex items-center gap-3.5">
        <Bone className="size-[46px] shrink-0 rounded-[11px] max-sm:size-[38px]" />
        <div className="flex min-w-0 flex-col gap-1.5"><Bone className="h-3 w-24" /><Bone className="h-7 w-72 max-w-full" /></div>
      </div>
      <Bone className="mt-3 h-3 w-80 max-w-full" />
    </div>
  )
}

/** A post idea's page loading (G5-Content-Idea): the header card and its
 *  four figures, the sub-question cards two to a row, the numbers. */
export function ContentIdeaSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the post idea" className="flex flex-col gap-[22px]">
        <LevelBar />
        <div className={cn(CARD, 'gap-5 overflow-hidden sm:px-[34px] sm:pt-[30px] sm:pb-0 max-sm:pb-0')}>
          <Bone className="h-4 w-40" />
          <Bone className="h-9 w-3/4" />
          <div className="-mx-[34px] grid grid-cols-2 gap-px border-t border-track bg-inner max-sm:-mx-[18px] min-[1180px]:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="flex flex-col gap-2 px-[22px] pt-5 pb-[22px]"><Bone className="h-3 w-20" /><Bone className="h-8 w-24" /><Bone className="h-3 w-32" /></div>)}</div>
        </div>
        <Bone className="h-5 w-56" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className={cn(CARD, 'gap-3')}><Bone className="h-5 w-3/4" /><Bone className="h-1.5 w-full" /><Bone className="h-[110px] w-full rounded-[10px]" /></div>)}</div>
        <Bone className="h-5 w-40" />
        <div className={cn(CARD, 'gap-6')}>
          <div className="grid grid-cols-1 gap-10 xl:grid-cols-2"><Bone className="h-[150px] w-full" /><BoneLines lines={4} /></div>
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">{[0, 1, 2].map((i) => <BoneLines key={i} lines={3} />)}</div>
        </div>
      </div>
    </PageFrame>
  )
}

/** An evidence page loading (G5-Content-Replies, G5-Content-Posts): the lead
 *  and its hairline, the video cards beside the facts. */
function EvidenceSkeleton({ label }: { label: string }) {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-[22px]">
        <LevelBar />
        <div className="flex flex-col gap-3 border-b border-border pb-[22px]"><Bone className="h-6 w-3/4" /><Bone className="h-7 w-96 max-w-full rounded-full" /></div>
        <div className="grid grid-cols-1 items-start gap-11 min-[1180px]:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex flex-col gap-4">
            <Bone className="h-5 w-48" />
            {[0, 1, 2].map((i) => (
              <div key={i} className={cn(CARD, 'gap-3')}>
                <div className="flex items-center gap-3"><Bone className="size-9 rounded-[9px]" /><div className="flex flex-col gap-1.5"><Bone className="h-3.5 w-36" /><Bone className="h-3 w-28" /></div></div>
                <Bone className="h-4 w-4/5" />
                <Bone className="h-[90px] w-full rounded-[10px]" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-4"><Bone className="h-4 w-24" /><BoneLines lines={10} /></div>
        </div>
      </div>
    </PageFrame>
  )
}

export const ContentRepliesSkeleton = () => <EvidenceSkeleton label="Loading the comments worth a reply" />
export const ContentPostsSkeleton = () => <EvidenceSkeleton label="Loading your posts" />
