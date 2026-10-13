import Link from 'next/link'
import { MovementBadge } from '@/components/delta-badge'
import { fmtInt } from '@/lib/format'
import { homeWeekDetail, INSUFFICIENT, weeksDrawable } from '@/lib/pages/home'
import type { TileRead, WeekSubjects, WeekTile } from '@/lib/pages/v2/home'
import { cn } from '@/lib/utils'
import { MONO_MUTED, TILE, TILE_FAILED, TileHead, TileLine } from './parts'
import { HomeWeeksPlot } from './weeks-plot'

// "YOUR MARKET THIS WEEK" (Design v2, T8; E1-Dashboard's second card): the
// market's videos and comments this week as the published read froze them,
// the month beside them (decision 1: the board's "a usual week is about 216
// videos" goes), the weekly volume, and the subjects against last month.
//
// THE WEEKLY VOLUME IS TODAY'S CHART, KEPT EXACTLY (the lead's T8 brief):
// `homeWeeks`' weeks, cut and counted as AGENTS.md's "The week chart's cut and
// cadence" says, drawn by the client leaf `HomeWeeksPlot` with its numbers on
// hover, focus and a tap, laid out to the tile. The board's phone drawing has
// no chart, so it is left out under 640px.
//
// THE SUBJECTS, as Market's board reads them: the biggest ready subject, its
// level of the market's videos, and the one whose month moved most against
// last month, its change banded through its `Verdict` (`MovementBadge`, in a
// verdict node). Each opens its panel on Market (`?subject=`).

function Numbers({ tile }: { tile: WeekTile }) {
  const { week, month } = tile
  if (week.videos == null) return <TileLine>{INSUFFICIENT}</TileLine>
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span data-copy="figure" className="font-mono text-[40px] leading-none font-medium tracking-[-0.02em] tabular-nums text-foreground max-sm:text-[34px]">{fmtInt(week.videos)}</span>
        <span className={MONO_MUTED}>videos this week{week.comments != null ? <> · <span data-copy="figure">{fmtInt(week.comments)}</span> comments</> : null}</span>
      </div>
      {/* The week beside its month (decision 1). */}
      {month.videos != null && tile.inMonth ? (
        <p className={cn(MONO_MUTED, 'm-0 mt-1.5')}>
          <span data-copy="figure">{fmtInt(month.videos)}</span> videos{month.comments != null ? <> and <span data-copy="figure">{fmtInt(month.comments)}</span> comments</> : null} {tile.inMonth}
        </p>
      ) : null}
    </div>
  )
}

function Weeks({ tile }: { tile: WeekTile }) {
  const { weeks } = tile
  const drawable = weeksDrawable(weeks)
  const summary = weeks.columns
    .filter((c) => c.videos != null && c.comments != null)
    .map((c) => `${c.label}: ${fmtInt(c.videos!)} videos, ${fmtInt(c.comments!)} comments`)
  return (
    <div className="flex flex-col gap-2 max-sm:hidden" data-weeks="">
      <div className="flex items-center justify-between gap-3 text-[12px] text-muted-foreground">
        <span>Week by week</span>
        <span className="flex gap-3" aria-hidden>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-brand" />Videos</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded-full bg-orange" />Comments</span>
        </span>
      </div>
      <HomeWeeksPlot
        size="sm"
        weeks={weeks}
        details={weeks.columns.map(homeWeekDetail)}
        label={drawable ? `Videos and comments in your market, week by week. ${summary.join('; ')}.` : null}
      />
      {drawable ? null : <p className="m-0 text-[12px] text-muted-foreground">{INSUFFICIENT}</p>}
    </div>
  )
}

function Subjects({ s }: { s: WeekSubjects }) {
  const pct = (k: number, n: number) => Math.round((100 * k) / n)
  return (
    <div className="flex flex-col gap-1.5 border-t border-track pt-3 text-[13.5px] leading-[1.4]">
      {s.biggest ? (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3 max-sm:hidden">
          <span className="whitespace-nowrap text-muted-foreground">Biggest subject</span>
          <Link href={s.biggest.href} scroll={false} className="min-w-0 text-right text-foreground no-underline underline-offset-[3px] hover:underline">
            {s.biggest.name}{' '}
            <span className="whitespace-nowrap font-mono text-[12.5px] tabular-nums text-muted-foreground">
              <span data-copy="figure">{pct(s.biggest.k, s.biggest.n)}%</span> · <span data-copy="level">{fmtInt(s.biggest.k)} of {fmtInt(s.biggest.n)}</span>
            </span>
          </Link>
        </div>
      ) : null}
      {s.moved ? (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3">
          <span className="whitespace-nowrap text-muted-foreground">Moved most</span>
          <Link href={s.moved.href} scroll={false} className="min-w-0 text-right text-foreground no-underline underline-offset-[3px] hover:underline">
            {s.moved.name}{' '}
            <span data-copy="verdict" className="whitespace-nowrap"><MovementBadge verdict={s.moved.verdict} unit="pts" bandTip /></span>
            <span className="whitespace-nowrap text-[12.5px] text-muted-foreground"> on {s.prevText}</span>
          </Link>
        </div>
      ) : s.noneMoved ? (
        <div className="text-muted-foreground">No subject moved beyond its normal swing against {s.prevText}.</div>
      ) : null}
    </div>
  )
}

export function WeekTileView({ read }: { read: TileRead<WeekTile> }) {
  return (
    <article aria-labelledby="home-week" data-tile="week" className={cn(TILE, 'col-span-12 min-[1180px]:col-span-4')}>
      <TileHead icon={null} name="Your market this week" id="home-week" href={null} />
      {read.state === 'failed' ? <TileLine>{TILE_FAILED}</TileLine> : (
        <>
          <Numbers tile={read.top} />
          <Weeks tile={read.top} />
          {read.top.subjects ? <Subjects s={read.top.subjects} /> : null}
        </>
      )}
    </article>
  )
}
