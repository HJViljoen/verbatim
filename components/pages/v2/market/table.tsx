import Link from 'next/link'
import { MovementBadge } from '@/components/delta-badge'
import { CARD, TBL, TD as KIT_TD, TD_NUM, TH as KIT_TH } from '@/components/v2'
import { CHIP, CHIP_ON, ROW } from '@/components/v2/look'
import { fmtInt, longMonth } from '@/lib/format'
import type { MarketConv, MarketData, MarketTable } from '@/lib/pages/v2/market'
import { cn } from '@/lib/utils'
import { ABOUT_NOT_COUNTED, ABOUT_NOT_READ, BrandsNamed, ConvChip, SetApartTag } from './parts'
import { BRANDS_NOT_COUNTED, BRANDS_NOT_READ } from '@/lib/pages/v2/voices'

// EVERY CONVERSATION, drawn to the audit design's board (Market.dc.html, 7
// Nov): the period's conversations at three of the category's videos or
// more, biggest first, filterable by subject (`?in=`, links, so a filter is
// an address, drawn as the board's chips with their counts in brackets),
// ten shown until "Show all". Sentence-case heads, horizontal rules only,
// tabular numbers. This week a row's week count stands beside its month's;
// this month the last column is the month against the month before (the one
// `Verdict` badge; nothing where the pair is refused); over time the columns
// are the months. "Brands named" says who each conversation's videos name
// ("Ottobock (1), others (10)", or "None"). The table's line says once where
// nothing new surfaced this week (from the removed "Also this week").
//
// A ROW OPENS ITS CONVERSATION'S PAGE (17 Oct): nothing opens in place.
//
// ON A PHONE (F2-Market-Phone, ruling 4) the table is a two-line list: the
// name and its videos, then its subject and, at the right, the month the week
// sits beside (decision 1) or the month's verdict; no brands. Nothing
// passes the right edge at 390.

const TH = cn(KIT_TH, 'whitespace-nowrap pr-3')
const TD = cn(KIT_TD, 'py-3 pr-3 align-middle')

/** The Subject column's header where no conversation is in a subject yet. */
export const SUBJECT_NONE = 'none yet'
/** A conversation no subject holds (the board's words). */
export const SUBJECT_NOT_ASSIGNED = 'Not assigned'

/** The table's line where nothing was first heard this week (the board's). */
export const TABLE_NOTHING_NEW = 'Nothing new surfaced this week.'
export const TABLE_NOTHING_ELSE_NEW = 'Nothing else new surfaced this week.'

/** A column header's quiet note, in brackets in the header's own line: the
 *  reason its cells are empty, said once. */
function HeadNote({ children }: { children: string }) {
  return <span className="ml-1 font-normal text-muted-foreground/80">({children})</span>
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
          return <td key={m.month} className={cn(TD, TD_NUM)}>{point?.k != null ? <span data-copy="figure">{fmtInt(point.k)}</span> : ''}</td>
        })}
      </>
    )
  }
  if (data.period === 'week') {
    return (
      <>
        <td className={cn(TD, TD_NUM, 'font-semibold')}>{conv.week != null ? <span data-copy="figure">{fmtInt(conv.week)}</span> : ''}</td>
        <td className={cn(TD, TD_NUM, 'pr-0 text-secondary-foreground')}>{conv.month != null ? <span data-copy="figure">{fmtInt(conv.month)}</span> : ''}</td>
      </>
    )
  }
  return (
    <>
      <td className={cn(TD, TD_NUM)}>{conv.month != null ? <span data-copy="figure">{fmtInt(conv.month)}</span> : ''}</td>
      <td className={cn(TD, 'pr-0 text-right text-[13px]')}><span data-copy="verdict"><MovementBadge verdict={conv.monthVerdict} unit="pts" good="neutral" bandTip /></span></td>
    </>
  )
}

/** The name, with the chip it earned this week ("New", the reader flag) and
 *  a set-apart conversation's tag. The link says where it goes by its own
 *  words; no arrow (the audit design). */
function Name({ conv, href, data }: { conv: MarketConv; href: string; data: MarketData }) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <Link href={href} className={cn(ROW, 'min-w-0')}>
        <span data-copy="subject" data-slot="pass_b_theme">{conv.label}</span>
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
      <span className="text-right text-[14.5px] font-semibold tabular-nums">{count != null ? <span data-copy="figure">{fmtInt(count)}</span> : ''}</span>
      {/* The second line spans the row, so the month never narrows the name. */}
      <span className="col-span-2 flex min-w-0 items-baseline justify-between gap-3 text-[13px] text-muted-foreground">
        {/* A subject's page lists its own conversations: there the left of
            the second line says who each is about (F2-Market-Subject-Phone);
            the top page's list carries no About chips (ruling 4). */}
        <span className="min-w-0">{subjects ? conv.subjectName ?? SUBJECT_NOT_ASSIGNED : conv.who.length > 0 && data.brands === 'counted' ? <BrandsNamed parts={conv.who} brand={data.brand} noun={data.noun} /> : ''}</span>
        <span className="shrink-0 whitespace-nowrap">
          {data.period === 'week'
            ? conv.month != null ? <><span data-copy="figure" className="tabular-nums">{fmtInt(conv.month)}</span> {data.week?.inMonth ?? `in ${data.month.text}`}</> : null
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
export function ConversationRows({ rows, data, months = [], subjects = true, hasSubjects = true }: {
  rows: readonly { conv: MarketConv; href: string }[]
  data: MarketData
  months?: MarketTable['months']
  /** Draw the Subject column (the top page). */
  subjects?: boolean
  /** IGNORED since the audit design (no arrow after a name); the subject's
   *  page stops passing it in its own task. */
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
        <table className={cn(TBL, time ? 'min-w-[560px]' : null)}>
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
                  Brands named{data.brands === 'counted' ? null : <HeadNote>{data.brands === 'not_counted' ? ABOUT_NOT_COUNTED : ABOUT_NOT_READ}</HeadNote>}
                </th>
              ) : null}
              {time
                ? months.map((m) => (
                  <th key={m.month} scope="col" className={cn(TH, 'text-right')}>
                    {longMonth(m.month).slice(0, 3)}{m.filling ? ' so far' : ''}
                    {m.n != null ? <span data-copy="level" className="block font-normal tabular-nums">of {fmtInt(m.n)}</span> : null}
                  </th>
                ))
                : data.period === 'week'
                  ? <><th scope="col" className={cn(TH, 'text-right')}>This week</th><th scope="col" className={cn(TH, 'pr-0 text-right')}>{data.month.text}</th></>
                  : <><th scope="col" className={cn(TH, 'text-right')}>Videos</th><th scope="col" className={cn(TH, 'pr-0 text-right')}>Against {data.month.prev.text}</th></>}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ conv, href }) => (
              <tr key={conv.id} id={`conv-${conv.id}`} className="scroll-mt-6">
                <td className={TD}><Name conv={conv} href={href} data={data} /></td>
                {subjects ? <td className={cn(TD, 'max-lg:hidden', conv.subjectName ? null : 'text-muted-foreground')}>{conv.subjectName ?? SUBJECT_NOT_ASSIGNED}</td> : null}
                {about ? <td className={cn(TD, 'max-lg:hidden')}>{data.brands === 'counted' ? <BrandsNamed parts={conv.who} brand={data.brand} noun={data.noun} /> : null}</td> : null}
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

/** The table's line where nothing was first heard this week: from the
 *  week's "new" side (the removed "Also this week"'s third place). Null on
 *  another period, or where something was. */
export function tableNothingNew(data: MarketData): string | null {
  if (data.period !== 'week') return null
  const side = data.top.sides.find((x) => x.kind === 'new_list')
  if (!side || side.convs.length > 0) return null
  return side.anyNew ? TABLE_NOTHING_ELSE_NEW : TABLE_NOTHING_NEW
}

export function ConversationTable({ table, data }: { table: MarketTable; data: MarketData }) {
  const time = data.period === 'time'
  const shown = table.rows.length
  const nothingNew = tableNothingNew(data)
  return (
    <section id="conversations" aria-labelledby="conversations-title" className={cn(CARD, 'mt-[26px] scroll-mt-6')}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="conversations-title" className="m-0 text-[21px] leading-[1.3] font-semibold text-foreground">{title(data)}</h2>
        <p className="m-0 text-[14px] leading-[1.45] text-muted-foreground">
          {table.totalHeld ? 'Conversations' : <><span data-copy="figure">{fmtInt(table.total)}</span> conversations</>}, biggest first, counted in the category’s videos
        </p>
      </div>
      {nothingNew ? <p data-nothing-new="" className="m-0 text-[14.5px] leading-[1.5] text-secondary-foreground">{nothingNew}</p> : null}
      {table.filters.length > 0 ? (
        <nav aria-label="Filter by subject" className="flex flex-wrap gap-2">
          {table.filters.map((f) => {
            const on = f.id === table.filter
            return (
              <Link
                key={f.id ?? 'all'}
                href={f.href}
                scroll={false}
                aria-current={on ? 'page' : undefined}
                className={cn(CHIP, 'no-underline', on ? CHIP_ON : null)}
              >
                {f.name}{f.count != null ? <> (<span data-copy="figure">{fmtInt(f.count)}</span>)</> : null}
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
            <Link href={table.showAllHref} scroll={false} className={cn(CHIP, 'h-10 font-semibold no-underline')}>
              Show all{table.totalHeld ? null : <span data-copy="figure" className="ml-1">{fmtInt(table.total)}</span>}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
