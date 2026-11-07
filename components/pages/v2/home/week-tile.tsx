import Link from 'next/link'
import type { ReactNode } from 'react'
import { MovementBadge } from '@/components/delta-badge'
import { ROW } from '@/components/v2/look'
import { fmtInt } from '@/lib/format'
import { homeWeekDetail, INSUFFICIENT, weeksDrawable } from '@/lib/pages/home'
import { SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import type { TileRead, WeekSubjects, WeekTile } from '@/lib/pages/v2/home'
import { subjectNotCompared } from '@/lib/pages/v2/market'
import { cn } from '@/lib/utils'
import { asSentence, BIG, TILE, TILE_FAILED, TileHead, TileLine } from './parts'
import { HomeWeeksPlot } from './weeks-plot'

// "YOUR MARKET THIS WEEK", drawn to the audit design's board
// (Dashboard.dc.html, 7 Nov): the market's videos this week as the published
// read froze them, with its comments; then the subjects against last month;
// then the weekly volume. The month's figures are in the page's figures row,
// so the tile does not say them again (decision 2).
//
// "IN YOUR MARKET": the market is the category and the tracked brands, your
// own posts out. The Market tile beside it counts the category alone and says
// so in its foot.
//
// THE WEEKLY VOLUME IS TODAY'S CHART (`homeWeeks`, drawn by the client leaf
// `HomeWeeksPlot` with its numbers on hover, focus and a tap). Where nothing
// is drawn it is one sentence in the chart's place (decision 4); a read that
// failed says so. The phone draws no chart, as before.
//
// THE SUBJECTS, as Market reads them: the biggest ready subject, its videos
// and its share of the month, and the one whose month moved most against
// last month, its change banded through its `Verdict` (`MovementBadge`, in a
// verdict node, neutral as Market draws a subject's change). Each opens its
// subject's page on Market. Both rows stay in every state, a row with no
// subject saying why in its value's place.

/** The board's words where the chart has no week to draw (decision 4). */
export const WEEKS_NOT_DRAWN = 'The chart starts once there are weeks read the same way.'

function Numbers({ tile }: { tile: WeekTile }) {
  const { week } = tile
  // Nothing read: said once, here.
  if (week.videos == null) return <TileLine>{INSUFFICIENT}.</TileLine>
  return (
    <div data-week-figures="">
      <div data-copy="figure" className={BIG}>{fmtInt(week.videos)}</div>
      <div className="mt-1 text-[15px] leading-[1.45] text-secondary-foreground">
        videos{week.comments != null ? <>, with <span data-copy="figure">{fmtInt(week.comments)}</span> comments</> : null}
      </div>
    </div>
  )
}

/** One of the tile's blocks under a hairline: its label over what it holds. */
function Block({ label, children, className, ...rest }: { label: ReactNode; children: ReactNode; className?: string; [data: `data-${string}`]: string }) {
  return (
    <div {...rest} className={cn('border-t border-track pt-3.5', className)}>
      <div className="text-[13px] leading-[1.4] text-muted-foreground">{label}</div>
      <div className="mt-1 text-[14.5px] leading-[1.5]">{children}</div>
    </div>
  )
}

function Weeks({ tile }: { tile: WeekTile }) {
  const { weeks } = tile
  const drawable = weeksDrawable(weeks)
  const summary = weeks.columns
    .filter((c) => c.videos != null && c.comments != null)
    .map((c) => `${c.label}: ${fmtInt(c.videos!)} videos, ${fmtInt(c.comments!)} comments`)
  // A read that failed is a failure, never the words for too few weeks.
  if (!drawable) {
    return (
      <Block label="Week by week" data-weeks="">
        <span data-weeks-gap="">{tile.weeksFailed ? TILE_FAILED : WEEKS_NOT_DRAWN}</span>
      </Block>
    )
  }
  return (
    <Block label={(
      <span className="flex items-center justify-between gap-3">
        <span>Week by week</span>
        <span className="flex gap-3 max-sm:hidden" aria-hidden>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-brand" />Videos</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded-full bg-secondary-foreground" />Comments</span>
        </span>
      </span>
    )} data-weeks="" className="max-sm:hidden">
      <div className="mt-2">
        <HomeWeeksPlot
          size="sm"
          weeks={weeks}
          details={weeks.columns.map(homeWeekDetail)}
          label={`Videos and comments in your market, week by week. ${summary.join('; ')}.`}
        />
      </div>
    </Block>
  )
}

/** The words a subjects row prints where it holds no subject (parity pass,
 *  13 Oct): the row keeps its place, and says why in the figure's. */
export const SUBJECT_GAP = {
  // Ruling U6: no "calibration" on a client surface; Market's own words.
  // Market's and Your products' words for a subject whose check is open, the
  // one constant (`SUBJECT_NOT_MEASURED`).
  calibrating: { biggest: SUBJECT_NOT_MEASURED, moved: SUBJECT_NOT_MEASURED },
  none_named: { biggest: 'none named yet', moved: 'none named yet' },
  failed: { biggest: 'could not be read just now', moved: 'could not be read just now' },
  /** No published week yet: nothing to read the subjects against. */
  unread: { biggest: 'not read yet', moved: 'not read yet' },
} as const

/** The week tile's two row labels, and the words where none moved. "Biggest"
 *  and "most" rank a subject over every other, so while any subject is not
 *  measured yet (`pending`) the rows are named neutrally: the subject shown
 *  is measured, and nothing is said about the ones that are not (ruling U6;
 *  Your products withholds "leads" the same way). Pure. */
export function weekSubjectLabels(s: Pick<WeekSubjects, 'pending' | 'prevText'> | null): { biggest: string; moved: string; noneMoved: string } {
  const prev = s?.prevText ?? 'last month'
  return (s?.pending ?? 0) > 0
    ? { biggest: 'Measured subject', moved: 'Moved', noneMoved: `no measured subject beyond its normal swing against ${prev}` }
    : { biggest: 'Biggest subject', moved: 'Moved most', noneMoved: `none beyond its normal swing against ${prev}` }
}

/** A ready subject with no level to print. */
export const SUBJECT_NO_LEVEL = 'no level yet'
/** Ready subjects, none with a month before to compare (Sealand today):
 *  Market's words, which a subject's page prints in its change tile. */
export { subjectNotCompared }
/** Compared, and none moved beyond its band. */
export const subjectNoneMoved = (prev: string): string => weekSubjectLabels({ prevText: prev }).noneMoved

const Gap = ({ children }: { children: string }) => <span className="text-secondary-foreground">{asSentence(children)}</span>

function Subjects({ s }: { s: WeekSubjects | null }) {
  const pct = (k: number, n: number) => Math.round((100 * k) / n)
  // Both rows in every state: a row with no subject says why in its value's
  // place.
  const gap = s?.gap ? SUBJECT_GAP[s.gap] : !s ? SUBJECT_GAP.unread : null
  // Ruling U6: no rank claimed while any subject is not measured yet.
  const labels = weekSubjectLabels(s)
  return (
    <>
      <Block data-subjects={s?.gap ?? (s ? 'ready' : 'unread')} label={s?.monthText ? `${labels.biggest} in ${s.monthText}` : labels.biggest}>
        {gap ? <Gap>{gap.biggest}</Gap> : s?.biggest ? (
          <>
            <Link href={s.biggest.href} className={cn(ROW, 'text-[15px]')}>{s.biggest.name}</Link>
            {/* The month's base is the figures row's (decision 2). */}
            <div className="mt-0.5 text-[14px] text-secondary-foreground">
              <span data-copy="figure">{fmtInt(s.biggest.k)}</span> videos, <span data-copy="figure">{pct(s.biggest.k, s.biggest.n)}%</span> of {s.monthText}
            </div>
          </>
        ) : <Gap>{SUBJECT_NO_LEVEL}</Gap>}
      </Block>
      <Block data-moved="" label={labels.moved}>
        {gap ? <Gap>{gap.moved}</Gap> : s?.moved ? (
          <>
            <Link href={s.moved.href} className={cn(ROW, 'text-[15px]')}>{s.moved.name}</Link>
            <div className="mt-0.5 text-[14px] text-secondary-foreground">
              <span data-copy="verdict"><MovementBadge verdict={s.moved.verdict} unit="pts" good="neutral" bandTip /></span> against {s.prevText}
            </div>
          </>
        ) : s?.noneMoved ? <Gap>{labels.noneMoved}</Gap> : <Gap>{subjectNotCompared(s?.prevText ?? 'last month')}</Gap>}
      </Block>
    </>
  )
}

export function WeekTileView({ read }: { read: TileRead<WeekTile> }) {
  return (
    <article aria-labelledby="home-week" data-tile="week" className={cn(TILE, 'min-[1180px]:col-span-1')}>
      <TileHead label="Your market this week" id="home-week" />
      {read.state === 'failed' ? <TileLine>{TILE_FAILED}</TileLine> : (
        <>
          <Numbers tile={read.top} />
          <Subjects s={read.top.subjects} />
          <Weeks tile={read.top} />
        </>
      )}
    </article>
  )
}
