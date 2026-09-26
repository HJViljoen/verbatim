import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { longMonth } from '@/lib/format'
import { readToWords } from '@/lib/reports/monthly'
import { staleMonthlySnapshot, type MonthlySnapshotData } from '@/lib/reports/monthly-build'
import { monthlySections } from '@/components/blocks/monthly'
import { LinkGuard } from './link-guard'
import { withCurrentWords } from '@/lib/reports/legacy-words'

// A shared monthly report: "September in your market" (market-first WP2.1).
//
// THE SAME SECTIONS, IN 'app' MODE. A share link is read in a browser by
// someone with no account, so it gets the screen rendering rather than the
// email's tables, and it is the same code, so the link and the email cannot
// disagree: the front page's blocks on the month that has ended, each a tile
// that draws its own insets (as on Your market), in the email's order, with
// an absent slot absent here too. The links inside point at the app,
// absolutely, because a reader of this page is outside it.
//
// THE HEADER IS THE EMAIL'S MASTHEAD: the heading, the month and the update
// it was read to. No footnote under it (25 Sep rulings).

export function MonthlyShareShell({ data, appUrl }: { data: MonthlySnapshotData; appUrl: string }) {
  // A snapshot built before the em-dash sweep re-renders with today's words
  // (lib/reports/legacy-words.ts), the same walk the decks and emails take.
  data = withCurrentWords(data)
  const ctx = blockContext(appUrl, EMAIL)
  const stale = staleMonthlySnapshot(data)
  const sections = stale ? [] : monthlySections(data.keys, data.reading)
  const read = readToWords(data.reading?.readTo ?? null)
  return (
    <LinkGuard appUrl={appUrl}>
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6 px-4 py-8 md:px-6">
        <header className="flex flex-col gap-2 rounded-lg bg-tile px-4 py-6 shadow-tile sm:px-8 sm:py-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <p className="m-0 text-[16px] font-bold tracking-[-0.02em]"><span aria-hidden className="text-positive">{'//'}</span> Verbatim</p>
            <p className="m-0 text-[14px] font-semibold text-secondary-foreground">{data.company}</p>
          </div>
          <h1 className="m-0 mt-6 text-[24px] font-bold leading-[1.3] tracking-[-0.015em] [text-wrap:balance]">{data.title}</h1>
          <p className="m-0 text-[14px] text-secondary-foreground">
            <span className="font-semibold text-foreground">{longMonth(data.month)} {data.month.slice(0, 4)}</span>
            {read ? <span className="ml-2 font-mono text-[13px] text-muted-foreground">{read}</span> : null}
          </p>
          {stale ? <p className="m-0 mt-4 text-[15px] text-secondary-foreground">{stale}</p> : null}
        </header>
        {sections.map((block) => (
          <section key={block.key} className="min-w-0 overflow-hidden rounded-lg bg-tile shadow-tile">
            {block.render(data.reading, 'app', ctx)}
          </section>
        ))}
      </div>
    </LinkGuard>
  )
}
