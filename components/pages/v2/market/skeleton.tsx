import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { Bone, BoneLines, SkeletonStatStrip } from '@/components/shell/skeleton'
import { CARD } from '@/components/v2'
import { cn } from '@/lib/utils'
import { MARKET_TITLE } from './index'

// Market's loading skeleton, in the audit design's shape (7 Nov): the top
// page's own shape, so the blocks fill in place: the title, the figures
// row's bones, the week card, the subject cards two to a row, the three side
// cards and the table. No tile bone, no "Also this week". The route's
// loading.tsx renders this.

export function MarketSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading Market" className="flex flex-col gap-[22px]">
        <div className="flex shrink-0 flex-col">
          <PageBar title={MARKET_TITLE} />
          <div className="mt-5"><SkeletonStatStrip cells={4} /></div>
        </div>
        <div className={cn(CARD, 'gap-[18px] sm:p-[30px]')}>
          <Bone className="h-8 w-4/5" />
          <Bone className="h-4 w-32" />
          <div className="grid grid-cols-1 gap-x-8 gap-y-3 min-[1180px]:grid-cols-3">{[0, 1, 2].map((i) => <BoneLines key={i} lines={3} />)}</div>
        </div>
        <Bone className="mt-[26px] h-5 w-72" />
        <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={cn(CARD, 'gap-2.5')}>
              <Bone className="h-5 w-48" />
              <Bone className="h-5 w-3/4" />
              <BoneLines lines={4} />
            </div>
          ))}
        </div>
        <Bone className="mt-[26px] h-5 w-56" />
        <div className="grid grid-cols-12 gap-5">
          {[0, 1, 2].map((i) => <div key={i} className={cn(CARD, 'col-span-12 min-[1180px]:col-span-4')}><Bone className="h-5 w-3/4" /><BoneLines lines={5} /></div>)}
        </div>
        <div className={cn(CARD, 'mt-[26px]')}><Bone className="h-5 w-64" /><BoneLines lines={6} /></div>
      </div>
    </PageFrame>
  )
}

/** The bar of a level page, in the audit design's title block (7 Nov): the
 *  crumb row with its hairline, the title, and the figures row's bones; no
 *  tile and no label. */
function LevelBar({ label, cells = 4 }: { label: string; cells?: number }) {
  return (
    <div role="presentation" className="flex flex-col">
      <span className="sr-only">{label}</span>
      <div className="border-b border-border pt-3 pb-[11px] max-sm:hidden sm:-mx-4 sm:-mt-[18px] sm:px-4 md:-mx-10 md:-mt-9 md:px-10"><Bone className="h-[22px] w-64 max-w-full" /></div>
      <Bone className="h-6 w-24 sm:hidden" />
      <Bone className="mt-3 h-8 w-80 max-w-full" />
      <div className="mt-5"><SkeletonStatStrip cells={cells} /></div>
    </div>
  )
}

/** A tracked subject's page loading (Market-Subject.dc.html): the path,
 *  the title and its figures row, the read tile, the list inside it, the
 *  numbers' tiles. */
export function MarketSubjectSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the subject" className="flex flex-col gap-[22px]">
        <LevelBar label="Market" cells={4} />
        <div className={cn(CARD, 'gap-[26px] sm:p-[30px]')}>
          <Bone className="h-8 w-3/4" />
          <div className="grid grid-cols-1 gap-12 border-t border-track pt-[26px] min-[1180px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <BoneLines lines={7} />
            <BoneLines lines={5} />
          </div>
        </div>
        <Bone className="mt-[26px] h-5 w-56" />
        <div className={CARD}><BoneLines lines={6} /></div>
        <Bone className="mt-[26px] h-5 w-40" />
        <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-2">{[0, 1].map((i) => <div key={i} className={CARD}><Bone className="h-5 w-48" /><Bone className="h-[150px] w-full" /></div>)}</div>
        <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className={CARD}><Bone className="h-5 w-40" /><BoneLines lines={4} /></div>)}</div>
      </div>
    </PageFrame>
  )
}

/** A conversation's page loading (Market-Conversation.dc.html): the path,
 *  the title and its figures row, the lead, the video tiles beside the
 *  facts' tile, the siblings. */
export function MarketConversationSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the conversation" className="flex flex-col gap-[22px]">
        <LevelBar label="Market" cells={4} />
        <Bone className="h-5 w-3/4" />
        <div className="grid grid-cols-1 items-start gap-x-11 gap-y-[22px] min-[1180px]:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-4">
            <Bone className="mt-[26px] h-5 w-48" />
            {[0, 1, 2].map((i) => (
              <div key={i} className={cn(CARD, 'gap-3')}>
                <div className="flex items-center justify-between"><Bone className="h-4 w-36" /><Bone className="h-3 w-28" /></div>
                <BoneLines lines={2} />
                <Bone className="h-[120px] w-full rounded-[10px]" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-4"><Bone className="mt-[26px] h-5 w-24" /><div className={CARD}><BoneLines lines={10} /></div></div>
        </div>
        <div className="mt-[26px] grid grid-cols-2 gap-4 min-[1180px]:grid-cols-4">{[0, 1, 2, 3].map((i) => <Bone key={i} className="h-[72px] w-full rounded-[12px]" />)}</div>
      </div>
    </PageFrame>
  )
}

/** The week's page loading (Market-Week.dc.html): the bar and the read. */
export function MarketWeekSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading this week’s read" className="flex flex-col gap-[22px]">
        <LevelBar label="Market" cells={3} />
        <div className={cn(CARD, 'gap-[26px] sm:p-[30px]')}>
          <Bone className="h-8 w-4/5" />
          <div className="grid grid-cols-1 gap-12 border-t border-track pt-[26px] min-[1180px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <BoneLines lines={10} />
            <BoneLines lines={8} />
          </div>
        </div>
      </div>
    </PageFrame>
  )
}
