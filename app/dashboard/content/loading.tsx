import { Bone, BoneLines } from '@/components/shell/skeleton'
import { surface } from '@/lib/nav'

// Mirrors components/pages/v2/content/page.tsx (boards E5-Content): the title,
// the three post-idea cards, What works beside its two rail cards, then the
// questions table. The title is the page's own words, so nothing moves when
// the page lands.
const CARD = 'flex flex-col gap-4 rounded-[16px] bg-card px-[26px] py-6 shadow-card'

export default function ContentLoading() {
  const title = surface('content').label
  return (
    <div className="flex flex-col gap-[22px]" aria-busy="true">
      <span role="status" className="sr-only">Loading {title}…</span>
      <h1 className="m-0 text-[26px] leading-10 font-bold">{title}</h1>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={CARD}>
            <Bone className="h-5 w-3/4" />
            <Bone className="h-8 w-16" />
            <BoneLines lines={3} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className={`${CARD} xl:col-span-8`}><Bone className="h-5 w-1/2" /><BoneLines lines={8} /></div>
        <div className="flex flex-col gap-5 xl:col-span-4">
          <div className={CARD}><Bone className="h-5 w-1/2" /><BoneLines lines={3} /></div>
          <div className={CARD}><Bone className="h-5 w-1/2" /><BoneLines lines={3} /></div>
        </div>
      </div>
      <div className={CARD}><Bone className="h-5 w-1/3" /><BoneLines lines={5} /></div>
    </div>
  )
}
