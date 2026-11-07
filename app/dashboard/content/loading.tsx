import { Bone, BoneBars, BoneLines, SkeletonStatStrip } from '@/components/shell/skeleton'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { CARD } from '@/components/v2'
import { surface } from '@/lib/nav'

// Mirrors components/pages/v2/content/index.tsx in the audit design's shape
// (Content.dc.html, 7 Nov): the title, the figures row's four bones, the
// ideas' heading and lead, the three post-idea cards, What works beside its
// two rail cards, then the questions table. The title is the page's own
// words, so nothing moves when the page lands. Plain bones, no tile.
export default function ContentLoading() {
  const title = surface('content').label
  return (
    <PageFrame>
      <span role="status" className="sr-only">Loading {title}…</span>
      <div className="flex shrink-0 flex-col">
        <PageBar title={title} />
        <div className="mt-5"><SkeletonStatStrip cells={4} /></div>
      </div>
      <div className="flex flex-col gap-2">
        <Bone className="h-6 w-48" />
        <BoneLines lines={2} />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={CARD}>
            <Bone className="h-5 w-3/4" />
            <Bone className="h-9 w-14" />
            <BoneLines lines={3} />
          </div>
        ))}
      </div>
      <div className="mt-[26px] grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className={CARD}><Bone className="h-6 w-1/2" /><BoneBars rows={8} /></div>
        <div className="flex flex-col gap-5">
          <div className={CARD}><Bone className="h-5 w-1/2" /><BoneLines lines={4} /></div>
          <div className={CARD}><Bone className="h-5 w-1/2" /><BoneLines lines={4} /></div>
        </div>
      </div>
      <div className={`${CARD} mt-[26px]`}><Bone className="h-6 w-1/3" /><BoneLines lines={5} /></div>
    </PageFrame>
  )
}
