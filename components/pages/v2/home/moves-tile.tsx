import Link from 'next/link'
import { MovementBadge } from '@/components/delta-badge'
import { NAV_ICON } from '@/components/nav-icons'
import { priorityLabel } from '@/components/pages/moves/words'
import { AdviceAnswers } from '@/components/pages/v2/moves/advice-actions'
import { PRIORITY_CHIP } from '@/components/pages/v2/moves/parts'
import { fmtInt } from '@/lib/format'
import type { TileRead } from '@/lib/pages/v2/home'
import { tileHref } from '@/lib/pages/home'
import { compareMonths, groundedLabel, RECORD_HREF, sharePct, streakLabel, UNTITLED_ADVICE, type TopMoves } from '@/lib/pages/v2/moves'
import { monthStartOf } from '@/lib/reading/month-key'
import { cn } from '@/lib/utils'
import { CSUB, OLINK, TILE, TILE_FAILED, TileHead, TileLine, TT } from './parts'

// THE DASHBOARD'S YOUR MOVES TILE (Design v2, T8; E1-Dashboard's third row),
// from `topMoves`: the first piece of advice waiting for a decision, which
// opens in place on Your moves (`?advice=<lineage>`), with Accept and Not for
// us for an owner or an admin (`mayDecideMoves`; the actions refuse anyone
// else anyway); and beside it the move whose market moved most since it was
// dated, its month before against the latest month read since, banded
// through its `Verdict`.
//
// No quote here: the advice's one comment is in its panel. The move's title
// is the client's own words, marked as Your moves marks them.

/** Your moves' words where nothing has been delivered yet. */
export const MOVES_FIRST_RUN = 'Your moves fill in after the first update.'
/** Where no advice is waiting for a decision. */
export const MOVES_NONE_WAITING = 'No advice is waiting for a decision.'

function Advice({ top }: { top: TopMoves }) {
  const a = top.advice
  if (!a) {
    return (
      <div className="flex flex-col gap-2">
        <TileLine>{MOVES_NONE_WAITING}</TileLine>
        <Link href={RECORD_HREF} className={cn(OLINK, 'self-start')}>See the advice record →</Link>
      </div>
    )
  }
  const chip = priorityLabel(a.priority)
  const h = a.history
  const streak = h.streak > 0 ? h.streak : h.dates.length
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {chip ? <span className={cn('whitespace-nowrap rounded-full px-2 py-1 text-[12px] font-semibold leading-none', PRIORITY_CHIP[chip])}>{chip}</span> : null}
        <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
          <span data-copy="figure">{fmtInt(top.waiting)}</span> {top.waiting === 1 ? 'piece of advice waiting' : 'pieces of advice waiting'}
        </span>
      </div>
      <h3 className={TT}>
        {a.title === UNTITLED_ADVICE ? a.title : <span data-copy="stored" data-slot="pass_d_b_recommendation">{a.title}</span>}
      </h3>
      {/* What it rests on, all time, and the updates that raised it. */}
      <p className={cn(CSUB, 'max-sm:hidden')}>
        {a.grounded && !a.grounded.pruned ? <><span data-copy="figure">{fmtInt(a.grounded.videos)}</span> {groundedLabel} · </> : null}
        <span data-copy="figure">{fmtInt(streak)}</span> {streakLabel(h)}
      </p>
      {top.canDecide ? (
        <div className="flex flex-wrap gap-2 max-sm:[&>button]:flex-1">
          <AdviceAnswers lineageId={a.lineageId} recommendationId={a.recommendationId} title={a.title} />
        </div>
      ) : null}
    </div>
  )
}

function Move({ move, reading }: { move: NonNullable<TopMoves['move']>; reading: TopMoves['reading'] }) {
  const c = move.compare
  // Decision 3: the later month carries the reading month's label where it is
  // not the current calendar month ("September, the last full month").
  const m = compareMonths(c, monthStartOf(move.day), reading)
  return (
    <Link href={move.href} className="flex min-w-0 flex-col gap-2 rounded-[10px] bg-inner px-4 py-3.5 text-foreground no-underline transition-colors hover:bg-track focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:hidden">
      <p className="m-0 text-[11.5px] leading-[1.3] font-semibold uppercase tracking-[0.06em] text-orange-text">After your move</p>
      <div className="text-[14px] font-semibold leading-[1.35]"><span data-copy="quote">{move.title}</span></div>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span data-copy="figure" className="font-mono text-[24px] leading-none font-medium tracking-[-0.02em] tabular-nums text-muted-foreground">{sharePct(c.before.k, c.before.n)}</span>
        <span aria-hidden className="font-mono text-muted-foreground">→</span>
        <span data-copy="figure" className="font-mono text-[24px] leading-none font-medium tracking-[-0.02em] tabular-nums">{sharePct(c.after.k, c.after.n)}</span>
        <span data-copy="verdict" className="text-[12.5px]"><MovementBadge verdict={c.verdict} unit="pts" good={move.direction === 'down' ? 'down' : 'up'} bandTip /></span>
      </div>
      <p className={CSUB}>
        {/* What it is on, marked as Your moves marks it: a subject is the
            client's own name for it, a theme the model's label. */}
        Share of market videos{move.label ? <> on {move.kind === 'subject' ? <span data-copy="quote">{move.label}</span> : <span data-copy="subject" data-slot="pass_b_theme">{move.label}</span>}</> : null}: <span data-copy="level">{fmtInt(c.before.k)} of {fmtInt(c.before.n)}</span> in {m.before}, against <span data-copy="level">{fmtInt(c.after.k)} of {fmtInt(c.after.n)}</span> in {m.after}
      </p>
    </Link>
  )
}

/** Where the tile's link goes: the advice's panel, else the move, else the page. */
export function movesTileHref(top: TopMoves | null): string {
  return top?.advice?.href ?? top?.move?.href ?? tileHref('moves')
}

export function MovesTileView({ read }: { read: TileRead<TopMoves | null> }) {
  const top = read.state === 'ok' ? read.top : null
  return (
    <article aria-labelledby="home-moves" data-tile="moves" className={cn(TILE, 'col-span-12 min-[1180px]:col-span-8')}>
      <TileHead icon={NAV_ICON.moves} name="Your moves" id="home-moves" href={movesTileHref(top)} />
      {read.state === 'failed' ? <TileLine>{TILE_FAILED}</TileLine> : !top ? <TileLine>{MOVES_FIRST_RUN}</TileLine> : (
        <div className={cn('grid grid-cols-1 gap-7', top.move ? 'md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]' : null)}>
          <Advice top={top} />
          {top.move ? <Move move={top.move} reading={top.reading} /> : null}
        </div>
      )}
    </article>
  )
}
