import Link from 'next/link'
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

/** "14–22%": the month line's range, in whole percent. */
function rangeOf(row: SubjectRow): string | null {
  const v = row.trail.map((t) => t.pct).filter((x): x is number => x != null)
  if (v.length < 2) return null
  const lo = Math.round(Math.min(...v))
  const hi = Math.round(Math.max(...v))
  return lo === hi ? `${lo}%` : `${lo} to ${hi}%`
}

function Row({ row, data, selected }: { row: SubjectRow; data: MarketData; selected: boolean }) {
  const week = data.period === 'week'
  const level = row.level
  const months = row.trail.filter((t) => t.pct != null).length
  const range = rangeOf(row)
  return (
    <div className="grid grid-cols-1 gap-3.5 border-t border-track py-5 first:border-t-0 first:pt-1 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] md:gap-7">
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
        ) : null}
        {months >= 2 ? (
          <div className="mt-3 flex flex-col gap-1">
            <Sparkline values={row.trail.map((t) => t.pct)} width={160} height={30} color="var(--foreground)" animate={false} />
            <span className="whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">
              <span data-copy="figure">{months}</span> months{range ? <> · <span data-copy="figure">{range}</span></> : null}
            </span>
          </div>
        ) : null}
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
          : <p className="m-0 text-[13.5px] text-muted-foreground">No conversation in it reached three videos {week ? 'this week' : `in ${data.month.text}`}.</p>}
      </div>
    </div>
  )
}

/** The subjects that print no level, grouped by why (the calibration's own
 *  words): counted in your market and marked provisional; being re-described;
 *  not read this month. Each opens its panel, which says the same. */
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

export function SubjectBoardView({ board, data }: { board: SubjectBoard; data: MarketData }) {
  const openSubject = data.subjectPanel?.id ?? null
  return (
    <article id="subjects" aria-labelledby="subjects-title" className={cn(CARD, board.rows.length > 0 ? 'col-span-12 xl:col-span-8' : 'col-span-12', 'scroll-mt-6')}>
      <CardHead
        icon={MessageSquareText}
        id="subjects-title"
        title="What the market is talking about"
        sub={board.rows.length > 0
          ? <>Your subjects, as a share of {board.monthText}’s {board.n != null ? <span data-copy="figure">{fmtInt(board.n)}</span> : null} videos.{board.ticks ? <> The black tick is {board.prevText}.</> : null}</>
          : <>Your subjects in {board.monthText}</>}
      />
      {board.rows.length > 0 ? (
        <div>
          {board.rows.map((r) => <Row key={r.id} row={r} data={data} selected={openSubject === r.id} />)}
        </div>
      ) : null}
      {board.unmeasured.length > 0 ? <Unmeasured board={board} selected={openSubject} /> : null}
    </article>
  )
}
