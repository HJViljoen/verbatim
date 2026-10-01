import type { RenderMode } from '@/lib/blocks/types'
import { InnerLine } from './market'
import { InnerBlock, WeekBars, WeekPendingRow } from '@/components/charts/week-bars'
import { WeekLineStrip } from '@/components/charts/week-line'
import { EMAIL, FONT } from '@/lib/email/theme'
import { WEEKS_EMPTY, weekBarsBlock, weekBarsOmitted, weekVolumesEmpty } from '@/lib/pages/overview-market/weeks'
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

/** Whether Week by week draws anything: nothing gathered says so; bars with
 *  no week left one way and no same-age line draw nothing (T0a). */
export const overviewWeeksShown = (weeks: OverviewData['weeks']): boolean =>
  weeks != null && (weekVolumesEmpty(weeks) || !weekBarsOmitted(weeks) || weeks.line != null)

export function OverviewWeeks({ data, mode }: { data: OverviewData; mode: RenderMode }) {
  const raw = data.weeks
  if (!raw) return null
  const title = mode === 'email'
    ? <div style={{ fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, color: EMAIL.ink, marginTop: 16 }}>{WEEKS_TITLE}</div>
    : <p className="m-0 text-[15px] font-semibold text-foreground">{WEEKS_TITLE}</p>
  if (weekVolumesEmpty(raw)) {
    return <div className="flex flex-col gap-3">{title}<InnerLine mode={mode}>{WEEKS_EMPTY}</InnerLine></div>
  }
  // THE BARS NEVER SPAN OUR CHANGES (T0a, mechanism 3): the weeks read one
  // way since our latest search or relevance change, with no key of our
  // changes. Where no week is left, "Each week, as counts" is omitted, never
  // placeholdered; the same-age line below is its own reading and stays, on
  // the bars' axis where they are drawn.
  const bars = weekBarsBlock(raw)
  const drawn = !weekBarsOmitted(raw)
  const axis = drawn ? bars.weeks : raw.weeks
  const pending = raw.line && 'state' in raw.line ? raw.line : null
  const printed = raw.line && !('state' in raw.line) ? { ...raw.line, rows: raw.line.rows.filter((r) => r.objectKind === 'kind') } : null
  if (!drawn && !pending && !printed) return null
  return (
    <div className={mode === 'email' ? undefined : 'flex min-w-0 flex-col gap-4'}>
      {title}
      <div className={mode === 'email' ? undefined : 'flex min-w-0 flex-col gap-6'}>
        {drawn ? (
          <InnerBlock title="Each week, as counts" mode={mode}>
            <WeekBars block={bars} mode={mode} variant="front" surface="inner" />
          </InnerBlock>
        ) : null}
        {pending ? (
          <InnerBlock title="Read at the same age" tag="pending" mode={mode}>
            <WeekPendingRow weeks={axis} pending={pending} mode={mode} surface="inner" />
          </InnerBlock>
        ) : printed ? (
          <InnerBlock title="Read at the same age" mode={mode}>
            <WeekLineStrip block={printed} axis={axis.map((w) => w.week)} mode={mode} surface="inner" />
          </InnerBlock>
        ) : null}
      </div>
    </div>
  )
}
