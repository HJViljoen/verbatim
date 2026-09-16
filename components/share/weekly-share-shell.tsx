import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { WEEKLY_RULE } from '@/lib/reports/weekly'
import type { WeeklySnapshotData } from '@/lib/reports/weekly-build'
import { weeklyBlocksFor } from '@/components/blocks/weekly'
import { LinkGuard } from './link-guard'

// A shared weekly report (Phase 1 WP17).
//
// THE SAME BLOCKS, IN 'app' MODE. A share link is read in a browser by someone
// with no account, so it gets the screen rendering rather than the email's
// tables — and it is the same code, so the link and the email cannot disagree.
// The links inside point at the app, absolutely, because a reader of this page
// is outside it.

export function WeeklyShareShell({ data, appUrl }: { data: WeeklySnapshotData; appUrl: string }) {
  const ctx = blockContext(appUrl, EMAIL)
  return (
    <LinkGuard>
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-8 px-4 py-8 md:px-6">
        <header className="flex flex-col gap-3 rounded-lg bg-tile px-6 py-7 shadow-tile md:px-10 md:py-10">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Prepared by {data.company} · with Verbatim</p>
            <p className="font-mono text-[11px] text-muted-foreground">{data.period} · reading as at {data.readingAt.slice(0, 10)}</p>
          </div>
          <h1 className="m-0 max-w-[24ch] font-serif text-[30px] font-medium leading-[1.15] [text-wrap:balance]">{data.subject}</h1>
          <p className="m-0 max-w-[68ch] text-[13.5px] italic leading-[1.6] text-secondary-foreground">{WEEKLY_RULE}</p>
          <p className="m-0 font-mono text-[11px] text-muted-foreground">figures frozen when this was sent · quoted voices read live, so a withdrawn comment never travels</p>
        </header>
        {weeklyBlocksFor(data.keys).map((block) => (
          <section key={block.key} className="rounded-lg bg-tile px-6 py-6 shadow-tile md:px-8">
            {block.render(data.reading, 'app', ctx)}
          </section>
        ))}
      </div>
    </LinkGuard>
  )
}
