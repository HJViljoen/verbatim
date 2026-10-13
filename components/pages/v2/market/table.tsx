import Link from 'next/link'
import { List } from 'lucide-react'
import { MovementBadge } from '@/components/delta-badge'
import { CARD, CardHead } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import type { MarketConv, MarketData, MarketTable } from '@/lib/pages/v2/market'
import { cn } from '@/lib/utils'
import { ConversationPanel } from './panel'
import { About, ConvChip } from './parts'

// EVERY CONVERSATION (depth v2, T3; E2-Market's table): the period's
// conversations at three of the category's videos or more, biggest first,
// filterable by subject (`?in=`, links, so a filter is an address), ten shown
// until "Show all". This week a row's week count stands beside its month's;
// this month the last column is the month against the month before (the one
// `Verdict` badge; nothing where the pair is refused); over time the columns
// are the months. The board's "Against usual" column is not drawn: no rule
// reads a week against a usual week (decision 1). A row opens its
// conversation in place, as the table's own next row.

const TH = 'whitespace-nowrap border-b border-border pb-2.5 pr-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'
const TD = 'border-b border-track py-[11px] pr-3 align-middle'

function title(data: MarketData): string {
  if (data.period === 'week') return 'Every conversation this week'
  if (data.period === 'time') return 'Every conversation, month by month'
  return `Every conversation in ${data.month.text}`
}

function Cells({ conv, data, table }: { conv: MarketConv; data: MarketData; table: MarketTable }) {
  if (data.period === 'time') {
    return (
      <>
        {table.months.map((m) => {
          const point = conv.months.find((x) => x.month === m.month)
          return <td key={m.month} className={cn(TD, 'text-right font-mono tabular-nums')}>{point?.k != null ? <span data-copy="figure">{fmtInt(point.k)}</span> : ''}</td>
        })}
      </>
    )
  }
  if (data.period === 'week') {
    return (
      <>
        <td className={cn(TD, 'text-right font-mono tabular-nums')}>{conv.week != null ? <span data-copy="figure">{fmtInt(conv.week)}</span> : ''}</td>
        <td className={cn(TD, 'text-right font-mono tabular-nums text-muted-foreground')}>{conv.month != null ? <span data-copy="figure">{fmtInt(conv.month)}</span> : ''}</td>
      </>
    )
  }
  return (
    <>
      <td className={cn(TD, 'text-right font-mono tabular-nums')}>{conv.month != null ? <span data-copy="figure">{fmtInt(conv.month)}</span> : ''}</td>
      <td className={cn(TD, 'text-right text-[12.5px]')}><span data-copy="verdict"><MovementBadge verdict={conv.monthVerdict} unit="pts" good="neutral" bandTip /></span></td>
    </>
  )
}

export function ConversationTable({ table, data }: { table: MarketTable; data: MarketData }) {
  const time = data.period === 'time'
  const cols = time ? 2 + table.months.length : 5
  const shown = table.rows.length
  return (
    <section id="conversations" aria-labelledby="conversations-title" className={cn(CARD, 'scroll-mt-6')}>
      <CardHead
        icon={List}
        id="conversations-title"
        title={title(data)}
        sub={<><span data-copy="figure">{fmtInt(table.total)}</span> conversations, biggest first, each counted in the category’s videos{data.period === 'week' && data.week?.category != null ? <> (<span data-copy="figure">{fmtInt(data.week.category)}</span> this week)</> : data.month.category != null ? <> (<span data-copy="figure">{fmtInt(data.month.category)}</span> in {data.month.text})</> : null}</>}
      />
      {table.filters.length > 0 ? (
        <nav aria-label="Filter by subject" className="flex flex-wrap gap-1.5">
          {table.filters.map((f) => {
            const on = f.id === table.filter
            return (
              <Link
                key={f.id ?? 'all'}
                href={f.href}
                scroll={false}
                aria-current={on ? 'page' : undefined}
                className={cn('cursor-pointer rounded-full px-3 py-1.5 text-[13px] no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', on ? 'bg-accent font-semibold text-accent-foreground' : 'bg-inner text-secondary-foreground hover:bg-track')}
              >
                {f.name} <span data-copy="figure">{fmtInt(f.count)}</span>
              </Link>
            )
          })}
        </nav>
      ) : null}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[560px] border-collapse text-[14px]">
          <thead>
            <tr>
              <th scope="col" className={TH}>Conversation</th>
              <th scope="col" className={TH}>Subject</th>
              {time ? null : <th scope="col" className={TH}>About</th>}
              {time
                ? table.months.map((m) => (
                  <th key={m.month} scope="col" className={cn(TH, 'text-right')}>
                    {longMonth(m.month).slice(0, 3)}{m.filling ? ' so far' : ''}
                    {m.n != null ? <span data-copy="level" className="block font-mono font-normal normal-case tracking-normal">of {fmtInt(m.n)}</span> : null}
                  </th>
                ))
                : data.period === 'week'
                  ? <><th scope="col" className={cn(TH, 'text-right')}>This week</th><th scope="col" className={cn(TH, 'text-right')}>{data.month.text}</th></>
                  : <><th scope="col" className={cn(TH, 'text-right')}>Videos</th><th scope="col" className={cn(TH, 'text-right')}>Against {data.month.prev.text}</th></>}
            </tr>
          </thead>
          <tbody>
            {table.rows.map(({ conv, href, open }) => (
              <RowWithPanel key={conv.id} conv={conv} href={href} open={open} data={data} table={table} cols={cols} />
            ))}
          </tbody>
        </table>
      </div>
      {table.showAllHref || shown < table.total ? (
        <div className="flex flex-wrap gap-2.5">
          {table.showAllHref ? (
            <Link href={table.showAllHref} scroll={false} className="inline-flex min-h-[38px] cursor-pointer items-center rounded-lg bg-inner px-3.5 text-[13.5px] font-semibold text-foreground no-underline hover:bg-track">
              Show all <span data-copy="figure" className="ml-1">{fmtInt(table.total)}</span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function RowWithPanel({ conv, href, open, data, table, cols }: { conv: MarketConv; href: string; open: boolean; data: MarketData; table: MarketTable; cols: number }) {
  const time = data.period === 'time'
  return (
    <>
      <tr id={`conv-${conv.id}`} className={cn('scroll-mt-6', open ? 'bg-accent/50' : null)}>
        <td className={TD}>
          <span className="inline-flex flex-wrap items-center gap-2">
            <Link href={href} scroll={false} aria-current={open ? 'true' : undefined} className="font-medium text-foreground no-underline underline-offset-[3px] hover:underline">
              <span data-copy="subject" data-slot="pass_b_theme">{conv.label}</span>
            </Link>
            {data.period === 'week' ? <ConvChip flag={null} isNew={conv.isNew} id={conv.id} label={conv.label} k={conv.month ?? conv.week ?? 0} n={data.month.category ?? 0} month={data.month.month} /> : null}
          </span>
        </td>
        <td className={cn(TD, 'text-muted-foreground')}>{conv.subjectName ?? ''}</td>
        {time ? null : <td className={TD}>{conv.who.length > 0 ? <About parts={conv.who} brand={data.brand} noun={data.noun} /> : null}</td>}
        <Cells conv={conv} data={data} table={table} />
      </tr>
      {open && data.panel && data.panel.id === conv.id ? (
        <tr>
          <td colSpan={cols} className="py-4">
            <ConversationPanel panel={data.panel} data={data} />
          </td>
        </tr>
      ) : null}
    </>
  )
}
