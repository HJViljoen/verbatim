import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { Bone, BoneLines } from '@/components/shell/skeleton'
import { CARD } from '@/components/v2'
import { cn } from '@/lib/utils'
import { MARKET_TITLE } from './index'

// Market's loading skeleton (analysis first, 17 Oct): the top page's own
// shape, so the blocks fill in place. The bar, the week card, the subject
// cards two to a row, "Also this week", the three side cards and the table.
// The route's loading.tsx renders this.

export function MarketSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading Market" className="flex flex-col gap-[22px]">
        <PageBar title={MARKET_TITLE} meta={<Bone className="h-3 w-64" />} />
        <div className={cn(CARD, 'gap-[18px]')}>
          <Bone className="h-4 w-40" />
          <Bone className="h-8 w-4/5" />
          <div className="grid grid-cols-1 gap-x-9 gap-y-2.5 border-t border-track pt-4 min-[1180px]:grid-cols-3">{[0, 1, 2].map((i) => <BoneLines key={i} lines={3} />)}</div>
        </div>
        <Bone className="h-5 w-72" />
        <div className="grid grid-cols-12 gap-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={cn(CARD, 'col-span-12 gap-3 min-[1180px]:col-span-6')}>
              <Bone className="h-4 w-32" />
              <Bone className="h-6 w-3/4" />
              <BoneLines lines={4} />
            </div>
          ))}
        </div>
        <Bone className="h-5 w-48" />
        <div className="grid grid-cols-12 gap-5">
          {[0, 1, 2].map((i) => <div key={i} className={cn(CARD, 'col-span-12 min-[1180px]:col-span-4')}><Bone className="h-4 w-36" /><Bone className="h-5 w-3/4" /></div>)}
        </div>
        <div className="grid grid-cols-12 gap-5">
          {[0, 1, 2].map((i) => <div key={i} className={cn(CARD, 'col-span-12 min-[1180px]:col-span-4')}><Bone className="h-5 w-3/4" /><BoneLines lines={5} /></div>)}
        </div>
        <div className={CARD}><Bone className="h-5 w-64" /><BoneLines lines={6} /></div>
      </div>
    </PageFrame>
  )
}

/** The bar of a level page (F3-Market-Nav): the crumb row with its
 *  hairline, then the title block's tile, label, title and meta. */
function LevelBar({ label }: { label: string }) {
  return (
    <div role="presentation" className="flex flex-col">
      <span className="sr-only">{label}</span>
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

/** A tracked subject's page loading (F2-Market-Subject): the bar, the read,
 *  the numbers, the conversations inside it. */
export function MarketSubjectSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the subject" className="flex flex-col gap-[22px]">
        <LevelBar label="Market" />
        <div className={cn(CARD, 'gap-6')}>
          <Bone className="h-4 w-40" />
          <Bone className="h-8 w-3/4" />
          <div className="grid grid-cols-1 gap-10 border-t border-track pt-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <BoneLines lines={7} />
            <BoneLines lines={5} />
          </div>
        </div>
        <div className={cn(CARD, 'gap-6')}>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Bone key={i} className="h-[86px] w-full" />)}</div>
          <div className="grid grid-cols-1 gap-10 xl:grid-cols-2"><Bone className="h-[150px] w-full" /><Bone className="h-[150px] w-full" /></div>
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">{[0, 1, 2].map((i) => <BoneLines key={i} lines={4} />)}</div>
        </div>
        <div className={CARD}><Bone className="h-5 w-56" /><BoneLines lines={4} /></div>
      </div>
    </PageFrame>
  )
}

/** A conversation's page loading (F2-Market-Conversation): the bar and the
 *  one card. */
export function MarketConversationSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the conversation" className="flex flex-col gap-[22px]">
        <LevelBar label="Market" />
        <div className={cn(CARD, 'gap-6')}>
          <Bone className="h-5 w-48" />
          <Bone className="h-8 w-3/4" />
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Bone key={i} className="h-[86px] w-full" />)}</div>
          <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="flex flex-col gap-6"><BoneLines lines={5} /><Bone className="h-[140px] w-full" /></div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <BoneLines key={i} lines={3} />)}</div>
          </div>
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">{[0, 1, 2].map((i) => <Bone key={i} className="h-[92px] w-full" />)}</div>
        </div>
      </div>
    </PageFrame>
  )
}

/** The week's page loading (F2-Market-Week): the bar and the read. */
export function MarketWeekSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading this week’s read" className="flex flex-col gap-[22px]">
        <LevelBar label="Market" />
        <div className={cn(CARD, 'gap-6')}>
          <Bone className="h-4 w-40" />
          <Bone className="h-8 w-4/5" />
          <div className="grid grid-cols-1 gap-10 border-t border-track pt-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <BoneLines lines={10} />
            <BoneLines lines={8} />
          </div>
        </div>
      </div>
    </PageFrame>
  )
}
