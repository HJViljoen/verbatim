import { PageFrame } from '@/components/shell/page-grid'
import { Bone, BoneBars, BoneLines, SkeletonStatStrip } from '@/components/shell/skeleton'
import { CARD } from '@/components/v2'
import { cn } from '@/lib/utils'

// Content's level pages loading (depth as pages, 17 Oct; the G5 boards): each
// page's own shape, so its blocks fill in place. The routes' loading.tsx
// render these.

/** The audit design's title block (7 Nov), drawn as bones: the crumb row,
 *  the title, the line under it and the figures row; no tile, no label. */
function AuditBar({ cells }: { cells: number }) {
  return (
    <div role="presentation" className="flex flex-col">
      <div className="pb-2 max-sm:hidden"><Bone className="h-[22px] w-56 max-w-full" /></div>
      <Bone className="h-6 w-24 sm:hidden" />
      <Bone className="mt-2.5 h-8 w-80 max-w-full" />
      <Bone className="mt-2 h-4 w-64 max-w-full" />
      <div className="mt-5"><SkeletonStatStrip cells={cells} /></div>
    </div>
  )
}

/** A post idea's page loading (Content-Brief.dc.html): the title block and
 *  its three figures, the header tile and its three facts, the sub-question
 *  tiles three to a row, the numbers' tile. */
export function ContentIdeaSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the post idea" className="flex flex-col gap-[22px]">
        <AuditBar cells={3} />
        <div className={cn(CARD, 'gap-3.5 sm:p-[30px]')}>
          <Bone className="h-4 w-40" />
          <Bone className="h-9 w-3/4" />
          <div className="mt-3 grid grid-cols-1 gap-8 border-t border-track pt-[22px] min-[900px]:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="flex flex-col gap-2"><Bone className="h-3 w-20" /><Bone className="h-6 w-28" /><Bone className="h-3 w-40" /></div>)}</div>
        </div>
        <Bone className="mt-[26px] h-6 w-56" />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className={cn(CARD, 'gap-3')}><Bone className="h-5 w-3/4" /><Bone className="h-2 w-full" /><BoneLines lines={2} /></div>)}</div>
        <div className={cn(CARD, 'mt-[26px] gap-6')}>
          <Bone className="h-6 w-40" />
          <div className="grid grid-cols-1 gap-10 min-[1180px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"><Bone className="h-[160px] w-full" /><BoneBars rows={3} /></div>
          <div className="grid grid-cols-1 gap-10 min-[900px]:grid-cols-2">{[0, 1].map((i) => <BoneLines key={i} lines={3} />)}</div>
        </div>
      </div>
    </PageFrame>
  )
}

/** An evidence page loading (Content-Replies.dc.html, Content-Posts.dc.html):
 *  the title block and its figures row, the lead, the post tiles beside the
 *  facts' tile. */
function EvidenceSkeleton({ label, cells }: { label: string; cells: number }) {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-[22px]">
        <AuditBar cells={cells} />
        <Bone className="h-6 w-3/4" />
        <div className="grid grid-cols-1 items-start gap-7 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <Bone className="mt-[26px] h-6 w-48" />
            {[0, 1, 2].map((i) => (
              <div key={i} className={cn(CARD, 'gap-3')}>
                <div className="flex flex-col gap-1.5"><Bone className="h-4 w-36" /><Bone className="h-3 w-28" /></div>
                <BoneLines lines={2} />
                <Bone className="h-[90px] w-full rounded-[10px]" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-4">
            <Bone className="mt-[26px] h-6 w-28" />
            <div className={cn(CARD, 'gap-5')}><BoneBars rows={4} /><BoneBars rows={3} /><BoneLines lines={3} /></div>
          </div>
        </div>
      </div>
    </PageFrame>
  )
}

export const ContentRepliesSkeleton = () => <EvidenceSkeleton label="Loading the comments worth a reply" cells={2} />
export const ContentPostsSkeleton = () => <EvidenceSkeleton label="Loading your posts" cells={3} />
