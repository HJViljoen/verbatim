import { SkeletonSurface, Bone, BoneLines, BoneBars } from '@/components/shell/skeleton'
import { GrowingTile } from '@/components/pages/voice-surface'

// Mirrors app/dashboard/voice/page.tsx (market-first WP2.4, WP3.8): the surface
// bar, then the six growing sections the page draws: the market in the month,
// every theme at 10 or more, a theme in full, who is talking, the market's
// words, where it talks. No row spans, because the page draws none, and no
// horizon row, because the page offers none.
export default function VoiceLoading() {
  return (
    <SkeletonSurface nav="voice" pills={1}>

      {/* C1 · the market in the month, and where it was said */}
      <GrowingTile>
        <Bone className="h-2.5 w-28" />
        <Bone className="h-7 w-3/5" />
        <BoneLines lines={3} />
      </GrowingTile>

      {/* C2 · every theme at 10 or more */}
      <GrowingTile>
        <Bone className="h-2.5 w-40" />
        <BoneBars rows={12} />
      </GrowingTile>

      {/* C3 · a theme in full, its voices */}
      <GrowingTile>
        <Bone className="h-2.5 w-24" />
        <Bone className="h-5 w-2/5" />
        <BoneLines lines={2} />
        <Bone className="h-8 w-28" />
        <BoneLines lines={4} />
      </GrowingTile>

      {/* C4 · who is talking */}
      <GrowingTile>
        <Bone className="h-2.5 w-24" />
        <BoneBars rows={5} />
      </GrowingTile>

      {/* C5 · the market's words, kind by kind */}
      <GrowingTile>
        <Bone className="h-2.5 w-32" />
        <BoneLines lines={6} />
      </GrowingTile>

      {/* C6 · where your market talks */}
      <GrowingTile>
        <Bone className="h-2.5 w-36" />
        <BoneLines lines={2} />
        <BoneBars rows={10} />
      </GrowingTile>
    </SkeletonSurface>
  )
}
