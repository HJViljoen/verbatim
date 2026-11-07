import { PageFrame } from '@/components/shell/page-grid'
import { Bone, BoneBars, BoneLines, SkeletonStatStrip } from '@/components/shell/skeleton'
import { CARD } from '@/components/v2'
import { cn } from '@/lib/utils'

// Voices' level pages loading (G3, 17 Oct; since the audit design, 7 Nov, in
// the boards' shape): each page's own shape, so its blocks fill in place. The
// path, the title and the figures row's bones (no tile), then a hub's lead
// tile and its parts (a group, a brand) or the evidence's lead line and videos
// beside the facts (a creator). Plain bones, no numbers. The routes'
// loading.tsx render these.

/** The audit design's title block (7 Nov), drawn as bones: the crumb row,
 *  the title, the line under it and the figures row; no tile, no label. */
function AuditBar({ label, cells }: { label: string; cells: number }) {
  return (
    <div role="presentation" className="flex flex-col">
      <span className="sr-only">{label}</span>
      <div className="pb-2 max-sm:hidden"><Bone className="h-[22px] w-56 max-w-full" /></div>
      <Bone className="h-6 w-24 sm:hidden" />
      <Bone className="mt-2.5 h-8 w-72 max-w-full" />
      <Bone className="mt-2 h-4 w-48" />
      <div className="mt-5"><SkeletonStatStrip cells={cells} /></div>
    </div>
  )
}

/** A group's page loading (Voices-Group.dc.html): the title block, who they
 *  are, the read, the subject tiles, the conversations, the numbers' three
 *  tiles and the comments' three. */
export function VoicesGroupSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the group" className="flex flex-col gap-[22px]">
        <AuditBar label="Voices" cells={4} />
        <div className={cn(CARD, 'gap-5 sm:p-[30px]')}>
          <Bone className="h-8 w-4/5" />
          <div className="grid grid-cols-1 gap-8 border-t border-track pt-5 min-[900px]:grid-cols-3">{[0, 1, 2].map((i) => <BoneLines key={i} lines={2} />)}</div>
        </div>
        <div className={cn(CARD, 'gap-6 sm:p-[30px]')}>
          <div className="grid grid-cols-1 gap-8 min-[900px]:grid-cols-3">{[0, 1, 2].map((i) => <BoneLines key={i} lines={4} />)}</div>
          <div className="grid grid-cols-1 gap-8 border-t border-track pt-6 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"><BoneBars rows={3} /><BoneLines lines={2} /></div>
        </div>
        <Bone className="mt-[26px] h-5 w-56" />
        <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className={cn(CARD, 'gap-3.5')}><Bone className="h-5 w-40" /><Bone className="h-8 w-28" /><BoneLines lines={2} /></div>)}
        </div>
        <div className={CARD}><Bone className="h-5 w-64" /><BoneLines lines={6} /></div>
        <Bone className="mt-[26px] h-5 w-40" />
        <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className={CARD}><Bone className="h-5 w-48" /><BoneBars rows={3} /></div>)}
        </div>
      </div>
    </PageFrame>
  )
}

/** A brand's page loading (Voices-Brand.dc.html): the title block, the lead,
 *  how the talk differs, who talks about it (two tiles), the numbers (two
 *  tiles, then three). */
export function VoicesBrandSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the brand" className="flex flex-col gap-[22px]">
        <AuditBar label="Voices" cells={4} />
        <div className={cn(CARD, 'gap-5 sm:p-[30px]')}>
          <Bone className="h-8 w-4/5" />
          <div className="grid grid-cols-1 gap-8 border-t border-track pt-5 min-[900px]:grid-cols-3">{[0, 1, 2].map((i) => <BoneLines key={i} lines={2} />)}</div>
        </div>
        <div className={cn(CARD, 'sm:p-[30px]')}>
          <div className="grid grid-cols-1 gap-10 min-[900px]:grid-cols-2"><BoneLines lines={5} /><BoneLines lines={5} /></div>
        </div>
        <Bone className="mt-[26px] h-5 w-56" />
        <div className="grid grid-cols-1 items-start gap-5 min-[1180px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className={CARD}><Bone className="h-5 w-56" /><BoneBars rows={5} /></div>
          <div className={CARD}><Bone className="h-5 w-48" /><BoneLines lines={5} /></div>
        </div>
        <Bone className="mt-[26px] h-5 w-40" />
        <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-2">
          <div className={CARD}><Bone className="h-5 w-64" /><BoneLines lines={4} /></div>
          <div className={CARD}><Bone className="h-5 w-56" /><BoneBars rows={4} /></div>
        </div>
      </div>
    </PageFrame>
  )
}

/** A creator's page loading (Voices-Creator.dc.html): the title block, the
 *  lead line, then their videos beside the facts and the other creators. */
export function VoicesCreatorSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the creator" className="flex flex-col gap-[22px]">
        <AuditBar label="Voices" cells={3} />
        <Bone className="h-7 w-3/4" />
        <div className="grid grid-cols-1 items-start gap-7 min-[1180px]:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            <Bone className="h-6 w-40" />
            {[0, 1, 2].map((i) => <div key={i} className={cn(CARD, 'gap-3')}><Bone className="h-5 w-3/4" /><Bone className="h-4 w-56" /><BoneLines lines={4} /></div>)}
          </div>
          <div className="flex flex-col gap-5">
            <Bone className="h-6 w-32" />
            <div className={CARD}><BoneLines lines={4} /><BoneBars rows={4} /><BoneBars rows={3} /></div>
            <div className={CARD}><Bone className="h-5 w-48" /><BoneLines lines={5} /></div>
          </div>
        </div>
      </div>
    </PageFrame>
  )
}
