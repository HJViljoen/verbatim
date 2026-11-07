import { PageFrame } from '@/components/shell/page-grid'
import { Bone, BoneBars, BoneLines, SkeletonStatStrip } from '@/components/shell/skeleton'
import { CARD } from '@/components/v2'
import { cn } from '@/lib/utils'

// Your products' level pages loading (G4, 17 Oct): each page's own shape, so
// its blocks fill in place. Plain bones, no numbers. The routes' loading.tsx
// render these.

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

/** A product's page loading (G4-Products-Product; since the audit design,
 *  Products-Product.dc.html): the figures row, the line, the video tiles
 *  beside the facts' tile and the siblings' table, 1.65 to 1. */
export function ProductsProductSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the product" className="flex flex-col gap-[22px]">
        <AuditBones label="Your products" cells={3} />
        <Bone className="h-7 w-3/4" />
        <div className="grid grid-cols-1 items-start gap-7 min-[1180px]:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            <Bone className="h-6 w-48" />
            {[0, 1, 2].map((i) => (
              <div key={i} className={cn(CARD, 'gap-3')}>
                <div className="flex flex-col gap-1.5"><Bone className="h-4 w-36" /><Bone className="h-3.5 w-28" /></div>
                <BoneLines lines={3} />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-5">
            <Bone className="h-6 w-28" />
            <div className={cn(CARD, 'gap-6')}>{[0, 1, 2].map((i) => <div key={i} className="flex flex-col gap-3.5"><Bone className="h-5 w-48" /><BoneLines lines={4} /></div>)}</div>
            <div className={CARD}><Bone className="h-5 w-40" /><BoneLines lines={4} /></div>
          </div>
        </div>
      </div>
    </PageFrame>
  )
}
