import Link from 'next/link'

import { CARD, EmptyBox, GoLink, Label, SectionHead, Tag } from '@/components/v2'
import { ROW } from '@/components/v2/look'
import { MovementBadge, nonAnswerParts, signedChange } from '@/components/delta-badge'
import type { Verdict } from '@/lib/reading/verdicts'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { monthStartOf } from '@/lib/reading/month-key'
import { inlineMonth } from '@/lib/reading/month-label'
import { DateMove } from '@/components/pages/market-surface/date-move'
import { canDate } from '@/lib/pages/date-move'
import {
  MOVES_SUB, MOVES_TITLE, MOVES_UNREAD_TITLE, MOVE_STATUS_LABEL, MOVE_UNREAD, NEXT_MOVE, NO_MOVE_YET, READ_FAILED,
  axisLine, compareMonths, comparePrintable, levelBase, moveAnchor, moveAxis, monthLabelOn, pointMonth, sharePct,
  type MoveCard, type MovePoint, type MoveSlot, type MovesPageData, type ReadingLabel,
} from '@/lib/pages/v2/moves'
import { cn } from '@/lib/utils'
import { MoveStatusControl } from './move-status'

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
      <svg viewBox={`0 0 ${W} ${detail ? H + 14 : H}`} width="100%" role="img" aria-label={`${card.label ?? 'It'} as a share of ${levelBase(card.kind)}${words ? `: ${words}` : ', no month drawn yet'}. The move was dated ${shortDate(card.day)}.`} className="block overflow-visible">
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
      <span data-copy="figure" className="tabular-nums">{sharePct(p.k, p.n)}</span>{' '}
      <span data-copy="level" className="tabular-nums text-secondary-foreground">({fmtInt(p.k)} of {fmtInt(p.n)})</span>
    </>
  )
}

/** The one sentence a move earns. Its latest month carries the reading
 *  month's label where it is the reading month and not the current one
 *  ("September, the last full month", decision 3). */
export function MoveSentence({ card, reading }: { card: MoveCard; reading: ReadingLabel | null }) {
  if (card.unread) return <p className="m-0 text-[14px] leading-[1.5] text-muted-foreground">{MOVE_UNREAD[card.unread]}</p>
  if (card.pending) {
    // The months before a move dated after the reading month: the latest of
    // them as a level. When the move's own month reads is the chart's line.
    const last = card.points[card.points.length - 1]
    return last ? (
      <p className="m-0 text-[14px] leading-[1.5] text-foreground">
        Share of {levelBase(card.kind)}: <Level p={last} /> in {longMonth(last.month)}, before the move.
      </p>
    ) : null
  }
  const moveMonth = monthStartOf(card.day)
  const c = card.compare
  if (comparePrintable(c)) {
    const m = compareMonths(c, moveMonth, reading)
    return (
      <div className="flex flex-col gap-1.5">
        <p className="m-0 text-[14px] leading-[1.5] text-foreground">
          Share of {levelBase(card.kind)} went from <Level p={c.before} /> in {m.before}, to <Level p={c.after} /> in {m.after}.
        </p>
        <span className="text-[14px] text-secondary-foreground"><VerdictWords verdict={c.verdict} good={card.direction === 'down' ? 'down' : 'up'} /></span>
      </div>
    )
  }
  // The pair is refused, or the month before was not read: the latest level
  // alone, never the earlier one beside it.
  const latest = card.compare?.after ?? card.points[card.points.length - 1]
  if (!latest) return null
  return (
    <p className="m-0 text-[14px] leading-[1.5] text-foreground">
      Share of {levelBase(card.kind)}: <Level p={latest} /> in {inlineMonth(`${longMonth(latest.month)}${latest.soFar ? ' so far' : ''}`, monthLabelOn(latest.month, reading))}.
    </p>
  )
}

const capital = (s: string): string => `${s.charAt(0).toUpperCase()}${s.slice(1)}`

/**
 * A comparison's answer in words, then its change, in commas ("No clear
 * change, +3 pts"; "Beyond its normal swing, +6.3 pts"), the margin in the
 * word's title: the form the brand page's "Against last month" takes (the
 * review of Phases 4 and 5), never the badge's middle dots on a screen. The
 * badge itself is untouched (print and email draw it). A verdict with no
 * change to print falls back to the badge.
 */
export function VerdictWords({ verdict, good }: { verdict: Verdict; good: 'up' | 'down' }) {
  const non = nonAnswerParts(verdict, 'pts')
  if (non) {
    return (
      <>
        <span data-copy="verdict" title={non.title}>{capital(non.word)}</span>
        {non.change != null ? <>, <span data-copy="verdict" className="whitespace-nowrap">{signedChange(non.change, 'pts')}</span></> : null}
      </>
    )
  }
  const change = verdict.changePts
  if (change == null) return <span data-copy="verdict"><MovementBadge verdict={verdict} unit="pts" good={good} /></span>
  return (
    <>
      <span data-copy="verdict" title={verdict.bandPts != null ? `moved beyond the ${verdict.bandPts} pt margin of this measurement` : undefined}>Beyond its normal swing</span>
      , <span data-copy="verdict" className="whitespace-nowrap">{signedChange(change, 'pts')}</span>
    </>
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

/** ", on {label}", the label opening what it is on in Market (decision 4). */
function OnWhat({ card }: { card: MoveCard }) {
  if (!card.label) return null
  return (
    <>
      {', on '}
      {card.onHref
        ? <Link href={card.onHref} className="text-foreground underline decoration-control underline-offset-[3px] hover:decoration-foreground"><OnLabel card={card} /></Link>
        : <OnLabel card={card} />}
    </>
  )
}

/** A move's status as the boards' quiet tag ("Active"). */
export function MoveStatusChip({ status }: { status: MoveCard['status']; className?: string }) {
  return <Tag tone="mid">{MOVE_STATUS_LABEL[status]}</Tag>
}

/** What an empty month says on a move's months, in a word or two (the line
 *  under them says why at length, `axisLine`). */
const SLOT_WORDS: Record<NonNullable<MoveSlot['why']>, string> = {
  cut: 'Left off',
  unknown: 'Left off',
  unread: 'No reading',
  pending: 'Not read yet',
  move: 'Not drawn',
}

/** A month's term on a move's months: its name, "so far" while it fills, and
 *  where it stands against the move. */
function slotTerm(s: MoveSlot, moveMonth: string): string {
  const name = `${longMonth(s.month)}${s.point?.soFar ? ' so far' : ''}`
  return s.month === moveMonth ? `${name}, the month of your move` : s.month > moveMonth ? `${name}, after your move` : name
}

/**
 * THE MOVE'S MONTHS (the audit design's card, Moves.dc.html): the months from
 * two before the move to the reading month as a list, each its share and
 * its count, an empty month saying why in a word, the move's month under a
 * gold rule. Bare where its base is the figures row's (the market's videos),
 * "k of n" otherwise (a conversation's, the category's; decision 2). The
 * line under it says why at length (`axisLine`).
 */
export function MoveMonths({ card, readingMonth, base = null }: { card: MoveCard; readingMonth: string; base?: number | null }) {
  const slots = moveAxis(card, readingMonth)
  if (slots.length === 0) return null
  const moveMonth = monthStartOf(card.day)
  const line = axisLine(slots)
  return (
    <div data-move-months="" className="flex flex-col gap-2.5">
      <Label as="p">Share of {levelBase(card.kind)}, month by month</Label>
      <dl className="m-0 grid gap-3.5" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
        {slots.map((s) => (
          <div key={s.month} data-move-month={s.month === moveMonth ? 'move' : ''} className={cn('min-w-0', s.month === moveMonth ? 'border-t-2 border-you pt-[9px]' : 'border-t border-border pt-2.5')}>
            <dt className="text-[13px] leading-[1.35] text-muted-foreground">{slotTerm(s, moveMonth)}</dt>
            {s.point ? (
              <>
                <dd data-copy="figure" className="m-0 mt-1 text-[26px] font-bold leading-[1.1] tabular-nums">{sharePct(s.point.k, s.point.n)}</dd>
                <dd className="m-0 mt-1 text-[14px] text-secondary-foreground">
                  {s.point.n === base
                    ? <><span data-copy="figure">{fmtInt(s.point.k)}</span> {s.point.k === 1 ? 'video' : 'videos'}</>
                    : <span data-copy="level">{fmtInt(s.point.k)} of {fmtInt(s.point.n)}</span>}
                </dd>
              </>
            ) : <dd className="m-0 mt-1.5 text-[14.5px] text-muted-foreground">{SLOT_WORDS[s.why ?? 'unknown']}</dd>}
          </div>
        ))}
      </dl>
      {line ? <p className="m-0 text-[13px] leading-[1.45] text-muted-foreground">{line}</p> : null}
    </div>
  )
}

function MoveCardView({ card, canDecide, reading, base }: { card: MoveCard; canDecide: boolean; reading: ReadingLabel; base: number | null }) {
  return (
    <article id={moveAnchor(card.id)} className={cn(CARD, 'scroll-mt-6 gap-3.5')}>
      <div className="flex items-start justify-between gap-3.5">
        <h3 className="m-0 min-w-0 text-[19px] font-semibold leading-[1.35] text-foreground">
          <Link href={card.href} className={ROW}><span data-copy="quote">{card.title}</span></Link>
        </h3>
        <MoveStatusChip status={card.status} />
      </div>
      <p className="m-0 text-[14.5px] text-secondary-foreground">Dated {shortDate(card.day)}<OnWhat card={card} /></p>
      {/* A move with no line says why in the dashed box, with no empty months
          (decision 4); one with a line draws its months and its sentence. */}
      {card.unread ? <EmptyBox>{MOVE_UNREAD[card.unread]}</EmptyBox> : (
        <>
          <MoveMonths card={card} readingMonth={reading.month} base={base} />
          <MoveSentence card={card} reading={reading} />
        </>
      )}
      <div className="flex-1" />
      <div className="flex flex-wrap items-center gap-2.5 border-t border-track pt-3.5">
        {canDecide ? <MoveStatusControl id={card.id} status={card.status} /> : null}
        <span className="flex-1" />
        <GoLink href={card.href}>Open the move</GoLink>
      </div>
    </article>
  )
}

/** The page's reading month and its label, as a move's sentence takes it. */
const readingOf = (data: Pick<MovesPageData, 'month' | 'monthLabel'>): ReadingLabel => ({ month: data.month, label: data.monthLabel ?? null })

/** Where an empty card's months would be, said where the reader may not date
 *  a move (the invitation is an owner's or an admin's). */
const NEXT_MOVE_QUIET = 'A move’s months are drawn here once one is dated.'

/**
 * THE BOARD'S SECOND CARD WHERE THERE IS NO SECOND MOVE (and its only one
 * where there is none, or where the moves could not be read): the move
 * card's own frame and title, holding the next move: its one line in the
 * dashed box (decision 4: no empty months), and "Date a move" only where the
 * reader may date one (an owner or an admin, where moves are recorded).
 */
function NextMoveCard({ data, first, wide, failed }: { data: MovesPageData; first: boolean; wide: boolean; failed: boolean }) {
  const invite = !failed && data.canDecide && data.moves.recorded && data.dating != null && canDate(data.dating)
  const title = failed ? MOVES_UNREAD_TITLE : first ? NO_MOVE_YET.title : NEXT_MOVE.title
  const sub = failed ? null : first ? NO_MOVE_YET.sub : NEXT_MOVE.sub
  return (
    <article data-move-slot="" className={cn(CARD, 'gap-3.5', wide ? 'min-[1180px]:col-span-2' : null)}>
      <div className="min-w-0">
        <h3 className="m-0 text-[19px] font-semibold leading-[1.35] text-foreground">{title}</h3>
        {sub ? <p className="m-0 mt-1 text-[14px] leading-[1.4] text-muted-foreground">{sub}</p> : null}
      </div>
      <div className="flex flex-1 flex-col [&>[data-empty-box]]:flex-1 [&>[data-empty-box]]:justify-center">
        <EmptyBox>{failed ? `Your moves ${READ_FAILED}.` : invite ? NEXT_MOVE.line : NEXT_MOVE_QUIET}</EmptyBox>
      </div>
      {invite ? <div className="flex flex-wrap items-center gap-2"><DateMove dating={data.dating!} place="quiet" /></div> : null}
    </article>
  )
}

export function MovesSection({ data }: { data: MovesPageData }) {
  const cards = data.moves.cards
  const failed = data.failed?.moves === true
  // THE BOARD'S TWO ACROSS, ALWAYS: an odd last row takes the next move's
  // card beside it; no move at all (or moves that could not be read) is that
  // card across the row.
  const filler = cards.length % 2 === 1 || cards.length === 0
  const base = data.marketN?.market ?? null
  return (
    <section aria-labelledby="moves-title" className="flex min-w-0 flex-col">
      <SectionHead id="moves-title" title={MOVES_TITLE} note={MOVES_SUB} />
      <div className="mt-[22px] grid grid-cols-1 gap-5 min-[1180px]:grid-cols-2">
        {cards.map((c) => <MoveCardView key={c.id} card={c} canDecide={data.canDecide} reading={readingOf(data)} base={c.kind === 'subject' ? base : null} />)}
        {filler ? <NextMoveCard data={data} first={cards.length === 0} wide={cards.length === 0} failed={failed && cards.length === 0} /> : null}
      </div>
    </section>
  )
}
