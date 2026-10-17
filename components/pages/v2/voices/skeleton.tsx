import { PageFrame } from '@/components/shell/page-grid'
import { Bone, BoneBars, BoneLines } from '@/components/shell/skeleton'
import { CARD } from '@/components/v2'
import { cn } from '@/lib/utils'

// Voices' level pages loading (G3, 17 Oct): each page's own shape, so its
// blocks fill in place. The path and the title block, then a hub's header card
// and its strip (a group, a brand) or the evidence's lead and videos beside the
// facts (a creator). Plain bones, no numbers. The routes' loading.tsx render
// these.

/** The path and the title block (Market's `LevelBar`, drawn as bones). */
function Bar({ label }: { label: string }) {
  return (
    <div role="presentation" className="flex flex-col">
      <span className="sr-only">{label}</span>
      <div className="border-b border-border pt-3 pb-[11px] max-sm:hidden sm:-mx-4 sm:-mt-[18px] sm:px-4 md:-mx-10 md:-mt-7 md:px-10"><Bone className="h-[22px] w-56 max-w-full" /></div>
      <Bone className="h-6 w-24 sm:hidden" />
      <div className="mt-2.5 flex items-center gap-3.5">
        <Bone className="size-[46px] shrink-0 rounded-[11px] max-sm:size-[38px]" />
        <div className="flex min-w-0 flex-col gap-1.5"><Bone className="h-3 w-24" /><Bone className="h-7 w-72 max-w-full" /></div>
      </div>
      <Bone className="mt-3 h-3 w-80 max-w-full" />
    </div>
  )
}

/** A hub's header card: its eyebrow, its lead and the four figures. */
function Hub() {
  return (
    <div className={cn(CARD, 'gap-5 overflow-hidden sm:px-[34px] sm:pt-[30px] sm:pb-0 max-sm:pb-0')}>
      <Bone className="h-4 w-48" />
      <Bone className="h-9 w-3/4" />
      <div className="-mx-[34px] grid grid-cols-2 gap-px border-t border-track bg-inner max-sm:-mx-[18px] min-[1180px]:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="flex flex-col gap-2 px-[22px] pt-5 pb-[22px]"><Bone className="h-8 w-16" /><Bone className="h-3 w-32" /></div>)}</div>
    </div>
  )
}

/** A group's page loading (G3-Voices-Group). */
export function VoicesGroupSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the group" className="flex flex-col gap-[22px]">
        <Bar label="Voices" />
        <Hub />
        <div className={cn(CARD, 'gap-6')}>
          <div className="grid grid-cols-1 gap-9 min-[1180px]:grid-cols-3">{[0, 1, 2].map((i) => <BoneLines key={i} lines={4} />)}</div>
          <div className="grid grid-cols-1 gap-10 border-t border-track pt-6 min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]"><BoneBars rows={3} /><BoneLines lines={3} /></div>
        </div>
        <Bone className="h-5 w-56" />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 min-[1180px]:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className={cn(CARD, 'gap-3')}><Bone className="h-6 w-6 rounded-[7px]" /><Bone className="h-5 w-40" /><Bone className="h-7 w-28" /><BoneBars rows={2} /></div>)}
        </div>
        <div className={CARD}><Bone className="h-5 w-64" /><BoneLines lines={6} /></div>
      </div>
    </PageFrame>
  )
}

/** A brand's page loading (G3-Voices-Brand). */
export function VoicesBrandSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the brand" className="flex flex-col gap-[22px]">
        <Bar label="Voices" />
        <Hub />
        <div className={cn(CARD, 'gap-6')}>
          <div className="grid grid-cols-1 gap-10 min-[1180px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"><BoneLines lines={5} /><BoneLines lines={5} /></div>
        </div>
        <Bone className="h-5 w-56" />
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className={CARD}><Bone className="h-5 w-56" /><BoneBars rows={5} /></div>
          <div className={CARD}><Bone className="h-5 w-48" /><BoneBars rows={4} /></div>
        </div>
        <div className={CARD}><Bone className="h-5 w-64" /><BoneLines lines={6} /></div>
      </div>
    </PageFrame>
  )
}

/** A creator's page loading (G3-Voices-Creator). */
export function VoicesCreatorSkeleton() {
  return (
    <PageFrame>
      <div role="status" aria-busy="true" aria-label="Loading the creator" className="flex flex-col gap-[22px]">
        <Bar label="Voices" />
        <div className="flex flex-col gap-3 border-b border-border pb-[22px]"><Bone className="h-6 w-3/4" /><Bone className="h-5 w-48" /></div>
        <div className="grid grid-cols-1 items-start gap-11 min-[1180px]:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex flex-col gap-4">
            {[0, 1, 2].map((i) => <div key={i} className={cn(CARD, 'gap-3')}><Bone className="h-5 w-3/4" /><Bone className="h-3 w-48" /><BoneLines lines={4} /></div>)}
          </div>
          <div className="flex flex-col gap-4"><BoneLines lines={4} /><BoneBars rows={4} /><BoneBars rows={3} /></div>
        </div>
      </div>
    </PageFrame>
  )
}
