// Loading skeleton for app/dashboard/profile/page.tsx — persona switcher, figure, charts.

import { Bone, BoneLines } from '@/components/shell/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { directionWordsFor } from '@/lib/config'

export default function ProfileLoading() {
  return (
    <div className="flex min-h-full flex-col gap-5">
      <span role="status" className="sr-only">Loading…</span>
      <div className="flex flex-wrap items-center gap-1 rounded-full border border-border bg-card p-1">
        {Array.from({ length: 3 }, (_, i) => (
          <Bone key={i} className="h-9 flex-1 rounded-full" />
        ))}
      </div>

      <div className="relative mx-auto grid w-full max-w-[84rem] gap-6 lg:min-h-[calc(100dvh-10rem)] lg:grid-cols-[1fr_1.15fr_1fr] lg:gap-7">
        <div className="flex flex-col gap-6 lg:h-full lg:justify-center lg:gap-16">
          <Card className="rounded-3xl"><CardContent><BoneLines lines={5} /></CardContent></Card>
          <Card className="rounded-3xl"><CardContent><BoneLines lines={3} /></CardContent></Card>
        </div>

        <div className="flex min-h-[26rem] w-full flex-1 items-end justify-center overflow-hidden">
          <Bone className="h-[420px] w-2/3 rounded-t-full" />
        </div>

        <div className="flex flex-col gap-6 lg:h-full lg:justify-center lg:gap-16">
          <Card className="rounded-3xl"><CardContent><BoneLines lines={4} /></CardContent></Card>
          <Card className="rounded-3xl"><CardContent><BoneLines lines={4} /></CardContent></Card>
        </div>
      </div>

      {/* One bone per bottom card the page actually draws: platformMix always,
          shareOverTime only while profile.mix is on (D1). Reserving the second
          while the tile is gated off shows a grey block that resolves into
          nothing and the page jumps, which is why the Voice skeleton gates its
          own movers tile. */}
      <Bone className="h-40 w-full rounded-xl" />
      {directionWordsFor('profile.mix') && <Bone className="h-40 w-full rounded-xl" />}
    </div>
  )
}
