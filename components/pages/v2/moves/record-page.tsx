import Link from 'next/link'
import type { ReactNode } from 'react'

import { CARD, EmptyBox, GoLink, TBL, TD, TD_NUM, TH, type StatItem } from '@/components/v2'
import { CHIP, ROW } from '@/components/v2/look'
import { typeLabel } from '@/components/pages/moves/words'
import { fmtInt, shortDate } from '@/lib/format'
import { adviceHref, UNTITLED_ADVICE } from '@/lib/pages/v2/moves'
import { ASK_RECORD_HREF, recordAllHref, recordState, type RecordGroup, type RecordPageData } from '@/lib/pages/v2/moves-levels'
import { RECORD_GONE_ANCHOR } from '@/lib/pages/v2/moves-address'
import { cn } from '@/lib/utils'

// THE ADVICE RECORD, AN INDEX (board G6-Moves-Record; decision 1; since the
// audit design, 7 Nov, Moves-AdviceList.dc.html): the figures row, then three
// tiles, every piece of advice once in a table, grouped by what was decided:
// waiting for a decision, decided, no longer raised (six, then "Show the
// other N", an address: `?all=1`). Each row opens its piece's page; "raised
// by the latest update" is said once in a group's head. Then the Agent.

/** The words of a group with no row. */
export const RECORD_GROUP_EMPTY: Record<RecordGroup['key'], string> = {
  waiting: 'Nothing is waiting for a decision.',
  decided: 'Nothing has been decided on yet.',
  gone: 'Every piece of advice so far is still being raised.',
}

/** Over the pieces folded into the advice waiting: named, never counted as
 *  waiting on their own (`RecordGroup.also`). */
export const RECORD_SAME_IDEA_HEAD = 'Also raised by the latest update, the same idea as one above in other words:'

const fig = (n: number) => <span data-copy="figure">{fmtInt(n)}</span>

/** "Not decided", "Accepted since 28 Sep": the record's state with its first
 *  word capitalised on screen (the lib's words, which the hub's line shares,
 *  are untouched). */
const stateWords = (s: string): string => `${s.charAt(0).toUpperCase()}${s.slice(1)}`

function RecordRowView({ r }: { r: RecordGroup['rows'][number] }) {
  const untitled = r.title === UNTITLED_ADVICE
  const state = r.note ?? recordState(r)
  return (
    <tr data-record-row="">
      <td className={TD}>
        <Link href={adviceHref(r.lineageId)} className={ROW}>
          {untitled ? r.title : <span data-copy="stored" data-slot="pass_d_b_recommendation">{r.title}</span>}
        </Link>
      </td>
      <td className={cn(TD, 'text-secondary-foreground')}>{typeLabel(r.kind)}</td>
      <td className={cn(TD, 'whitespace-nowrap')}>{r.firstMade ? shortDate(r.firstMade) : null}</td>
      <td className={cn(TD, TD_NUM)}>{fig(r.updates)}</td>
      <td className={cn(TD, 'whitespace-nowrap pl-6 pr-0', r.status === 'new' ? 'text-muted-foreground' : 'font-semibold text-foreground')}>{stateWords(state)}</td>
    </tr>
  )
}

/** A group's note: its count, and where its rows were raised by the latest
 *  update, that said once ("5, all raised by the latest update"), never on
 *  each row. */
function groupNote(g: RecordGroup): ReactNode {
  const total = g.rows.length + g.hidden
  const current = g.rows.filter((r) => r.current).length
  if (current === 0) return fig(total)
  if (current === total) return <>{fig(total)}, {total === 1 ? 'raised' : 'all raised'} by the latest update</>
  return <>{fig(total)}, {fig(current)} raised by the latest update</>
}

function GroupCard({ g }: { g: RecordGroup }) {
  return (
    <section id={g.key === 'gone' ? RECORD_GONE_ANCHOR : undefined} aria-labelledby={`record-${g.key}`} data-record-group={g.key} className={cn(CARD, 'scroll-mt-6 gap-3.5')}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`record-${g.key}`} className="m-0 text-[21px] font-semibold leading-[1.3] text-foreground">{g.title}</h2>
        <span className="text-[14px] text-muted-foreground">{groupNote(g)}</span>
      </div>
      {g.rows.length === 0 ? (
        <EmptyBox>{RECORD_GROUP_EMPTY[g.key]}</EmptyBox>
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <table className={cn(TBL, 'min-w-[660px]')}>
            <thead>
              <tr>
                <th scope="col" className={TH}>Advice</th>
                <th scope="col" className={cn(TH, 'w-[190px]')}>Kind</th>
                <th scope="col" className={cn(TH, 'w-[130px]')}>First suggested</th>
                <th scope="col" className={cn(TH, 'w-20 text-right')}>Updates</th>
                <th scope="col" className={cn(TH, 'w-[200px] pl-6 pr-0')}>Decision</th>
              </tr>
            </thead>
            <tbody>{g.rows.map((r) => <RecordRowView key={r.lineageId} r={r} />)}</tbody>
          </table>
        </div>
      )}
      {g.also && g.also.length > 0 ? (
        <div data-record-same="" className="flex flex-col gap-1 border-t border-track pt-3">
          <p className="m-0 text-[14px] text-muted-foreground">{RECORD_SAME_IDEA_HEAD}</p>
          {g.also.map((r) => (
            <Link key={r.lineageId} href={adviceHref(r.lineageId)} className="self-start text-[14.5px] leading-[1.45] text-foreground underline decoration-control underline-offset-[3px] hover:decoration-foreground">
              {r.title === UNTITLED_ADVICE ? r.title : <span data-copy="stored" data-slot="pass_d_b_recommendation">{r.title}</span>}
            </Link>
          ))}
        </div>
      ) : null}
      {g.hidden > 0 ? (
        <Link href={recordAllHref()} className={cn(CHIP, 'h-10 self-start font-semibold no-underline')}>Show the other <span data-copy="figure" className="ml-1">{fmtInt(g.hidden)}</span></Link>
      ) : null}
    </section>
  )
}

export function RecordPageBody({ page }: { page: RecordPageData }) {
  return (
    <>
      {page.groups.map((g) => <GroupCard key={g.key} g={g} />)}
      <section aria-label="Ask the Agent" className={cn(CARD, 'flex-row flex-wrap items-center justify-between gap-5 max-sm:gap-3')}>
        <p className="m-0 min-w-0 flex-[1_1_420px] text-[15.5px] leading-[1.55] text-secondary-foreground">Ask what we have advised over time, and what came of what you decided.</p>
        <GoLink href={ASK_RECORD_HREF}>Ask the Agent about the advice record</GoLink>
      </section>
    </>
  )
}

/** The figures row (the board's `.strip`): every piece of advice since the
 *  first, how many you have decided on, how many wait, and how many the
 *  latest updates no longer raise. Pure. */
export function recordStats(page: RecordPageData): StatItem[] {
  const gone = page.groups.find((g) => g.key === 'gone')
  return [
    { key: 'total', term: page.since ? `Advice since ${shortDate(page.since)}` : 'Advice so far', value: <>{fig(page.total)} {page.total === 1 ? 'piece' : 'pieces'}</> },
    { key: 'decided', term: 'You have decided on', value: fig(page.decided) },
    { key: 'waiting', term: 'Waiting for a decision', value: fig(page.waiting) },
    { key: 'gone', term: 'No longer raised', value: fig(gone ? gone.rows.length + gone.hidden : 0) },
  ]
}
