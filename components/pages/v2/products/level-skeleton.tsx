import { PageFrame } from '@/components/shell/page-grid'
import { Bone, BoneBars, BoneLines, SkeletonStatStrip } from '@/components/shell/skeleton'
import { CARD } from '@/components/v2'
import { cn } from '@/lib/utils'

// Your products' level pages loading (G4, 17 Oct): each page's own shape, so
// its blocks fill in place. Plain bones, no numbers. The routes' loading.tsx
// render these.

/** The bar of a level page in its old block (the product's, until T5.3):
 *  the crumb row, then the title block's tile, label, title and meta, the
 *  month switch at its right. */
function LevelBones({ label }: { label: string }) {
  return (
    <div role="presentation" className="flex flex-col">
      <span className="sr-only">{label}</span>
      <div className="pb-2 max-sm:hidden"><Bone className="h-[22px] w-64 max-w-full" /></div>
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

/** The audit design's title block as bones (7 Nov): the crumb row, the
 *  title, the line under it beside the switch, the figures row; no tile. */
function AuditBones({ label, cells }: { label: string; cells: number }) {
  return (
    <div role="presentation" className="flex flex-col">
      <span className="sr-only">{label}</span>
      <div className="pb-2 max-sm:hidden"><Bone className="h-[22px] w-64 max-w-full" /></div>
      <Bone className="h-6 w-28 sm:hidden" />
      <div className="mt-2.5 flex flex-wrap items-start justify-between gap-3.5">
        <div className="flex min-w-0 flex-col gap-2"><Bone className="h-8 w-64 max-w-full" /><Bone className="h-4 w-52" /></div>
        <Bone className="h-11 w-72 max-w-full rounded-[10px]" />
      </div>
      <div className="mt-5"><SkeletonStatStrip cells={cells} /></div>
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
        <AuditBones label="Your products" cells={4} />
        <div className={cn(CARD, 'gap-5 sm:p-[30px]')}>
          <Bone className="h-8 w-3/4" />
          <div className="grid grid-cols-1 gap-8 border-t border-track pt-5 min-[900px]:grid-cols-3">{[0, 1, 2].map((i) => <BoneLines key={i} lines={2} />)}</div>
        </div>
        <Bone className="mt-[26px] h-5 w-48" />
        <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-2">{[0, 1].map((i) => <div key={i} className={cn(CARD, 'gap-3')}><Bone className="h-5 w-3/4" /><BoneLines lines={2} /><Bone className="h-[46px] w-full" /></div>)}</div>
        <div className={CARD}><Bone className="h-5 w-48" /><BoneLines lines={8} /></div>
        <Bone className="mt-[26px] h-5 w-40" />
        <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-2">{[0, 1].map((i) => <div key={i} className={CARD}><Bone className="h-5 w-56" /><BoneLines lines={4} /></div>)}</div>
        <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className={CARD}><Bone className="h-5 w-40" /><BoneBars rows={4} /></div>)}</div>
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
