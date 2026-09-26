import type { RenderMode } from '@/lib/blocks/types'
import { InnerLine } from './market'
import { InnerBlock, WeekBars, WeekBarsKey, WeekPendingRow } from '@/components/charts/week-bars'
import { EMAIL, FONT } from '@/lib/email/theme'
import { WEEKS_EMPTY, weekVolumesEmpty } from '@/lib/pages/overview-market/weeks'
import type { OverviewData } from '@/lib/pages/overview'

// Week by week on the front page (market-first decision M, part 1; WP2.9):
// rendered INSIDE "With this update" (`overview.arrivals`), under its came-in
// and heard-for-the-first-time lines, with "Week by week" as an inner title
// and no block or key of its own (25 Sep rulings). Two flat inner blocks, as
// the approved preview draws them (WeeklyLine.dc.html): "Each week, as
// counts", the bars and their key; then "Read at the same age", pending,
// which a tenant with no WEEK_LINE entry (Össur) does not get.

export const WEEKS_TITLE = 'Week by week'

/** Where the block's method is: Settings › How to read, its "Week by week". */
export const WEEK_BY_WEEK_HREF = '/dashboard/settings/how-to-read#week-by-week'

export function OverviewWeeks({ data, mode }: { data: OverviewData; mode: RenderMode }) {
  const b = data.weeks
  if (!b) return null
  const title = mode === 'email'
    ? <div style={{ fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, color: EMAIL.ink, marginTop: 16 }}>{WEEKS_TITLE}</div>
    : <p className="m-0 text-[15px] font-semibold text-foreground">{WEEKS_TITLE}</p>
  if (weekVolumesEmpty(b)) {
    return <div className="flex flex-col gap-3">{title}<InnerLine mode={mode}>{WEEKS_EMPTY}</InnerLine></div>
  }
  const pending = b.line && 'state' in b.line ? b.line : null
  return (
    <div className={mode === 'email' ? undefined : 'flex min-w-0 flex-col gap-4'}>
      {title}
      <div className={mode === 'email' ? undefined : 'flex min-w-0 flex-col gap-6'}>
        <InnerBlock title="Each week, as counts" mode={mode}>
          <WeekBars block={b} mode={mode} variant="front" surface="inner" />
          <WeekBarsKey block={b} mode={mode} />
        </InnerBlock>
        {pending ? (
          <InnerBlock title="Read at the same age" tag="pending" mode={mode}>
            <WeekPendingRow weeks={b.weeks} pending={pending} mode={mode} surface="inner" />
          </InnerBlock>
        ) : null}
      </div>
    </div>
  )
}
