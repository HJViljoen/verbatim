import type { RenderMode } from '@/lib/blocks/types'
import { InnerLine } from './market'
import { InnerBlock, WeekBars, WeekBarsKey, WeekPendingRow } from '@/components/charts/week-bars'
import { WeekLineStrip } from '@/components/charts/week-line'
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
//
// ONCE THE LINE PRINTS (WP3.13, deploy 3w: Heinrich's word after the Mon 26
// Oct check), "Read at the same age" draws the kept weeks as rows, one per
// kind (WP3.13's six kind rows, the kinds the pending row names; a subject's
// weeks are Subjects' strip, §2.3 S6), on the bars' own week axis
// (`WeekLineStrip`), and loses its "pending" tag. Until then it is the pending
// row, as WP2.9 drew it.

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
  const printed = b.line && !('state' in b.line) ? { ...b.line, rows: b.line.rows.filter((r) => r.objectKind === 'kind') } : null
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
        ) : printed ? (
          <InnerBlock title="Read at the same age" mode={mode}>
            <WeekLineStrip block={printed} axis={b.weeks.map((w) => w.week)} mode={mode} surface="inner" />
          </InnerBlock>
        ) : null}
      </div>
    </div>
  )
}
