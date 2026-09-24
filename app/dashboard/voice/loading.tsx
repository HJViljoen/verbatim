import { PageFrame } from '@/components/shell/page-grid'
import { SkeletonPageBar, Bone, BoneLines, BoneBars } from '@/components/shell/skeleton'
import { GrowingTile } from '@/components/pages/voice-surface'

// Mirrors app/dashboard/voice/page.tsx (Phase 1 WP13): the audience and where
// it was said · what moved · a theme in full · who is talking.
//
// FOUR GROWING SECTIONS AND NO ROW SPANS, because that is what the page draws.
// The first cut of this file was four SkeletonTiles at spans 2/4/6/4 under the
// comment "the skeleton follows the grid the page actually draws" — true when
// it was written and false by the end of the same commit, because the page
// abandoned the fixed grid the moment a bounded tile was found CUTTING VO3's
// evidence, and VO3 alone renders taller than a six-row tile's 696px. A
// skeleton drawing a grid the page no longer draws is the layout shift it
// exists to prevent, wearing a comment that says it isn't.
//
// It reads NO gate. The old skeleton branched on `directionWordsFor('voice.
// movers')` because the tile it stood in for was registered behind that
// constant; VO2 is not — it earns its direction words from three consecutive
// months of the comment-dated series, and it is always drawn.
export default function VoiceLoading() {
  return (
    <PageFrame>
      <span role="status" className="sr-only">Loading Voice…</span>
      <SkeletonPageBar title="Voice" pills={1} />

      {/* VO1 · the audience switch, then the platform mix */}
      <GrowingTile>
        <Bone className="h-2.5 w-28" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }, (_, i) => <Bone key={i} className="h-6 w-32 rounded-full" />)}
        </div>
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: 4 }, (_, i) => <Bone key={i} className="h-4 w-24" />)}
        </div>
        <BoneLines lines={2} />
      </GrowingTile>

      {/* VO2 · the arms of the one axis */}
      <GrowingTile>
        <Bone className="h-2.5 w-24" />
        <BoneBars rows={6} />
      </GrowingTile>

      {/* VO3 · the theme, its month line, its voices */}
      <GrowingTile>
        <Bone className="h-2.5 w-24" />
        <Bone className="h-5 w-2/5" />
        <BoneLines lines={2} />
        <Bone className="h-8 w-28" />
        <Bone className="h-[150px] w-full rounded-[6px]" />
        <Bone className="h-1.5 w-full rounded-full" />
        <BoneLines lines={6} />
      </GrowingTile>

      {/* VO4 · the cast */}
      <GrowingTile>
        <Bone className="h-2.5 w-24" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Bone className="h-16 w-10 flex-none rounded-[6px]" />
              <div className="flex flex-1 flex-col gap-1.5"><Bone className="h-4 w-1/3" /><BoneLines lines={3} /></div>
            </div>
          ))}
        </div>
      </GrowingTile>
    </PageFrame>
  )
}
