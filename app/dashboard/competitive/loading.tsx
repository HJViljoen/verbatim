import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { Bone, BoneBars, BoneLines, BoneTable } from '@/components/shell/skeleton'
import { surface } from '@/lib/nav'

// Mirrors components/pages/competitive-surface/page (the approved artboard,
// pages build 1 Oct): the title alone, then the brand list (0.62) beside a
// brand in full (1.38), where a rival's talk differs as two cards, what they
// post, and what works in your market's videos; 22px between blocks and the
// cards at 16px, as the page draws them.

function CardBones({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-3 rounded-[16px] bg-card px-[26px] py-6 shadow-tile ${className ?? ''}`}>
      <Bone className="h-5 w-56 max-w-full" />
      <Bone className="h-3 w-72 max-w-full" />
      {children}
    </div>
  )
}

export default function CompetitiveLoading() {
  return (
    <PageFrame className="gap-[22px]">
      <span role="status" className="sr-only">Loading {surface('competitive').label}…</span>
      <PageBar title={surface('competitive').label} />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,0.62fr)_minmax(0,1.38fr)]">
        <CardBones><BoneTable rows={6} cols={2} /></CardBones>
        <CardBones><BoneBars rows={7} /></CardBones>
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <CardBones><BoneLines lines={5} /></CardBones>
        <CardBones><BoneLines lines={5} /></CardBones>
      </div>
      <CardBones><BoneTable rows={5} cols={3} /></CardBones>
      <CardBones><BoneBars rows={6} /></CardBones>
    </PageFrame>
  )
}
