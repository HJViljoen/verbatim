import Link from 'next/link'
import type { CSSProperties } from 'react'
import { MessageSquareText } from 'lucide-react'
import { MovementBadge } from '@/components/delta-badge'
import { Sparkline } from '@/components/charts/sparkline'
import { CARD, CardHead, TickBar } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import type { MarketData, SubjectBoard, SubjectRow } from '@/lib/pages/v2/market'
import { cn } from '@/lib/utils'
import { ConvChip, ConvRow, Label, MONO_MUTED, SetApartTag } from './parts'

// THE SUBJECT BOARD (depth v2, T3; E2-Market's "What the market is talking
// about", re-cut to decision 1): every subject the client follows, its month
// so far as a share of the market's videos, against last month through the
// one `Verdict` badge ("▲ 7 pts", "no clear change"), the black tick at last
// month's share where the pair may be compared, its month line, and the
// conversations inside it with the period's counts. This week, each
// conversation's week count stands beside its month's.
//
// THE BOARD'S FORM IN EVERY STATE (the parity pass, 13 Oct): a subject with no
// level yet keeps its row (its name, its bar's empty track, the conversations
// inside it) with why in the level's place; the card keeps its column beside
// the rail even with no subject named. A TRACKED SUBJECT IS NEVER HIDDEN (14
// Oct): one being re-described has its row exactly as one whose check is
// open, FAILED_EXPLAINED in the level's place.

/** "14 to 22%": the month line's range, in whole percent. Null for one
 *  point: its range would repeat the level printed above it. */
function rangeOf(row: SubjectRow): string | null {
  const v = row.trail.map((t) => t.pct).filter((x): x is number => x != null)
  if (v.length < 2) return null
  const lo = Math.round(Math.min(...v))
  const hi = Math.round(Math.max(...v))
  return lo === hi ? `${lo}%` : `${lo} to ${hi}%`
}

/** One month read: the axis's hairline and that month's point on its slot,
 *  both at the row's centre line, level with the labels beside them. */
function OnePoint({ trail }: { trail: SubjectRow['trail'] }) {
  const at = trail.findIndex((t) => t.pct != null)
  const n = trail.length
  const x = n <= 1 ? 80 : 4 + (at * 152) / (n - 1)
  return (
    <svg viewBox="0 0 160 34" aria-hidden className="block h-auto w-full overflow-visible">
      <line x1={0} y1={17} x2={160} y2={17} className="stroke-border" strokeWidth={1} />
      <circle cx={x} cy={17} r={3.4} className="fill-foreground stroke-card" strokeWidth={1.5} />
    </svg>
  )
}

/** The board's month line: the months read, the line on the board's axis (a
 *  month with no reading keeps its slot), the range. A subject read for one
 *  month draws its one point on the axis's hairline, and no range. */
function MonthLine({ row }: { row: SubjectRow }) {
  const months = row.trail.filter((t) => t.pct != null).length
  const range = rangeOf(row)
  if (months === 0) return null
  return (
    <div className="mt-3 flex items-center gap-2.5">
      <span className="whitespace-nowrap font-mono text-[10.5px] text-muted-foreground"><span data-copy="figure">{months}</span> {months === 1 ? 'month' : 'months'}</span>
      {/* The board's 160 by 34, given way where the column is narrower, so
          the range never runs into "Inside it". */}
      <span className="min-w-0 max-w-[160px] flex-1">
        {months === 1
          ? <OnePoint trail={row.trail} />
          : <Sparkline values={row.trail.map((t) => t.pct)} width={160} height={34} color="var(--foreground)" animate={false} className="block h-auto w-full" />}
      </span>
      {range ? <span data-copy="figure" className="whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">{range}</span> : null}
    </div>
  )
}

function Row({ row, data, selected }: { row: SubjectRow; data: MarketData; selected: boolean }) {
  const week = data.period === 'week'
  const level = row.level
  return (
    <div data-subject-row={row.pending ? row.pending.state : 'ready'} className="grid grid-cols-1 gap-3.5 border-t border-track py-5 first:border-t-0 first:pt-1 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] md:gap-7">
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2.5">
          <Link href={row.href} scroll={false} aria-current={selected ? 'true' : undefined} className={cn('text-[16px] font-semibold text-foreground no-underline underline-offset-[3px] hover:underline', selected ? 'underline' : null)}>
            {row.name}
          </Link>
        </div>
        {level ? (
          <>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span data-copy="figure" className="font-mono text-[26px] font-medium tracking-[-0.02em] tabular-nums text-foreground">{Math.round(level.pct)}%</span>
              <span data-copy="level" className={cn(MONO_MUTED, 'whitespace-nowrap')}>{fmtInt(level.k)} of {fmtInt(level.n)}</span>
              <span data-copy="verdict" className="ml-auto whitespace-nowrap text-right text-[12.5px]"><MovementBadge verdict={row.verdict} unit="pts" good="neutral" bandTip /></span>
            </div>
            <TickBar
              pct={level.pct}
              tick={row.prevPct}
              size="lg"
              className="mt-2.5"
              label={`${Math.round(level.pct)}% ${data.subjects?.monthText ?? ''}${row.prevPct != null ? `, against ${Math.round(row.prevPct)}% in ${data.subjects?.prevText ?? 'the month before'}` : ''}`}
            />
          </>
        ) : (
          // NO LEVEL YET, THE ROW KEPT (the parity pass, 13 Oct): the level's
          // place says why, in one quiet line, over the bar's empty track. A
          // longer reason (being re-described) wraps on its own leading and
          // keeps the figure's height as its least.
          <>
            <p data-subject-pending="" className="m-0 mt-2 flex min-h-[34px] items-center text-[13px] leading-[1.45] text-muted-foreground">{row.pending?.note}</p>
            <TickBar pct={0} size="lg" className="mt-2.5" label={row.pending?.note ?? row.name} />
          </>
        )}
        <MonthLine row={row} />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="mb-1 flex items-baseline gap-3">
          <Label>Inside it</Label>
          {week && row.inside.length > 0 ? (
            <span className="ml-auto flex gap-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              <span className="w-9 text-right">Week</span>
              <span className="w-9 text-right">{data.month.text.slice(0, 3)}</span>
            </span>
          ) : null}
        </div>
        {row.inside.length > 0
          ? row.inside.map((c) => (
            <ConvRow
              key={c.id}
              href={c.href}
              label={c.label}
              selected={data.panel?.at === 'subjects' && data.panel.id === c.id}
              chip={<><ConvChip flag={c.flag} isNew={c.isNew} id={c.id} label={c.label} k={c.month ?? c.count ?? 0} n={data.month.category ?? 0} month={data.month.month} /><SetApartTag setApart={c.setApart} /></>}
              counts={week ? [c.count, c.month] : [c.count]}
            />
          ))
          : <p className="m-0 py-1.5 text-[13.5px] text-muted-foreground">No conversation in it reached three videos {week ? 'this week' : `in ${data.month.text}`}.</p>}
      </div>
    </div>
  )
}

/** The subjects named in one line under the rows, grouped by why: a stored
 *  dump from before 14 Oct (a failed subject has its own row since). Each
 *  opens its panel, which says the same. */
function Unmeasured({ board, selected }: { board: SubjectBoard; selected: string | null }) {
  const groups = (['provisional', 'failed', 'unread'] as const)
    .map((state) => ({ state, rows: board.unmeasured.filter((u) => u.state === state) }))
    .filter((g) => g.rows.length > 0)
  return (
    <div className={cn('flex flex-col gap-2 text-[13px] leading-[1.5]', board.rows.length > 0 ? 'border-t border-track pt-3' : null)}>
      {groups.map((g) => (
        <p key={g.state} className="m-0 text-muted-foreground">
          {g.rows.map((u, i) => (
            <span key={u.id}>
              {i > 0 ? ', ' : null}
              <Link href={u.href} scroll={false} aria-current={selected === u.id ? 'true' : undefined} className="font-medium text-foreground no-underline underline-offset-[3px] hover:underline">{u.name}</Link>
            </span>
          ))}
          <span>: {g.rows[0].note}</span>
        </p>
      ))}
    </div>
  )
}

export function SubjectBoardView({ board, data, style }: { board: SubjectBoard | null; data: MarketData; style?: CSSProperties }) {
  const openSubject = data.subjectPanel?.id ?? null
  const rows = board?.rows ?? []
  const measured = rows.some((r) => r.level != null)
  return (
    <article id="subjects" aria-labelledby="subjects-title" style={style} className={cn(CARD, 'col-span-12 xl:col-span-8', 'scroll-mt-6')}>
      <CardHead
        icon={MessageSquareText}
        id="subjects-title"
        title="What the market is talking about"
        sub={!board
          ? <>Your subjects, once they are named in Settings</>
          : measured
            ? <>Your subjects, as a share of {board.monthText}’s {board.n != null ? <span data-copy="figure">{fmtInt(board.n)}</span> : null} videos.{board.ticks ? <> The black tick is {board.prevText}.</> : null}</>
            : <>Your subjects, and the conversations inside each</>}
      />
      {rows.length > 0 ? (
        <div>
          {rows.map((r) => <Row key={r.id} row={r} data={data} selected={openSubject === r.id} />)}
        </div>
      ) : null}
      {board && board.unmeasured.length > 0 ? <Unmeasured board={board} selected={openSubject} /> : null}
    </article>
  )
}
