import { PageFrame, PageBar } from '@/components/shell/page-grid'
import { Bone, BoneLines } from '@/components/shell/skeleton'

// Mirrors app/dashboard/studio/page.tsx: the bar (its title and context line
// are static, so they are the real words) with "New report", then a 280px list
// pane beside the detail pane, at the page's own fixed height from md.
export default function StudioLoading() {
  return (
    <PageFrame className="min-h-0 flex-1">
      <span role="status" className="sr-only">Loading Studio…</span>
      <PageBar title="Studio" context="your reports, and who gets them">
        <Bone className="h-[26px] w-24 rounded-full" />
      </PageBar>
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:h-[calc(100dvh_-_6.75rem)] md:flex-row">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-tile shadow-tile md:w-[280px] md:shrink-0">
          <div className="flex items-baseline justify-between border-b border-border/70 px-4 pt-3.5 pb-3"><Bone className="h-2.5 w-16" /><Bone className="size-6 rounded-full" /></div>
          <div className="flex flex-col gap-1 p-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex flex-col gap-1.5 px-3 py-2"><Bone className="h-3.5 w-[85%]" /><Bone className="h-2.5 w-3/5" /></div>
            ))}
          </div>
        </section>
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-tile shadow-tile">
          <div className="flex flex-col gap-2 border-b border-border/70 px-5 pt-4 pb-3.5"><Bone className="h-2.5 w-40" /><Bone className="h-5 w-3/5" /></div>
          <div className="flex flex-col gap-2 px-5 py-3.5">
            <div className="flex gap-2">{Array.from({ length: 3 }, (_, i) => <Bone key={i} className="h-8 w-20 rounded-full" />)}</div>
          </div>
          <div className="flex flex-col gap-2 px-5 py-3.5"><Bone className="h-2.5 w-16" /><BoneLines lines={4} /></div>
          <div className="flex flex-col gap-2 px-5 py-3.5"><Bone className="h-2.5 w-16" />{Array.from({ length: 3 }, (_, i) => <Bone key={i} className="h-9 w-full" />)}</div>
        </section>
      </div>
    </PageFrame>
  )
}
