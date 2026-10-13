import Link from 'next/link'
import { List } from 'lucide-react'
import { MovementBadge } from '@/components/delta-badge'
import { CARD, CardHead } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import type { MarketConv, MarketData, MarketTable } from '@/lib/pages/v2/market'
import { cn } from '@/lib/utils'
import { ConversationPanel } from './panel'
import { About, ABOUT_NOT_COUNTED, ABOUT_NOT_READ, ConvChip, SetApartTag } from './parts'
import { BRANDS_NOT_COUNTED, BRANDS_NOT_READ } from '@/lib/pages/v2/voices'

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

/** The Subject column's header where no conversation is in a subject yet. */
export const SUBJECT_NONE = 'none yet'

/** A column header's quiet note, in the header's own line: the reason its
 *  cells are empty, said once. */
function HeadNote({ children }: { children: string }) {
  return <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground/80">· {children}</span>
}

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
    // ON A PHONE THE MONTH SITS UNDER THE WEEK, IN ITS CELL (Content's Also
    // asked, T9; Phase 4 fix round): two figure columns beside a label did not
    // fit 390 on Sealand, and the table's own scroll cut "42" to "4" at the
    // card's edge. The week stays beside its month (decision 1).
    return (
      <>
        <td className={cn(TD, 'text-right font-mono tabular-nums')}>
          {conv.week != null ? <span data-copy="figure">{fmtInt(conv.week)}</span> : ''}
          {conv.month != null ? <span className="block whitespace-nowrap font-sans text-[12px] leading-[1.35] text-muted-foreground sm:hidden"><span data-copy="figure" className="font-mono">{fmtInt(conv.month)}</span> in {data.month.text}</span> : null}
        </td>
        <td className={cn(TD, 'hidden text-right font-mono tabular-nums text-muted-foreground sm:table-cell')}>{conv.month != null ? <span data-copy="figure">{fmtInt(conv.month)}</span> : ''}</td>
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
  // THE BOARD'S COLUMNS IN EVERY STATE (the parity pass, 13 Oct): Subject and
  // About stay; where no conversation is in a subject, or brands are not
  // counted, the header says so once and the cells stay empty.
  const subjects = true
  const about = !time
  const cols = 1 + (subjects ? 1 : 0) + (time ? table.months.length : (about ? 1 : 0) + 2)
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
                {f.name}{f.count != null ? <> <span data-copy="figure">{fmtInt(f.count)}</span></> : null}
              </Link>
            )
          })}
        </nav>
      ) : null}
      {/* A query container, so an open conversation's row can hold its panel
          to the scroller's visible width (T9: month by month, the table
          scrolls sideways on a phone, and the panel would scroll with it). */}
      <div className="@container -mx-1 overflow-x-auto px-1">
        <table className={cn('w-full border-collapse text-[14px]', time ? 'min-w-[560px]' : null)}>
          <thead>
            <tr>
              <th scope="col" className={TH}>Conversation</th>
              {subjects ? <th scope="col" className={cn(TH, 'max-lg:hidden')}>Subject{table.subjects ? null : <HeadNote>{SUBJECT_NONE}</HeadNote>}</th> : null}
              {about ? (
                <th scope="col" className={cn(TH, 'max-lg:hidden')} title={data.brands === 'counted' ? undefined : data.brands === 'not_counted' ? BRANDS_NOT_COUNTED : BRANDS_NOT_READ}>
                  About{data.brands === 'counted' ? null : <HeadNote>{data.brands === 'not_counted' ? ABOUT_NOT_COUNTED : ABOUT_NOT_READ}</HeadNote>}
                </th>
              ) : null}
              {time
                ? table.months.map((m) => (
                  <th key={m.month} scope="col" className={cn(TH, 'text-right')}>
                    {longMonth(m.month).slice(0, 3)}{m.filling ? ' so far' : ''}
                    {m.n != null ? <span data-copy="level" className="block font-mono font-normal normal-case tracking-normal">of {fmtInt(m.n)}</span> : null}
                  </th>
                ))
                : data.period === 'week'
                  ? <><th scope="col" className={cn(TH, 'text-right')}>This week</th><th scope="col" className={cn(TH, 'hidden text-right sm:table-cell')}>{data.month.text}</th></>
                  : <><th scope="col" className={cn(TH, 'text-right')}>Videos</th><th scope="col" className={cn(TH, 'text-right')}>Against {data.month.prev.text}</th></>}
            </tr>
          </thead>
          <tbody>
            {table.rows.map(({ conv, href, open }) => (
              <RowWithPanel key={conv.id} conv={conv} href={href} open={open} data={data} table={table} cols={cols} subjects={subjects} about={about} />
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

function RowWithPanel({ conv, href, open, data, table, cols, subjects, about }: {
  conv: MarketConv; href: string; open: boolean; data: MarketData; table: MarketTable; cols: number; subjects: boolean; about: boolean
}) {
  return (
    <>
      <tr id={`conv-${conv.id}`} className={cn('scroll-mt-6', open ? 'bg-accent/50' : null)}>
        <td className={TD}>
          <span className="inline-flex flex-wrap items-center gap-2">
            <Link href={href} scroll={false} aria-current={open ? 'true' : undefined} className="font-medium text-foreground no-underline underline-offset-[3px] hover:underline">
              <span data-copy="subject" data-slot="pass_b_theme">{conv.label}</span>
            </Link>
            {data.period === 'week' ? <ConvChip flag={null} isNew={conv.isNew} id={conv.id} label={conv.label} k={conv.month ?? conv.week ?? 0} n={data.month.category ?? 0} month={data.month.month} /> : null}
            <SetApartTag setApart={conv.setApart} />
          </span>
        </td>
        {subjects ? <td className={cn(TD, 'text-muted-foreground max-lg:hidden')}>{conv.subjectName ?? ''}</td> : null}
        {about ? <td className={cn(TD, 'max-lg:hidden')}>{conv.who.length > 0 && data.brands === 'counted' ? <About parts={conv.who} brand={data.brand} noun={data.noun} /> : null}</td> : null}
        <Cells conv={conv} data={data} table={table} />
      </tr>
      {open && data.panel && data.panel.id === conv.id ? (
        <tr>
          <td colSpan={cols} className="py-4">
            {/* The scroller's width, held at its left edge: the panel never
                runs wider than what shows, nor scrolls out of view with the
                table's columns. */}
            <div className="sticky left-0 w-[100cqw]">
              <ConversationPanel panel={data.panel} data={data} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}
