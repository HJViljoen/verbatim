import { PageFrame } from '@/components/shell/page-grid'
import { Bone, BoneLines } from '@/components/shell/skeleton'
import { CARD } from '@/components/v2'
import { cn } from '@/lib/utils'

// Your products' level pages loading (G4, 17 Oct): each page's own shape, so
// its blocks fill in place. Plain bones, no numbers. The routes' loading.tsx
// render these.

/** The bar of a level page: the crumb row with its hairline, then the title
 *  block's tile, label, title and meta, the month switch at its right. */
function LevelBones({ label }: { label: string }) {
  return (
    <div role="presentation" className="flex flex-col">
      <span className="sr-only">{label}</span>
      <div className="border-b border-border pt-3 pb-[11px] max-sm:hidden sm:-mx-4 sm:-mt-[18px] sm:px-4 md:-mx-10 md:-mt-7 md:px-10"><Bone className="h-[22px] w-64 max-w-full" /></div>
      <Bone className="h-6 w-28 sm:hidden" />
      <div className="mt-2.5 flex flex-wrap items-end justify-between gap-3.5">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-3.5">
            <Bone className="size-[46px] shrink-0 rounded-[11px] max-sm:size-[38px]" />
            <div className="flex min-w-0 flex-col gap-1.5"><Bone className="h-3 w-24" /><Bone className="h-7 w-64 max-w-full" /></div>
          </div>
          <Bone className="h-3 w-80 max-w-full" />
        </div>
        <Bone className="h-9 w-72 max-w-full rounded-[10px]" />
      </div>
    </div>
  )
}

/** A category's page loading (G4-Products-Category): the header card and its
 *  four figures, the products as cards and a list, the couldn't-tell-which
 *  list, the numbers. */
export function ProductsCategorySkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the category" className="flex flex-col gap-[22px]">
        <LevelBones label="Your products" />
        <div className={cn(CARD, 'gap-5 overflow-hidden sm:px-[34px] sm:pt-[30px] sm:pb-0 max-sm:pb-0')}>
          <Bone className="h-4 w-40" />
          <Bone className="h-9 w-3/4" />
          <div className="-mx-[34px] grid grid-cols-2 gap-px border-t border-track bg-inner max-sm:-mx-[18px] min-[1180px]:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="flex flex-col gap-2 px-[22px] pt-5 pb-[22px]"><Bone className="h-8 w-16" /><Bone className="h-3 w-32" /></div>)}</div>
        </div>
        <Bone className="h-5 w-48" />
        <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className={cn(CARD, 'gap-3')}><Bone className="size-[26px] rounded-[7px]" /><Bone className="h-5 w-3/4" /><BoneLines lines={2} /><Bone className="h-[46px] w-full" /></div>)}</div>
        <div className={CARD}><Bone className="h-5 w-48" /><BoneLines lines={8} /></div>
        <div className={CARD}><Bone className="h-5 w-72" /><BoneLines lines={4} /></div>
        <Bone className="h-5 w-40" />
        <div className={cn(CARD, 'gap-6')}>
          <div className="grid grid-cols-1 gap-10 xl:grid-cols-2"><Bone className="h-[150px] w-full" /><BoneLines lines={6} /></div>
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">{[0, 1, 2].map((i) => <BoneLines key={i} lines={4} />)}</div>
        </div>
      </div>
    </PageFrame>
  )
}

/** A product's page loading (G4-Products-Product): the line and its
 *  hairline, the video cards beside the facts, the siblings. */
export function ProductsProductSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the product" className="flex flex-col gap-[22px]">
        <LevelBones label="Your products" />
        <div className="flex flex-col gap-3 border-b border-border pb-[22px]"><Bone className="h-6 w-3/4" /></div>
        <div className="grid grid-cols-1 items-start gap-11 min-[1180px]:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex flex-col gap-4">
            <Bone className="h-5 w-48" />
            {[0, 1, 2].map((i) => (
              <div key={i} className={cn(CARD, 'gap-3')}>
                <div className="flex items-center gap-3"><Bone className="size-9 rounded-[9px]" /><div className="flex flex-col gap-1.5"><Bone className="h-3.5 w-36" /><Bone className="h-3 w-28" /></div></div>
                <Bone className="h-4 w-4/5" />
                <Bone className="h-[120px] w-full rounded-[10px]" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-4"><Bone className="h-4 w-24" /><Bone className="h-[86px] w-full" /><BoneLines lines={8} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3 min-[1180px]:grid-cols-4">{[0, 1, 2, 3].map((i) => <Bone key={i} className="h-[62px] w-full rounded-[12px]" />)}</div>
      </div>
    </PageFrame>
  )
}
