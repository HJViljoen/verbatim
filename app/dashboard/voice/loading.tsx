import { SkeletonPage, SkeletonTile, Bone, BoneLines, BoneBars } from '@/components/shell/skeleton'

// Mirrors app/dashboard/voice/page.tsx (Phase 1 WP13): the audience, platform
// and kind row (12×2) · what moved (12×4) · a theme in full (12×6) · who is
// talking (12×4). The skeleton follows the grid the page actually draws, or
// the page jumps when it lands.
//
// It reads NO gate. The old skeleton branched on `directionWordsFor('voice.
// movers')` because the tile it stood in for was registered behind that
// constant; VO2 is not — it earns its direction words from three consecutive
// months of the comment-dated series, and it is always drawn.
export default function VoiceLoading() {
  return (
    <SkeletonPage title="Voice" pills={1}>
      <SkeletonTile col={12} row={2} meta>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }, (_, i) => <Bone key={i} className="h-6 w-32 rounded-full" />)}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 6 }, (_, i) => <Bone key={i} className="h-5 w-24 rounded-full" />)}
        </div>
      </SkeletonTile>

      <SkeletonTile col={12} row={4} meta>
        <BoneBars rows={6} />
      </SkeletonTile>

      <SkeletonTile col={12} row={6} meta>
        <Bone className="h-5 w-2/5" />
        <BoneLines lines={2} />
        <Bone className="h-8 w-28" />
        <Bone className="h-20 w-full rounded-[6px]" />
        <Bone className="h-1.5 w-full rounded-full" />
        <BoneLines lines={6} />
      </SkeletonTile>

      <SkeletonTile col={12} row={4} meta>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Bone className="h-16 w-10 flex-none rounded-[6px]" />
              <div className="flex flex-1 flex-col gap-1.5"><Bone className="h-4 w-1/3" /><BoneLines lines={3} /></div>
            </div>
          ))}
        </div>
      </SkeletonTile>
    </SkeletonPage>
  )
}
