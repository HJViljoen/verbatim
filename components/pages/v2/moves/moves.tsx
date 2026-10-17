import Link from 'next/link'

import { CARD } from '@/components/v2'
import { MovementBadge } from '@/components/delta-badge'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { monthStartOf, prevMonth } from '@/lib/reading/month-key'
import { inlineMonth } from '@/lib/reading/month-label'
import { DateMove } from '@/components/pages/market-surface/date-move'
import { canDate } from '@/lib/pages/date-move'
import {
  MOVES_SUB, MOVES_TITLE, MOVES_UNREAD_TITLE, MOVE_STATUS_LABEL, MOVE_UNREAD, NEXT_MOVE, NO_MOVE_YET, READ_FAILED,
  axisLine, compareMonths, comparePrintable, moveAnchor, moveAxis, monthLabelOn, pointMonth, sharePct,
  type MoveCard, type MovePoint, type MoveSlot, type MovesPageData, type ReadingLabel,
} from '@/lib/pages/v2/moves'
import { cn } from '@/lib/utils'
import { MovesKindTile } from './level-tiles'
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
// THE CHART IS ALWAYS THE BOARD'S (the parity pass, 13 Oct): the axis from
// two months before the move, the months read as points, the rest as empty
// slots with their names lighter, and one quiet line under it saying why.
// The row keeps the board's two across: an odd last move takes the next
// move's card beside it.
//
// The status control (`setMoveStatusAction`) is drawn for an owner or an
// admin only.
//
// EACH MOVE OPENS AS ITS OWN PAGE (levels as pages, 17 Oct; board G6-Moves):
// the flag tile names the level, the title and Open go to the move's page
// (`/dashboard/moves/<id>`, the evidence), and "on {label}" opens what it is
// on in Market (decision 4), its home.

const W = 480
const H = 140
const BASE = 110
const TOP = 26

/** The axis's geometry, pure: an x per month slot, a y per drawn share (null
 *  on an empty slot), and the move's mark. */
export function slotGeometry(slots: readonly Pick<MoveSlot, 'month' | 'point'>[], moveDay: string): {
  xs: number[]
  ys: (number | null)[]
  moveX: number | null
} {
  const n = slots.length
  const step = n > 1 ? (W - 90) / (n - 1) : 0
  const xs = slots.map((_, i) => (n > 1 ? 45 + i * step : W / 2))
  const shares = slots.map((s) => (s.point ? (s.point.n > 0 ? s.point.k / s.point.n : 0) : null))
  // One month read sits a little above the middle, where the board's line
  // runs, rather than pinned to the top.
  const many = shares.filter((x) => x != null).length > 1
  const max = Math.max(...shares.map((x) => x ?? 0), 0.0001) * (many ? 1.15 : 1.8)
  const ys = shares.map((x) => (x == null ? null : BASE - (x / max) * (BASE - TOP)))
  // THE MOVE'S MONTH, AT ITS FRONT EDGE: the dashed line stands where the
  // month the move was made in begins on the line (half a slot before its
  // point), so it reads "from here on" without claiming a day inside a month
  // the line reads as one point. Its first month, the line's own left edge.
  const moveMonth = monthStartOf(moveDay)
  const at = slots.findIndex((s) => s.month === moveMonth)
  const moveX = at < 0 ? null : Math.max(8, xs[at] - (n > 1 ? step / 2 : 40))
  return { xs, ys, moveX }
}

/** The line's geometry over its drawn months alone (every slot drawn). */
export function lineGeometry(points: readonly MovePoint[], moveDay: string): { xs: number[]; ys: number[]; moveX: number | null } {
  const g = slotGeometry(points.map((p) => ({ month: p.month, point: p })), moveDay)
  return { xs: g.xs, ys: g.ys.map((y) => y ?? BASE), moveX: g.moveX }
}

/**
 * THE BOARD'S CHART, WHATEVER THE DATA: the axis from two months before the
 * move to the reading month (or the move's own, where it is later), the
 * "your move" mark, the months read as points on the line, and the months
 * not drawn as empty slots, their names lighter. One quiet line under it says
 * why a slot is empty (`axisLine`); a move with no line at all says why in its
 * sentence, and its chart is the axis and the mark alone.
 */
export function MoveChart({ card, readingMonth, detail = false }: {
  card: MoveCard
  readingMonth: string
  /** The move's page (G6-Moves-Move): each month named in full, its level
   *  under it ("July / 46 of 455"). */
  detail?: boolean
}) {
  const slots = moveAxis(card, readingMonth)
  if (slots.length === 0) return null
  const { xs, ys, moveX } = slotGeometry(slots, card.day)
  const drawn = slots.map((s, i) => ({ s, i, y: ys[i] })).filter((x): x is { s: MoveSlot & { point: MovePoint }; i: number; y: number } => x.s.point != null && x.y != null)
  const solid = drawn.filter(({ s }) => !s.point.soFar)
  const lastDrawn = drawn[drawn.length - 1]
  const beforeLast = drawn[drawn.length - 2]
  const words = drawn.map(({ s }) => `${pointMonth(s.point)} ${sharePct(s.point.k, s.point.n)}`).join(', ')
  const line = axisLine(slots)
  return (
    <div className="flex flex-col gap-1.5">
      <svg viewBox={`0 0 ${W} ${detail ? H + 14 : H}`} width="100%" role="img" aria-label={`${card.label ?? 'It'} as a share of the market's videos${words ? `: ${words}` : ', no month drawn yet'}. The move was dated ${shortDate(card.day)}.`} className="block overflow-visible">
        <line x1={0} y1={BASE} x2={W} y2={BASE} className="stroke-border" />
        {moveX != null ? (
          <>
            <line x1={moveX} y1={14} x2={moveX} y2={BASE} className="stroke-orange-text" strokeWidth={1.5} strokeDasharray="3 3" />
            <text x={moveX > W - 80 ? moveX - 7 : moveX + 7} y={22} textAnchor={moveX > W - 80 ? 'end' : 'start'} className="fill-orange-text font-sans text-[11px] font-semibold">your move</text>
          </>
        ) : null}
        {solid.length > 1 ? (
          <polyline points={solid.map(({ i, y }) => `${xs[i].toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" className="stroke-foreground" strokeWidth={2} strokeLinejoin="round" />
        ) : null}
        {lastDrawn?.s.point.soFar && beforeLast ? (
          <line x1={xs[beforeLast.i]} y1={beforeLast.y} x2={xs[lastDrawn.i]} y2={lastDrawn.y} className="stroke-foreground" strokeWidth={2} strokeDasharray="4 3" />
        ) : null}
        {slots.map((s, i) => {
          const y = ys[i]
          return (
            <g key={s.month}>
              {s.point && y != null ? (
                <>
                  <circle cx={xs[i]} cy={y} r={4} className={cn('stroke-foreground', s.point.soFar ? 'fill-card' : 'fill-foreground')} strokeWidth={2} />
                  <text data-copy="figure" x={xs[i]} y={y - 10} textAnchor="middle" className={cn('fill-foreground font-mono text-[11.5px]', detail ? 'max-sm:text-[14px]' : null, i === lastDrawn?.i ? 'font-semibold' : null)}>{sharePct(s.point.k, s.point.n)}</text>
                </>
              ) : null}
              {detail ? (
                <>
                  {/* On a phone the chart scales to the column, so its words
                      take a larger size in the chart's own units (G6-Moves-Move-Phone). */}
                  <text x={xs[i]} y={127} textAnchor="middle" className="fill-muted-foreground font-mono text-[10.5px] max-sm:text-[13px]">{longMonth(s.month)}{s.point?.soFar ? ' so far' : ''}</text>
                  {s.point ? <text data-copy="level" x={xs[i]} y={142} textAnchor="middle" className="fill-muted-foreground font-mono text-[10.5px] max-sm:text-[13px]">{fmtInt(s.point.k)} of {fmtInt(s.point.n)}</text> : null}
                </>
              ) : (
                <text x={xs[i]} y={128} textAnchor="middle" className="fill-muted-foreground font-mono text-[10.5px]">{s.point ? pointMonth(s.point) : pointMonth({ month: s.month, soFar: false })}</text>
              )}
            </g>
          )
        })}
      </svg>
      {line ? <p className="m-0 text-[12px] leading-[1.4] text-muted-foreground">{line}</p> : null}
    </div>
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
export function MoveSentence({ card, reading }: { card: MoveCard; reading: ReadingLabel | null }) {
  if (card.unread) return <p className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">{MOVE_UNREAD[card.unread]}</p>
  if (card.pending) {
    // The months before a move dated after the reading month: the latest of
    // them as a level. When the move's own month reads is the chart's line.
    const last = card.points[card.points.length - 1]
    return last ? (
      <p className="m-0 text-[13.5px] leading-[1.5] text-foreground">
        Share of market videos: <Level p={last} /> in {longMonth(last.month)}, before the move.
      </p>
    ) : null
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
export function OnLabel({ card }: { card: Pick<MoveCard, 'kind' | 'label'> }) {
  if (!card.label) return null
  return card.kind === 'subject'
    ? <span data-copy="quote">{card.label}</span>
    : <span data-copy="subject" data-slot="pass_b_theme">{card.label}</span>
}

/** " · on {label}", the label opening what it is on in Market (decision 4). */
function OnWhat({ card }: { card: MoveCard }) {
  if (!card.label) return null
  return (
    <>
      {' · on '}
      {card.onHref
        ? <Link href={card.onHref} className="text-muted-foreground underline decoration-muted-foreground/40 underline-offset-[3px] hover:text-foreground"><OnLabel card={card} /></Link>
        : <OnLabel card={card} />}
    </>
  )
}

const DOT: Record<MoveCard['status'], string> = { active: 'bg-you', done: 'bg-foreground', dropped: 'bg-comp' }

/** A move's status chip: its dot and its word ("Active"). */
export function MoveStatusChip({ status, className }: { status: MoveCard['status']; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full bg-inner px-2.5 py-1 text-[12px] font-semibold text-foreground', className)}>
      <span aria-hidden className={cn('size-[7px] rounded-full', DOT[status])} />
      {MOVE_STATUS_LABEL[status]}
    </span>
  )
}

function MoveCardView({ card, canDecide, reading }: { card: MoveCard; canDecide: boolean; reading: ReadingLabel }) {
  return (
    <article id={moveAnchor(card.id)} className={cn(CARD, 'scroll-mt-6')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <MovesKindTile level="move" />
          <div className="min-w-0">
            <h3 className="m-0 text-[17px] font-semibold leading-[1.3] text-foreground">
              <Link href={card.href} className="text-foreground no-underline underline-offset-[3px] hover:underline"><span data-copy="quote">{card.title}</span></Link>
            </h3>
            <p className="m-0 mt-0.5 text-[13px] leading-[1.4] text-muted-foreground">Dated {shortDate(card.day)}<OnWhat card={card} /></p>
          </div>
        </div>
        <MoveStatusChip status={card.status} />
      </div>
      <MoveChart card={card} readingMonth={reading.month} />
      <div className="mt-auto flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 basis-[260px]"><MoveSentence card={card} reading={reading} /></div>
        <Link href={card.href} className={OLINK}>Open →</Link>
      </div>
      {canDecide ? <div className="border-t border-track pt-3"><MoveStatusControl id={card.id} status={card.status} /></div> : null}
    </article>
  )
}

/** The page's reading month and its label, as a move's sentence takes it. */
const readingOf = (data: Pick<MovesPageData, 'month' | 'monthLabel'>): ReadingLabel => ({ month: data.month, label: data.monthLabel ?? null })

/** The months an empty card's axis names where it has no neighbour: two
 *  before the reading month to the reading month, the board's frame. */
function frameMonths(readingMonth: string): string[] {
  let at = monthStartOf(readingMonth)
  const out = [at]
  for (let i = 0; i < 2; i++) {
    at = prevMonth(at)
    out.unshift(at)
  }
  return out
}

/** A bare axis on the move chart's own geometry: the baseline and the month
 *  names, nothing above it. `w` widens it across a row. */
function BareAxis({ months, w = W, className }: { months: readonly string[]; w?: number; className?: string }) {
  const n = months.length
  const xs = months.map((_, i) => (n > 1 ? 45 + (i * (w - 90)) / (n - 1) : w / 2))
  return (
    <svg viewBox={`0 0 ${w} ${H}`} width="100%" aria-hidden className={cn('block overflow-visible', className)}>
      <line x1={0} y1={BASE} x2={w} y2={BASE} className="stroke-border" />
      {months.map((m, i) => (
        <text key={m} x={xs[i]} y={128} textAnchor="middle" className="fill-muted-foreground font-mono text-[10.5px]">{pointMonth({ month: m, soFar: false })}</text>
      ))}
    </svg>
  )
}

/**
 * THE BOARD'S SECOND CARD WHERE THERE IS NO SECOND MOVE (and its only one
 * where there is none, or where the moves could not be read): the move
 * card's own frame, title and chart, holding the next move. Its chart is the
 * neighbour's axis, same months, same geometry, with nothing on it (no point,
 * no "your move"); alone, the reading month and the two before. Its one line
 * sits above the axis, in flow. It invites dating only where the reader may
 * date one (an owner or an admin, where moves are recorded); otherwise its
 * title says it.
 */
function NextMoveCard({ data, first, wide, neighbour, failed }: { data: MovesPageData; first: boolean; wide: boolean; neighbour: MoveCard | null; failed: boolean }) {
  const months = neighbour ? moveAxis(neighbour, data.month).map((s) => s.month) : frameMonths(data.month)
  const invite = !failed && data.canDecide && data.moves.recorded && data.dating != null && canDate(data.dating)
  const title = failed ? MOVES_UNREAD_TITLE : first ? NO_MOVE_YET.title : NEXT_MOVE.title
  const sub = failed ? null : first ? NO_MOVE_YET.sub : NEXT_MOVE.sub
  return (
    <article data-move-slot="" className={cn(CARD, wide ? 'min-[1180px]:col-span-2' : null)}>
      <div className="min-w-0">
        <h3 className="m-0 text-[17px] font-semibold leading-[1.3] text-foreground">{title}</h3>
        {sub ? <p className="m-0 mt-0.5 text-[13px] leading-[1.4] text-muted-foreground">{sub}</p> : null}
      </div>
      {failed ? <p className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">{`Your moves ${READ_FAILED}.`}</p>
        : invite ? <p className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">{NEXT_MOVE.line}</p> : null}
      {wide ? (
        <>
          <BareAxis months={months} className="min-[1180px]:hidden" />
          <BareAxis months={months} w={2 * W} className="hidden min-[1180px]:block" />
        </>
      ) : <BareAxis months={months} />}
      {invite ? <div className="mt-auto flex flex-wrap items-center gap-2"><DateMove dating={data.dating!} place="quiet" /></div> : null}
    </article>
  )
}

export function MovesSection({ data }: { data: MovesPageData }) {
  const cards = data.moves.cards
  const failed = data.failed?.moves === true
  // THE BOARD'S TWO ACROSS, ALWAYS: an odd last row takes the next move's
  // card beside it, on its neighbour's axis; no move at all (or moves that
  // could not be read) is that card across the row.
  const filler = cards.length % 2 === 1 || cards.length === 0
  return (
    <section aria-labelledby="moves-title" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-0.5">
        <h2 id="moves-title" className={SECTION_TITLE}>{MOVES_TITLE}</h2>
        <p className={SECTION_SUB}>{MOVES_SUB}</p>
      </div>
      <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-2">
        {cards.map((c) => <MoveCardView key={c.id} card={c} canDecide={data.canDecide} reading={readingOf(data)} />)}
        {filler ? <NextMoveCard data={data} first={cards.length === 0} wide={cards.length === 0} neighbour={cards.length > 0 ? cards[cards.length - 1] : null} failed={failed && cards.length === 0} /> : null}
      </div>
    </section>
  )
}
