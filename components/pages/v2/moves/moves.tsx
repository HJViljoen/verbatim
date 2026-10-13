import Link from 'next/link'

import { CARD } from '@/components/v2'
import { MovementBadge } from '@/components/delta-badge'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { monthStartOf } from '@/lib/reading/month-key'
import { inlineMonth } from '@/lib/reading/month-label'
import {
  MOVES_SUB, MOVES_TITLE, MOVE_STATUS_LABEL, MOVE_UNREAD,
  compareMonths, comparePrintable, moveAnchor, monthLabelOn, pendingLine, pointMonth, sharePct,
  type MoveCard, type MovePoint, type MovesPageData, type ReadingLabel,
} from '@/lib/pages/v2/moves'
import { cn } from '@/lib/utils'
import { MoveStatusControl } from './move-status'
import { MONO, OLINK, SECTION_SUB, SECTION_TITLE } from './parts'

// "Your moves, and what happened after" (board E6-Moves).
//
// EACH MOVE, ITS STATUS AND ITS MARKET. The title is the client's own words;
// the line is the market's share of videos on what the move is about, from
// two months before it to the reading month, only across months read the same
// way (`joinedRun`), the move's day marked; a month still under way is hollow
// and says "so far". One sentence under it: the month before the move against
// the latest month read since, with the band's answer in a verdict node, or
// the latest level alone where the month-pair judge refuses the pair. Never a
// cause: the section says so once, in the board's words.
//
// The status control (`setMoveStatusAction`) is drawn for an owner or an
// admin only.

const W = 480
const H = 140
const BASE = 110
const TOP = 26

/** The line's geometry, pure: an x per month slot, a y per share. */
export function lineGeometry(points: readonly MovePoint[], moveDay: string): {
  xs: number[]
  ys: number[]
  moveX: number | null
} {
  const n = points.length
  const step = n > 1 ? (W - 90) / (n - 1) : 0
  const xs = points.map((_, i) => (n > 1 ? 45 + i * step : W / 2))
  const shares = points.map((p) => (p.n > 0 ? p.k / p.n : 0))
  const max = Math.max(...shares, 0.0001) * 1.15
  const ys = shares.map((s) => BASE - (s / max) * (BASE - TOP))
  // THE MOVE'S MONTH, AT ITS FRONT EDGE: the dashed line stands where the
  // month the move was made in begins on the line (half a slot before its
  // point), so it reads "from here on" without claiming a day inside a month
  // the line reads as one point. Its first month, the line's own left edge.
  const moveMonth = monthStartOf(moveDay)
  const at = points.findIndex((p) => p.month === moveMonth)
  const moveX = at < 0 ? null : Math.max(8, xs[at] - (n > 1 ? step / 2 : 40))
  return { xs, ys, moveX }
}

function MoveLine({ card }: { card: MoveCard }) {
  const { points } = card
  // ONE MONTH IS A LEVEL, NOT A LINE: the sentence under it says it.
  if (points.length < 2) return null
  const { xs, ys, moveX } = lineGeometry(points, card.day)
  const solid = points.map((p, i) => ({ p, i })).filter(({ p }) => !p.soFar)
  const last = points.length - 1
  const words = points.map((p) => `${pointMonth(p)} ${sharePct(p.k, p.n)}`).join(', ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${card.label ?? 'It'} as a share of the market's videos: ${words}. The move was dated ${shortDate(card.day)}.`} className="block overflow-visible">
      <line x1={0} y1={BASE} x2={W} y2={BASE} className="stroke-border" />
      {moveX != null ? (
        <>
          <line x1={moveX} y1={14} x2={moveX} y2={BASE} className="stroke-orange-text" strokeWidth={1.5} strokeDasharray="3 3" />
          <text x={moveX > W - 80 ? moveX - 7 : moveX + 7} y={22} textAnchor={moveX > W - 80 ? 'end' : 'start'} className="fill-orange-text font-sans text-[11px] font-semibold">your move</text>
        </>
      ) : null}
      {solid.length > 1 ? (
        <polyline points={solid.map(({ i }) => `${xs[i].toFixed(1)},${ys[i].toFixed(1)}`).join(' ')} fill="none" className="stroke-foreground" strokeWidth={2} strokeLinejoin="round" />
      ) : null}
      {points[last].soFar && last > 0 ? (
        <line x1={xs[last - 1]} y1={ys[last - 1]} x2={xs[last]} y2={ys[last]} className="stroke-foreground" strokeWidth={2} strokeDasharray="4 3" />
      ) : null}
      {points.map((p, i) => (
        <g key={p.month}>
          <circle cx={xs[i]} cy={ys[i]} r={4} className={cn('stroke-foreground', p.soFar ? 'fill-card' : 'fill-foreground')} strokeWidth={2} />
          <text data-copy="figure" x={xs[i]} y={ys[i] - 10} textAnchor="middle" className={cn('fill-foreground font-mono text-[11.5px]', i === last ? 'font-semibold' : null)}>{sharePct(p.k, p.n)}</text>
          <text x={xs[i]} y={128} textAnchor="middle" className="fill-muted-foreground font-mono text-[10.5px]">{pointMonth(p)}</text>
        </g>
      ))}
    </svg>
  )
}

/** "11% (75 of 680)": a share and its level. */
function Level({ p }: { p: MovePoint }) {
  return (
    <>
      <span data-copy="figure" className={MONO}>{sharePct(p.k, p.n)}</span>{' '}
      <span data-copy="level" className={cn(MONO, 'text-muted-foreground')}>({fmtInt(p.k)} of {fmtInt(p.n)})</span>
    </>
  )
}

/** The one sentence a move earns. Its latest month carries the reading
 *  month's label where it is the reading month and not the current one
 *  ("September, the last full month", decision 3). */
function MoveSentence({ card, reading }: { card: MoveCard; reading: ReadingLabel | null }) {
  if (card.unread) return <p className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">{MOVE_UNREAD[card.unread]}</p>
  if (card.pending) {
    // The months before a move dated after the reading month: the latest of
    // them as a level, and when the move's own month reads.
    const last = card.points[card.points.length - 1]
    return (
      <div className="flex flex-col gap-1">
        {last ? (
          <p className="m-0 text-[13.5px] leading-[1.5] text-foreground">
            Share of market videos: <Level p={last} /> in {longMonth(last.month)}, before the move.
          </p>
        ) : null}
        <p className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">{pendingLine(card.pending)}</p>
      </div>
    )
  }
  const moveMonth = monthStartOf(card.day)
  const c = card.compare
  if (comparePrintable(c)) {
    const m = compareMonths(c, moveMonth, reading)
    return (
      <div className="flex flex-col gap-1.5">
        <p className="m-0 text-[13.5px] leading-[1.5] text-foreground">
          Share of market videos went from <Level p={c.before} /> in {m.before}, to <Level p={c.after} /> in {m.after}.
        </p>
        <span data-copy="verdict" className="inline-flex items-center gap-1.5 text-[12.5px]">
          <MovementBadge verdict={c.verdict} unit="pts" good={card.direction === 'down' ? 'down' : 'up'} />
        </span>
      </div>
    )
  }
  // The pair is refused, or the month before was not read: the latest level
  // alone, never the earlier one beside it.
  const latest = card.compare?.after ?? card.points[card.points.length - 1]
  if (!latest) return null
  return (
    <p className="m-0 text-[13.5px] leading-[1.5] text-foreground">
      Share of market videos: <Level p={latest} /> in {inlineMonth(`${longMonth(latest.month)}${latest.soFar ? ' so far' : ''}`, monthLabelOn(latest.month, reading))}.
    </p>
  )
}

/** What a move is on: a subject is the client's own name for it, a theme the
 *  model's label for a conversation. */
function OnWhat({ card }: { card: MoveCard }) {
  if (!card.label) return null
  return (
    <>
      {' · on '}
      {card.kind === 'subject'
        ? <span data-copy="quote">{card.label}</span>
        : <span data-copy="subject" data-slot="pass_b_theme">{card.label}</span>}
    </>
  )
}

const DOT: Record<MoveCard['status'], string> = { active: 'bg-you', done: 'bg-foreground', dropped: 'bg-comp' }

function MoveCardView({ card, canDecide, reading }: { card: MoveCard; canDecide: boolean; reading: ReadingLabel | null }) {
  return (
    <article id={moveAnchor(card.id)} className={cn(CARD, 'scroll-mt-6')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 text-[17px] font-semibold leading-[1.3] text-foreground"><span data-copy="quote">{card.title}</span></h3>
          <p className="m-0 mt-0.5 text-[13px] leading-[1.4] text-muted-foreground">Dated {shortDate(card.day)}<OnWhat card={card} /></p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-inner px-2.5 py-1 text-[12px] font-semibold text-foreground">
          <span aria-hidden className={cn('size-[7px] rounded-full', DOT[card.status])} />
          {MOVE_STATUS_LABEL[card.status]}
        </span>
      </div>
      <MoveLine card={card} />
      <div className="mt-auto flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 basis-[260px]"><MoveSentence card={card} reading={reading} /></div>
        {card.openHref ? <Link href={card.openHref} className={OLINK}>Open →</Link> : null}
      </div>
      {canDecide ? <div className="border-t border-track pt-3"><MoveStatusControl id={card.id} status={card.status} /></div> : null}
    </article>
  )
}

/** The page's reading month and its label, as a move's sentence takes it. */
const readingOf = (data: Pick<MovesPageData, 'month' | 'monthLabel'>): ReadingLabel => ({ month: data.month, label: data.monthLabel ?? null })

export function MovesSection({ data }: { data: MovesPageData }) {
  const cards = data.moves.cards
  if (cards.length === 0) return null
  return (
    <section aria-labelledby="moves-title" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-0.5">
        <h2 id="moves-title" className={SECTION_TITLE}>{MOVES_TITLE}</h2>
        <p className={SECTION_SUB}>{MOVES_SUB}</p>
      </div>
      <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-2">
        {cards.map((c) => <MoveCardView key={c.id} card={c} canDecide={data.canDecide} reading={readingOf(data)} />)}
      </div>
    </section>
  )
}
