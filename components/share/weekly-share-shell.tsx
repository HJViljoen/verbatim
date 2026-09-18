import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { fullDate } from '@/lib/format'
import { periodNounFor, weeklyDateLine, weeklyHeadline, weeklyRuleFor } from '@/lib/reports/weekly'
import { staleWeeklySnapshot, type WeeklySnapshotData } from '@/lib/reports/weekly-build'
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
  // Asked before anything dereferences `data.reading`, whose shape changed
  // incompatibly in block D wave 2 (`WEEKLY_SNAPSHOT_VERSION`).
  const stale = staleWeeklySnapshot(data)
  if (stale) {
    return (
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-3 px-4 py-8 md:px-6">
        <h1 className="m-0 font-serif text-[30px] font-medium leading-[1.15]">{data.title}</h1>
        <p className="m-0 text-[13.5px] leading-[1.6] text-muted-foreground">{stale}</p>
      </div>
    )
  }
  return (
    <LinkGuard appUrl={appUrl}>
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-8 px-4 py-8 md:px-6">
        <header className="flex flex-col gap-3 rounded-lg bg-tile px-6 py-7 shadow-tile md:px-10 md:py-10">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Prepared by {data.company} · with Verbatim</p>
            {/* The email's own date line — the window, and the update behind
                it — so a forwarded share link and the send it came from say the
                same thing about which days this is. */}
            <p className="font-mono text-[11px] text-muted-foreground">{weeklyDateLine(data.period, data.reading.update.previous)} · reading as at {fullDate(data.readingAt)}</p>
          </div>
          {/* The tenant is on the line above, once — never again as the first
              word of the headline (the artboard's own masthead). */}
          <h1 className="m-0 max-w-[24ch] font-serif text-[30px] font-medium leading-[1.15] [text-wrap:balance]">{weeklyHeadline(data.reading.section1.check)}</h1>
          <p className="m-0 max-w-[68ch] text-[13.5px] italic leading-[1.6] text-secondary-foreground">{weeklyRuleFor(periodNounFor(data.reading.window))}</p>
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
