import { PageFrame, PageBar } from '@/components/shell/page-grid'
import { Bone, BoneTable } from '@/components/shell/skeleton'

// Mirrors app/dashboard/ops/readiness/page.tsx: the bar with its subtitle and
// summary, then one pane holding the block-by-block table.
export default function OpsReadinessLoading() {
  return (
    <PageFrame>
      <span role="status" className="sr-only">Loading Readiness…</span>
      <PageBar
        title="Readiness"
        context={<Bone className="h-3 w-32" />}
        subtitle="What each block of the product needs from this workspace, what is there, and who can close the gap."
      >
        <Bone className="h-3 w-40" />
      </PageBar>
      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-tile shadow-tile">
        <div className="flex items-baseline justify-between border-b border-border/70 px-4 pt-3.5 pb-3"><Bone className="h-2.5 w-36" /><Bone className="h-2.5 w-48" /></div>
        <div className="flex flex-col gap-3 px-5 py-4">
          <Bone className="h-3.5 w-32" />
          <Bone className="h-2.5 w-2/3" />
          <BoneTable rows={13} cols={4} />
        </div>
      </section>
    </PageFrame>
  )
}
