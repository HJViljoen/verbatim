import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { Bone, BoneLines } from '@/components/shell/skeleton'
import { CARD } from '@/components/v2'
import { cn } from '@/lib/utils'
import { MARKET_TITLE } from './index'

// Market's loading skeleton (depth v2, T3): the page's own shape, so the
// blocks fill in place. The bar, the top row (the hero and two cards), the
// subject board beside the rail, then the table. The route's loading.tsx
// renders this.

export function MarketSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading Market" className="flex flex-col gap-[22px]">
        <PageBar title={MARKET_TITLE} meta={<Bone className="h-3 w-64" />} />
        <div className="grid grid-cols-12 gap-5">
          <div className={cn(CARD, 'col-span-12 xl:col-span-6')}>
            <Bone className="h-4 w-40" />
            <Bone className="h-6 w-4/5" />
            <Bone className="h-11 w-24" />
            <Bone className="h-[120px] w-full" />
          </div>
          {[0, 1].map((i) => (
            <div key={i} className={cn(CARD, 'col-span-12 md:col-span-6 xl:col-span-3')}>
              <Bone className="h-4 w-28" />
              <Bone className="h-5 w-3/4" />
              <Bone className="h-8 w-16" />
              <Bone className="h-[80px] w-full" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-12 items-start gap-5">
          <div className={cn(CARD, 'col-span-12 xl:col-span-8')}>
            <Bone className="h-5 w-72" />
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="grid grid-cols-1 gap-7 border-t border-track py-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
                <div className="flex flex-col gap-2.5"><Bone className="h-4 w-1/2" /><Bone className="h-6 w-1/3" /><Bone className="h-2.5 w-full" /></div>
                <BoneLines lines={3} />
              </div>
            ))}
          </div>
          <div className="col-span-12 flex flex-col gap-5 xl:col-span-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className={CARD}><Bone className="h-5 w-3/4" /><BoneLines lines={4} /></div>
            ))}
          </div>
        </div>
        <div className={CARD}><Bone className="h-5 w-64" /><BoneLines lines={6} /></div>
      </div>
    </PageFrame>
  )
}
