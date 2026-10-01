import { Bone, BoneBars, BoneLines } from '@/components/shell/skeleton'
import { ConvCard } from '@/components/pages/voice-surface/conversation'
import { ConversationTitle } from '@/components/pages/voice-surface'
import { surface } from '@/lib/nav'

// Mirrors app/dashboard/voice/page.tsx, the approved artboard (the pages
// build, 1 Oct): the title, then every conversation beside one in full and
// where the market talks, who is talking, and the market's words in pairs of
// cards. Plain bones, no numbers.
export default function VoiceLoading() {
  return (
    <div className="flex flex-col gap-[22px]">
      <span role="status" className="sr-only">Loading {surface('voice').label}…</span>
      <ConversationTitle />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]">
        <ConvCard className="gap-3 px-7 py-6">
          <Bone className="h-5 w-64" />
          <Bone className="h-3 w-80 max-w-full" />
          <BoneBars rows={14} />
        </ConvCard>
        <div className="flex min-w-0 flex-col gap-5">
          <ConvCard className="gap-[18px] px-7 py-7">
            <Bone className="h-2.5 w-36" />
            <Bone className="h-6 w-3/5" />
            <BoneLines lines={2} />
            <BoneBars rows={4} />
            <Bone className="h-10 w-56 rounded-[10px]" />
          </ConvCard>
          <ConvCard className="gap-3 px-7 py-6">
            <Bone className="h-5 w-48" />
            <BoneBars rows={5} />
          </ConvCard>
        </div>
      </div>
      <ConvCard className="gap-3 px-7 py-6">
        <Bone className="h-5 w-40" />
        <BoneLines lines={6} />
      </ConvCard>
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <ConvCard key={i} className="gap-3 px-6 py-[22px]">
            <Bone className="h-4 w-40" />
            <BoneBars rows={5} />
          </ConvCard>
        ))}
      </div>
    </div>
  )
}
