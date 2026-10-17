import Link from 'next/link'
import { Sparkles } from 'lucide-react'

import { CARD } from '@/components/v2'
import { typeLabel } from '@/components/pages/moves/words'
import { ASK } from '@/components/pages/v2/market/panel'
import { fmtInt, shortDate } from '@/lib/format'
import { adviceHref, UNTITLED_ADVICE } from '@/lib/pages/v2/moves'
import { ASK_RECORD_HREF, recordAllHref, recordState, type RecordGroup, type RecordPageData } from '@/lib/pages/v2/moves-levels'
import { RECORD_GONE_ANCHOR } from '@/lib/pages/v2/moves-address'
import { cn } from '@/lib/utils'
import { MovesKindTile } from './level-tiles'
import { MONO } from './parts'

// THE ADVICE RECORD, AN INDEX (board G6-Moves-Record; decision 1): no header
// card, three plain list cards, every piece of advice once, grouped by what
// was decided: waiting for a decision, decided, no longer raised (six, then
// "Show the other N", an address: `?all=1`). Each row opens its piece's page.
// Then the Agent.

/** The words of a group with no row. */
export const RECORD_GROUP_EMPTY: Record<RecordGroup['key'], string> = {
  waiting: 'Nothing is waiting for a decision.',
  decided: 'Nothing has been decided on yet.',
  gone: 'Every piece of advice so far is still being raised.',
}

/** Over the pieces folded into the advice waiting: named, never counted as
 *  waiting on their own (`RecordGroup.also`). */
export const RECORD_SAME_IDEA_HEAD = 'Also raised by the latest update, the same idea as one above in other words:'

const MORE = 'inline-flex min-h-[38px] cursor-pointer items-center justify-center self-start rounded-lg bg-card px-3.5 text-[13.5px] font-semibold text-foreground no-underline ring-1 ring-border hover:bg-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function RecordRowView({ r, first }: { r: RecordGroup['rows'][number]; first: boolean }) {
  const untitled = r.title === UNTITLED_ADVICE
  const meta = [typeLabel(r.kind), r.firstMade ? `first suggested ${shortDate(r.firstMade)}` : null, `${fmtInt(r.updates)} ${r.updates === 1 ? 'update' : 'updates'}`, r.current ? 'raised by the latest update' : null].filter(Boolean).join(' · ')
  const state = r.note ?? recordState(r)
  return (
    <li data-record-row="" className={cn('grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 py-[13px] max-sm:grid-cols-[minmax(0,1fr)] max-sm:items-start max-sm:gap-y-1.5', first ? null : 'border-t border-track')}>
      <MovesKindTile level="advice" className="max-sm:hidden" />
      <div className="min-w-0">
        <Link href={adviceHref(r.lineageId)} className="text-[14.5px] font-medium leading-[1.4] text-foreground no-underline underline-offset-[3px] hover:underline">
          {untitled ? r.title : <span data-copy="stored" data-slot="pass_d_b_recommendation">{r.title}</span>}
        </Link>
        <span className={cn(MONO, 'mt-[3px] block text-[12px] leading-[1.45] text-muted-foreground')}>{meta}</span>
      </div>
      <span className={cn('whitespace-nowrap text-right text-[12.5px] max-sm:text-left', r.status === 'new' ? 'text-muted-foreground' : 'font-semibold text-foreground')}>{state}</span>
    </li>
  )
}

function GroupCard({ g }: { g: RecordGroup }) {
  const total = g.rows.length + g.hidden
  return (
    <section id={g.key === 'gone' ? RECORD_GONE_ANCHOR : undefined} aria-labelledby={`record-${g.key}`} data-record-group={g.key} className={cn(CARD, 'scroll-mt-6 gap-1 px-[26px] pt-[22px] pb-3 max-sm:px-[18px] max-sm:pt-4 max-sm:pb-2')}>
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2.5">
        <h2 id={`record-${g.key}`} className="m-0 text-[17px] font-semibold text-foreground">{g.title}</h2>
        <span data-copy="figure" className={cn(MONO, 'text-[12.5px] text-muted-foreground')}>{fmtInt(total)}</span>
      </div>
      {g.rows.length === 0 ? (
        <p className="m-0 py-[13px] text-[14px] text-muted-foreground">{RECORD_GROUP_EMPTY[g.key]}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {g.rows.map((r, i) => <RecordRowView key={r.lineageId} r={r} first={i === 0} />)}
        </ol>
      )}
      {g.also && g.also.length > 0 ? (
        <div data-record-same="" className="flex flex-col gap-1 border-t border-track pt-2.5 pb-2.5">
          <p className="m-0 text-[12.5px] text-muted-foreground">{RECORD_SAME_IDEA_HEAD}</p>
          {g.also.map((r) => (
            <Link key={r.lineageId} href={adviceHref(r.lineageId)} className="text-[13px] leading-[1.45] text-secondary-foreground no-underline underline-offset-[3px] hover:underline">
              {r.title === UNTITLED_ADVICE ? r.title : <span data-copy="stored" data-slot="pass_d_b_recommendation">{r.title}</span>}
            </Link>
          ))}
        </div>
      ) : null}
      {g.hidden > 0 ? (
        <Link href={recordAllHref()} className={cn(MORE, 'mt-1.5 mb-2')}>Show the other <span data-copy="figure" className="ml-1">{fmtInt(g.hidden)}</span></Link>
      ) : null}
    </section>
  )
}

export function RecordPageBody({ page }: { page: RecordPageData }) {
  return (
    <>
      {page.groups.map((g) => <GroupCard key={g.key} g={g} />)}
      <section aria-label="Ask the Agent" className={cn(CARD, 'flex-row flex-wrap items-center justify-between gap-3.5 px-[26px] py-5 max-sm:hidden')}>
        <p className="m-0 text-[14.5px] text-secondary-foreground">Ask what we have advised over time, and what came of what you decided.</p>
        <Link href={ASK_RECORD_HREF} className={ASK}><Sparkles className="size-3.5" aria-hidden />Ask the Agent about the advice record</Link>
      </section>
      <Link href={ASK_RECORD_HREF} className={cn(ASK, 'justify-center sm:hidden')}><Sparkles className="size-3.5" aria-hidden />Ask the Agent about the advice record</Link>
    </>
  )
}

/** The record's meta line, as its phone lines: "23 pieces of advice since 20
 *  Jul · you have decided on 4 · 3 waiting for a decision". */
export function recordMeta(page: RecordPageData) {
  return [
    [<><span data-copy="figure">{fmtInt(page.total)}</span> {page.total === 1 ? 'piece' : 'pieces'} of advice{page.since ? ` since ${shortDate(page.since)}` : ''}</>],
    [<>you have decided on <span data-copy="figure">{fmtInt(page.decided)}</span></>],
    [<><span data-copy="figure">{fmtInt(page.waiting)}</span> waiting for a decision</>],
  ]
}
