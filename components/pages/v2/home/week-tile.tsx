import Link from 'next/link'
import type { ReactNode } from 'react'
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
// "IN YOUR MARKET": the market is the category and the tracked brands, your
// own posts out. The Market tile beside it counts the category alone and says
// how its count sits inside this one, so the page shows no two bare totals.
//
// THE WEEKLY VOLUME IS TODAY'S CHART, KEPT EXACTLY (the lead's T8 brief):
// `homeWeeks`' weeks, cut and counted as AGENTS.md's "The week chart's cut and
// cadence" says, drawn by the client leaf `HomeWeeksPlot` with its numbers on
// hover, focus and a tap, laid out to the tile. The phone board draws one
// line of figures and no chart, so under 640px the tile does too.
//
// THE SUBJECTS, as Market's board reads them: the biggest ready subject, its
// level of the market's videos, and the one whose month moved most against
// last month, its change banded through its `Verdict` (`MovementBadge`, in a
// verdict node, neutral as Market draws a subject's change: a subject moving
// is neither good nor bad news). Each opens its panel on Market (`?subject=`).
//
// THE BOARD'S SHAPE IN EVERY STATE (parity pass, 13 Oct): a week with nothing
// drawn keeps its slot as a faint well, and the chart's key gives its place to
// the one quiet line saying why; both subject rows stay, a row with no
// subject saying why in its figure's place ("Not measured yet", "no
// comparison with September yet").

function Numbers({ tile }: { tile: WeekTile }) {
  const { week, month } = tile
  // Nothing read: said once. Where the chart has no week either, its frame
  // says it below, and a phone (which draws no chart) says it here.
  // (A failed weekly read says so in the chart's place, so the missing week
  // is said here at every width.)
  if (week.videos == null) return <TileLine className={weeksDrawable(tile.weeks) || tile.weeksFailed ? undefined : 'sm:hidden'}>{INSUFFICIENT}</TileLine>
  const comments = week.comments != null ? <> · <span data-copy="figure">{fmtInt(week.comments)}</span> comments</> : null
  const inMonth = month.videos != null && tile.inMonth
  return (
    <div>
      {/* The board's "241 videos", then its one muted line under it. */}
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span data-copy="figure" className="font-mono text-[40px] leading-none font-medium tracking-[-0.02em] tabular-nums text-foreground max-sm:text-[34px]">{fmtInt(week.videos)}</span>
        <span className={cn(MONO_MUTED, 'max-sm:hidden')}>videos this week</span>
        {/* The phone board's one line, the month still beside the week. */}
        <span className={cn(MONO_MUTED, 'sm:hidden')}>
          videos{comments} this week{inMonth ? <> · <span data-copy="figure">{fmtInt(month.videos!)}</span> {tile.inMonth}</> : null}
        </span>
      </div>
      {/* The week's comments, and the week beside its month (decision 1). */}
      {week.comments != null || inMonth ? (
        <p className={cn(MONO_MUTED, 'm-0 mt-2 max-sm:hidden')}>
          {week.comments != null ? <><span data-copy="figure">{fmtInt(week.comments)}</span> comments{inMonth ? ' · ' : null}</> : null}
          {inMonth ? <><span data-copy="figure">{fmtInt(month.videos!)}</span> videos{month.comments != null ? <> and <span data-copy="figure">{fmtInt(month.comments)}</span> comments</> : null} {tile.inMonth}</> : null}
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
        {/* With no week drawn, the key has nothing to name: the one quiet
            line says why in its place (a read that failed is a failure,
            never "Insufficient data", which is too few clean weeks). */}
        {drawable ? (
          <span className="flex gap-3" aria-hidden>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-brand" />Videos</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded-full bg-orange" />Comments</span>
          </span>
        ) : <span data-weeks-gap="">{tile.weeksFailed ? TILE_FAILED : INSUFFICIENT}</span>}
      </div>
      <HomeWeeksPlot
        size="sm"
        weeks={weeks}
        details={weeks.columns.map(homeWeekDetail)}
        label={drawable ? `Videos and comments in your market, week by week. ${summary.join('; ')}.` : null}
      />
    </div>
  )
}

/** The words a subjects row prints where it holds no subject (parity pass,
 *  13 Oct): the row keeps its place, and says why in the figure's. */
export const SUBJECT_GAP = {
  // Ruling U6: no "calibration" on a client surface; Market's own words.
  calibrating: { biggest: 'Not measured yet', moved: 'Not measured yet' }, // = SUBJECT_PENDING (parity/market), unify at merge
  none_named: { biggest: 'none named yet', moved: 'none named yet' },
  failed: { biggest: 'could not be read just now', moved: 'could not be read just now' },
  /** No published week yet: nothing to read the subjects against. */
  unread: { biggest: 'not read yet', moved: 'not read yet' },
} as const

/** A ready subject with no level to print. */
export const SUBJECT_NO_LEVEL = 'no level yet'
/** Ready subjects, none with a month before to compare (Sealand today). */
export const subjectNotCompared = (prev: string): string => `no comparison with ${prev} yet`
/** Compared, and none moved beyond its band. */
export const subjectNoneMoved = (prev: string): string => `none beyond its normal swing against ${prev}`

/** One of the board's two rows: its label, and what it holds or why not. */
function SubjectRow({ label, children, phone = true }: { label: string; children: ReactNode; phone?: boolean }) {
  return (
    <div className={cn('grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3', phone ? null : 'max-sm:hidden')}>
      <span className="whitespace-nowrap text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  )
}

const Gap = ({ children }: { children: ReactNode }) => <span className="text-[12.5px] text-muted-foreground">{children}</span>

function Subjects({ s }: { s: WeekSubjects | null }) {
  const pct = (k: number, n: number) => Math.round((100 * k) / n)
  // The board's two rows in every state (parity pass): a row with no subject
  // says why in its figure's place. The phone board draws "Moved most" alone.
  const gap = s?.gap ? SUBJECT_GAP[s.gap] : !s ? SUBJECT_GAP.unread : null
  return (
    <div data-subjects={s?.gap ?? (s ? 'ready' : 'unread')} className="flex flex-col gap-1.5 border-t border-track pt-3 text-[13.5px] leading-[1.4] max-sm:border-t-0 max-sm:pt-0">
      <SubjectRow label="Biggest subject" phone={false}>
        {gap ? <Gap>{gap.biggest}</Gap> : s?.biggest ? (
          <Link href={s.biggest.href} className="text-foreground no-underline underline-offset-[3px] hover:underline">
            {s.biggest.name}{' '}
            <span className="whitespace-nowrap font-mono text-[12.5px] tabular-nums text-muted-foreground">
              <span data-copy="figure">{pct(s.biggest.k, s.biggest.n)}%</span> · <span data-copy="level">{fmtInt(s.biggest.k)} of {fmtInt(s.biggest.n)}</span>
            </span>
          </Link>
        ) : <Gap>{SUBJECT_NO_LEVEL}</Gap>}
      </SubjectRow>
      <SubjectRow label="Moved most">
        {gap ? <Gap>{gap.moved}</Gap> : s?.moved ? (
          <Link href={s.moved.href} className="text-foreground no-underline underline-offset-[3px] hover:underline">
            {s.moved.name}{' '}
            <span className="whitespace-nowrap">
              <span data-copy="verdict"><MovementBadge verdict={s.moved.verdict} unit="pts" good="neutral" bandTip /></span>
              <span className="text-[12.5px] text-muted-foreground"> against {s.prevText}</span>
            </span>
          </Link>
        ) : s?.noneMoved ? <Gap>{subjectNoneMoved(s.prevText)}</Gap> : <Gap>{subjectNotCompared(s?.prevText ?? 'last month')}</Gap>}
      </SubjectRow>
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
          <Subjects s={read.top.subjects} />
        </>
      )}
    </article>
  )
}
