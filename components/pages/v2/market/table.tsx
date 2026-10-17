import Link from 'next/link'
import { List } from 'lucide-react'
import { MovementBadge } from '@/components/delta-badge'
import { CARD, CardHead } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import type { MarketConv, MarketData, MarketTable } from '@/lib/pages/v2/market'
import { cn } from '@/lib/utils'
import { About, ABOUT_NOT_COUNTED, ABOUT_NOT_READ, ConvChip, SetApartTag } from './parts'
import { BRANDS_NOT_COUNTED, BRANDS_NOT_READ } from '@/lib/pages/v2/voices'

// EVERY CONVERSATION (depth v2, T3; E2-Market's table, F2-Market's full-width
// one): the period's conversations at three of the category's videos or more,
// biggest first, filterable by subject (`?in=`, links, so a filter is an
// address), ten shown until "Show all". This week a row's week count stands
// beside its month's; this month the last column is the month against the
// month before (the one `Verdict` badge; nothing where the pair is refused);
// over time the columns are the months. The board's "Against usual" column is
// not drawn: no rule reads a week against a usual week (decision 1).
//
// A ROW OPENS ITS CONVERSATION'S PAGE (17 Oct): nothing opens in place.
//
// ON A PHONE (F2-Market-Phone, ruling 4) the table is a two-line list: the
// name and its videos, then its subject and, at the right, the month the week
// sits beside (decision 1) or the month's verdict; no About chips. Nothing
// passes the right edge at 390.

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

function Cells({ conv, data, months }: { conv: MarketConv; data: MarketData; months: MarketTable['months'] }) {
  if (data.period === 'time') {
    return (
      <>
        {months.map((m) => {
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

/** The name, with the chip it earned this week ("New", the reader flag) and
 *  a set-apart conversation's tag. */
function Name({ conv, href, data, arrow = false }: { conv: MarketConv; href: string; data: MarketData; arrow?: boolean }) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <Link href={href} className="min-w-0 font-medium text-foreground no-underline underline-offset-[3px] hover:underline">
        <span data-copy="subject" data-slot="pass_b_theme">{conv.label}</span>
        {arrow ? <span aria-hidden className="text-muted-foreground"> →</span> : null}
      </Link>
      {data.period === 'week' ? <ConvChip flag={null} isNew={conv.isNew} id={conv.id} label={conv.label} k={conv.month ?? conv.week ?? 0} n={data.month.category ?? 0} month={data.month.month} /> : null}
      <SetApartTag setApart={conv.setApart} />
    </span>
  )
}

/** The phone's two-line row: the name and its videos, then its subject and
 *  the month (this week) or the month's verdict. */
function PhoneRow({ conv, href, data, subjects }: { conv: MarketConv; href: string; data: MarketData; subjects: boolean }) {
  const count = data.period === 'week' ? conv.week : data.period === 'time' ? conv.months[conv.months.length - 1]?.k ?? null : conv.month
  return (
    <div data-phone-row="" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-[3px] border-t border-track py-[11px] first:border-t-0 first:pt-0">
      <span className="min-w-0 text-[14px]"><Name conv={conv} href={href} data={data} /></span>
      <span className="text-right font-mono text-[13.5px] tabular-nums">{count != null ? <span data-copy="figure">{fmtInt(count)}</span> : ''}</span>
      {/* The second line spans the row, so the month never narrows the name. */}
      <span className="col-span-2 flex min-w-0 items-baseline justify-between gap-3 text-[12.5px] text-muted-foreground">
        <span className="min-w-0">{subjects ? conv.subjectName ?? '' : ''}</span>
        <span className="shrink-0 whitespace-nowrap">
          {data.period === 'week'
            ? conv.month != null ? <><span data-copy="figure" className="font-mono">{fmtInt(conv.month)}</span> {data.week?.inMonth ?? `in ${data.month.text}`}</> : null
            : data.period === 'month' ? <span data-copy="verdict"><MovementBadge verdict={conv.monthVerdict} unit="pts" good="neutral" bandTip /></span> : null}
        </span>
      </span>
    </div>
  )
}

/**
 * Conversation rows as a table from 640 and a two-line list on a phone: the
 * top page's every conversation, and a subject's page's biggest three
 * (`subjects` false there: every row is that subject's).
 */
export function ConversationRows({ rows, data, months = [], subjects = true, arrows = false, hasSubjects = true }: {
  rows: readonly { conv: MarketConv; href: string }[]
  data: MarketData
  months?: MarketTable['months']
  /** Draw the Subject column (the top page). */
  subjects?: boolean
  /** A "→" after each name (a subject's page: each opens as its own page). */
  arrows?: boolean
  /** Whether any conversation has a subject: the column's header says
   *  "none yet" where none does. */
  hasSubjects?: boolean
}) {
  const time = data.period === 'time'
  const about = !time
  return (
    <>
      <div className="max-sm:hidden">
        <table className={cn('w-full border-collapse text-[14px]', time ? 'min-w-[560px]' : null)}>
          <thead>
            <tr>
              <th scope="col" className={TH}>Conversation</th>
              {/* THE BOARD'S COLUMNS IN EVERY STATE (the parity pass, 13 Oct):
                  Subject and About stay; where no conversation is in a subject,
                  or brands are not counted, the header says so once and the
                  cells stay empty. */}
              {subjects ? <th scope="col" className={cn(TH, 'max-lg:hidden')}>Subject{hasSubjects ? null : <HeadNote>{SUBJECT_NONE}</HeadNote>}</th> : null}
              {about ? (
                <th scope="col" className={cn(TH, 'max-lg:hidden')} title={data.brands === 'counted' ? undefined : data.brands === 'not_counted' ? BRANDS_NOT_COUNTED : BRANDS_NOT_READ}>
                  About{data.brands === 'counted' ? null : <HeadNote>{data.brands === 'not_counted' ? ABOUT_NOT_COUNTED : ABOUT_NOT_READ}</HeadNote>}
                </th>
              ) : null}
              {time
                ? months.map((m) => (
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
            {rows.map(({ conv, href }) => (
              <tr key={conv.id} id={`conv-${conv.id}`} className="scroll-mt-6 [&:last-child>td]:border-b-0">
                <td className={TD}><Name conv={conv} href={href} data={data} arrow={arrows} /></td>
                {subjects ? <td className={cn(TD, 'text-muted-foreground max-lg:hidden')}>{conv.subjectName ?? ''}</td> : null}
                {about ? <td className={cn(TD, 'max-lg:hidden')}>{conv.who.length > 0 && data.brands === 'counted' ? <About parts={conv.who} brand={data.brand} noun={data.noun} /> : null}</td> : null}
                <Cells conv={conv} data={data} months={months} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col sm:hidden">
        {rows.map(({ conv, href }) => <PhoneRow key={conv.id} conv={conv} href={href} data={data} subjects={subjects} />)}
      </div>
    </>
  )
}

export function ConversationTable({ table, data }: { table: MarketTable; data: MarketData }) {
  const time = data.period === 'time'
  const shown = table.rows.length
  return (
    <section id="conversations" aria-labelledby="conversations-title" className={cn(CARD, 'scroll-mt-6')}>
      <CardHead
        icon={List}
        id="conversations-title"
        title={title(data)}
        sub={<>{table.totalHeld ? 'Conversations' : <><span data-copy="figure">{fmtInt(table.total)}</span> conversations</>}, biggest first, each counted in the category’s videos{data.period === 'week' && data.week?.category != null ? <> (<span data-copy="figure">{fmtInt(data.week.category)}</span> this week)</> : data.month.category != null ? <> (<span data-copy="figure">{fmtInt(data.month.category)}</span> in {data.month.text})</> : null}</>}
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
      {/* Over time, the months' columns scroll sideways inside the card; the
          page never does. */}
      <div className={time ? '-mx-1 overflow-x-auto px-1' : undefined}>
        <ConversationRows rows={table.rows} data={data} months={table.months} hasSubjects={table.subjects} />
      </div>
      {table.showAllHref || shown < table.total ? (
        <div className="flex flex-wrap gap-2.5">
          {table.showAllHref ? (
            <Link href={table.showAllHref} scroll={false} className="inline-flex min-h-[38px] cursor-pointer items-center rounded-lg bg-inner px-3.5 text-[13.5px] font-semibold text-foreground no-underline hover:bg-track">
              Show all{table.totalHeld ? null : <span data-copy="figure" className="ml-1">{fmtInt(table.total)}</span>}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
