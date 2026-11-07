import { Bone, BoneBars, BoneLines, SkeletonStatStrip } from '@/components/shell/skeleton'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { CARD } from '@/components/v2'
import { surface } from '@/lib/nav'

// Mirrors app/dashboard/voices/page.tsx in the audit design's shape
// (Voices.dc.html, 7 Nov): the title, the figures row's five bones, who is in
// your market, the section head and the groups three to a row, then brands
// and creators, each a full-width section. Plain bones, no numbers, no tile.
export default function VoicesLoading() {
  return (
    <PageFrame>
      <span role="status" className="sr-only">Loading {surface('voices').label}…</span>
      <div className="flex shrink-0 flex-col">
        <PageBar title={surface('voices').label} />
        <div className="mt-5"><SkeletonStatStrip cells={5} /></div>
      </div>
      <div className={CARD}>
        <Bone className="h-6 w-56" />
        <BoneBars rows={5} />
      </div>
      <Bone className="mt-[26px] h-5 w-60" />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={CARD}>
            <Bone className="h-5 w-44" />
            <BoneLines lines={2} />
            <Bone className="h-8 w-24" />
            <BoneBars rows={3} />
          </div>
        ))}
      </div>
      <Bone className="mt-[26px] h-5 w-56" />
      <div className={CARD}>
        <BoneLines lines={1} />
        <BoneBars rows={3} />
      </div>
      <Bone className="mt-[26px] h-5 w-64" />
      <div className={CARD}>
        <BoneBars rows={5} />
      </div>
    </PageFrame>
  )
}
