import Link from 'next/link'
import type { ReactNode } from 'react'
import { MovementBadge } from '@/components/delta-badge'
import { priorityLabel } from '@/components/pages/moves/words'
import { AdviceAnswers } from '@/components/pages/v2/moves/advice-actions'
import { RaisedWords } from '@/components/pages/v2/moves/advice'
import { Label, Tag } from '@/components/v2'
import { GO, ROW } from '@/components/v2/look'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import type { TileRead } from '@/lib/pages/v2/home'
import { tileHref } from '@/lib/pages/home'
import { compareMonths, levelBase, monthLabelOn, MOVE_UNREAD, noMoveWords, pendingLine, RECORD_HREF, sharePct, UNTITLED_ADVICE, type TopMoves } from '@/lib/pages/v2/moves'
import { NO_CAUSE } from '@/lib/pages/v2/moves-levels'
import { notMeasuredLine } from '@/lib/pages/not-measured'
import { GROUNDED_BASIS } from '@/lib/reading/afterwards'
import { inlineMonth } from '@/lib/reading/month-label'
import { monthStartOf } from '@/lib/reading/month-key'
import { cn } from '@/lib/utils'
import { CSUB, MID, TILE, TILE_FAILED, TileHead, TileLine, TT } from './parts'

// THE DASHBOARD'S YOUR MOVES TILE, drawn to the audit design's board
// (Dashboard.dc.html, "Your moves", 7 Nov), from `topMoves`: the first piece
// of advice waiting for a decision as the heading, which opens its own page
// on Your moves (`/dashboard/moves/advice/<lineage>`), its priority as a tag,
// what it rests on and the updates that raised it, with Accept and Not for
// us for an owner or an admin (`mayDecideMoves`; the actions refuse anyone
// else anyway); and beside it, "After your last move": the move whose market
// moved most since it was dated, its latest month against the month before,
// banded through its `Verdict`, and Your moves' own words that the move is
// never claimed as the cause (`NO_CAUSE`). The head opens every piece of
// advice waiting ("See all 3 waiting").
//
// No quote here: the advice's comments are on its own page. The move's title
// is the client's own words, marked as Your moves marks them.

/** Your moves' words where nothing has been delivered yet. */
export const MOVES_FIRST_RUN = 'Your moves fill in after the first update.'
/** Where no advice is waiting for a decision. */
export const MOVES_NONE_WAITING = 'No advice is waiting for a decision.'

/** A priority's tag tone: high on the caution pair, medium on the pale
 *  yellow, low on the track (decision 12's tokens). */
const PRIORITY_TONE: Record<string, 'hi' | 'mid' | 'tint'> = {
  'High priority': 'hi',
  'Medium priority': 'tint',
  'Low priority': 'mid',
}

/** One of the advice's two facts (the board's `<dl>`): its term over its
 *  words. */
function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] leading-[1.4] text-muted-foreground">{term}</dt>
      <dd className="m-0 mt-1">{children}</dd>
    </div>
  )
}

function Advice({ top }: { top: TopMoves }) {
  const a = top.advice
  if (!a) {
    return (
      <div className="flex flex-col gap-2">
        <TileLine>{MOVES_NONE_WAITING}</TileLine>
        <Link href={RECORD_HREF} className={cn(GO, 'self-start')}>See the advice record</Link>
      </div>
    )
  }
  const chip = priorityLabel(a.priority)
  const h = a.history
  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      {chip ? <span className="self-start"><Tag tone={PRIORITY_TONE[chip] ?? 'mid'}>{chip}</Tag></span> : null}
      <h2 className={cn(TT, 'text-[21px]')}>
        <Link href={a.href} className={ROW}>
          {a.title === UNTITLED_ADVICE ? a.title : <span data-copy="stored" data-slot="pass_d_b_recommendation">{a.title}</span>}
        </Link>
      </h2>
      {/* What it rests on, all time, and the updates that raised it. */}
      <dl className="m-0 grid grid-cols-2 gap-4 text-[14.5px] leading-[1.5]">
        {a.grounded && !a.grounded.pruned ? <Fact term="Rests on"><span data-copy="figure">{fmtInt(a.grounded.videos)}</span> videos, {GROUNDED_BASIS}</Fact> : null}
        <Fact term="Raised in"><RaisedWords history={h} /></Fact>
      </dl>
      {top.canDecide ? (
        <div className="mt-0.5 flex flex-wrap gap-2.5 max-sm:[&>button]:flex-1">
          <AdviceAnswers lineageId={a.lineageId} recommendationId={a.recommendationId} title={a.title} />
        </div>
      ) : null}
    </div>
  )
}

/** The move's column (the board's "After your last move"): its label, its
 *  title opening its page, the day it was dated, then what the tile has to
 *  say of it. Beside the advice from 768px, under it below. */
function MovePanel({ move, children, ...rest }: { move: { title: string; href: string; day: string } | null; children: ReactNode; [data: `data-${string}`]: string }) {
  return (
    <div {...rest} className="flex min-w-0 flex-col gap-2.5 border-track max-md:border-t max-md:pt-4 md:border-l md:pl-7">
      <Label>{MOVES_AFTER}</Label>
      {move ? (
        <>
          <Link href={move.href} className={cn(ROW, 'text-[16px] leading-[1.4]')}><span data-copy="quote">{move.title}</span></Link>
          <span className="text-[14px] leading-[1.4] text-muted-foreground">Dated {shortDate(move.day)}</span>
        </>
      ) : null}
      {children}
    </div>
  )
}

/** The words of the move's column. */
export const MOVES_AFTER = 'After your last move'

function Move({ move, reading }: { move: NonNullable<TopMoves['move']>; reading: TopMoves['reading'] }) {
  const c = move.compare
  // Decision 3: the later month carries the reading month's label where it is
  // not the current calendar month ("September, the last full month").
  const m = compareMonths(c, monthStartOf(move.day), reading)
  return (
    <MovePanel move={move} data-move="compared">
      {/* The latest month's share, its change beside it as a verdict. */}
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span data-copy="figure" className={MID}>{sharePct(c.after.k, c.after.n)}</span>
        <span data-copy="verdict" className="text-[13px]"><MovementBadge verdict={c.verdict} unit="pts" good={move.direction === 'down' ? 'down' : 'up'} bandTip /></span>
      </div>
      <p className={cn(CSUB, 'text-[14px] text-secondary-foreground')}>
        {/* What it is on, marked as Your moves marks it: a subject is the
            client's own name for it, a theme the model's label. Its bases
            stay: the move's months are not the figures row's (decision 2). */}
        Share of {levelBase(move.kind)}{move.label ? <> on {move.kind === 'subject' ? <span data-copy="quote">{move.label}</span> : <span data-copy="subject" data-slot="pass_b_theme">{move.label}</span>}</> : null}: <span data-copy="level">{fmtInt(c.before.k)} of {fmtInt(c.before.n)}</span> in {m.before}, against <span data-copy="level">{fmtInt(c.after.k)} of {fmtInt(c.after.n)}</span> in {m.after}. {NO_CAUSE}
      </p>
    </MovePanel>
  )
}

/** The panel's words where there is no move yet (parity pass, 13 Oct: the
 *  board's "After your move" panel stays), in Your moves' own words
 *  (`noMoveWords`): the reader who may date one is invited to, as the page
 *  invites them; a member is told only that none is dated. */
export const MOVES_NO_MOVE = noMoveWords(true)
export const MOVES_NO_MOVE_MEMBER = noMoveWords(false)


/** What a move is on, marked as Your moves marks it. */
function OnWhat({ move }: { move: NonNullable<TopMoves['newest']> }) {
  if (!move.label) return null
  return <> on {move.kind === 'subject' ? <span data-copy="quote">{move.label}</span> : <span data-copy="subject" data-slot="pass_b_theme">{move.label}</span>}</>
}

/** The newest move where none has a comparison to print, by Your moves' own
 *  branches (`MoveSentence`): no line can be drawn (its reason); its own
 *  month not read yet (the latest month before it, and the after side left
 *  open); or the latest month read, alone, never beside an earlier one. */
function Newest({ move, reading }: { move: NonNullable<TopMoves['newest']>; reading: TopMoves['reading'] }) {
  const p = move.point
  let figures: ReactNode = null
  let sentence: ReactNode = null
  if (move.unread) {
    // A subject whose check has not passed (open or failed): the tile's title
    // does not name it, so the one short line does ("Not measured yet: Fit &
    // comfort"); why a failed one shows no figure is Your moves' to say, once
    // (the fresh check, 14 Oct). Any other reason keeps Your moves' words.
    const named = move.kind === 'subject' && (move.unread === 'not_ready' || move.unread === 'not_measured') && move.label
      ? notMeasuredLine([{ label: move.label }])
      : null
    sentence = named ?? MOVE_UNREAD[move.unread]
  } else if (move.pending) {
    // The month before, as the figure; the after side is said in words, not
    // drawn as an open slot (decision 4).
    if (p) figures = <span data-copy="figure" className={cn(MID, 'mt-1.5 text-secondary-foreground')}>{sharePct(p.k, p.n)}</span>
    sentence = (
      <>
        {p ? <>Share of {levelBase(move.kind)}<OnWhat move={move} />: <span data-copy="level">{fmtInt(p.k)} of {fmtInt(p.n)}</span> in {longMonth(p.month)}, before the move.{' '}</> : null}
        {pendingLine(move.pending)}
      </>
    )
  } else if (p) {
    figures = <span data-copy="figure" className={cn(MID, 'mt-1.5')}>{sharePct(p.k, p.n)}</span>
    sentence = <>Share of {levelBase(move.kind)}<OnWhat move={move} />: <span data-copy="level">{fmtInt(p.k)} of {fmtInt(p.n)}</span> in {inlineMonth(`${longMonth(p.month)}${p.soFar ? ' so far' : ''}`, monthLabelOn(p.month, reading))}.</>
  }
  return (
    <MovePanel move={move} data-move="newest">
      {figures}
      {sentence ? <p className={cn(CSUB, 'text-[14px] text-secondary-foreground')}>{sentence}</p> : null}
    </MovePanel>
  )
}



/** The tile's head link: every piece of advice waiting (the advice
 *  record, `RECORD_HREF`), where some is; else Your moves. The advice and
 *  the move are links of their own. */
export function movesTileOpen(top: TopMoves | null): { href: string; words: string } {
  return top?.advice && top.waiting > 0
    ? { href: RECORD_HREF, words: `See all ${fmtInt(top.waiting)} waiting` }
    : { href: tileHref('moves'), words: 'Open Your moves' }
}

export function MovesTileView({ read }: { read: TileRead<TopMoves | null> }) {
  const top = read.state === 'ok' ? read.top : null
  return (
    <article aria-labelledby="home-moves" data-tile="moves" className={cn(TILE, 'min-[1180px]:col-span-2')}>
      <TileHead label="Your moves" id="home-moves" open={movesTileOpen(top)} />
      {read.state === 'failed' ? <TileLine>{TILE_FAILED}</TileLine> : (
        // The board's two columns in every state (parity pass): the advice,
        // and "After your last move" beside it, on the move whose market
        // moved, else the newest move with its after side still to read,
        // else none yet.
        <div className="grid grid-cols-1 gap-7 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {top ? <Advice top={top} /> : <TileLine>{MOVES_FIRST_RUN}</TileLine>}
          {top?.move ? <Move move={top.move} reading={top.reading} />
            : top?.newest ? <Newest move={top.newest} reading={top.reading} />
              : (
                <MovePanel move={null} data-move="none">
                  <p className={cn(CSUB, 'text-[14px] text-secondary-foreground')}>{noMoveWords(top?.invite === true)}</p>
                </MovePanel>
              )}
        </div>
      )}
    </article>
  )
}
