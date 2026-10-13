import { Layers } from 'lucide-react'
import { CARD, CardHead } from '@/components/v2'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { MARKET_LONG_RUN_ANCHOR } from '@/lib/nav'
import type { MarketData, MarketLongRun } from '@/lib/pages/v2/market'
import { monthsPhrase } from '@/lib/written/month'
import { cn } from '@/lib/utils'
import { About } from './parts'

// THE MONTH'S LONG-RUN READ, ON MARKET › THIS MONTH (Heinrich, 13 Oct: below
// the month's data, never at the top, never on This week or Over time). The
// published `week_reads` row of kind 'month' for the month the view reads;
// where that month is still filling and has none of its own, the newest
// ready read of any earlier month, headed with its month ("September’s
// long-run read") so it never reads as this month's (`marketLongRunFor`).
// One read only; no read to show, no section, and no placeholder; a read
// that failed, one calm line (`LongRunUnread`).
//
// No board draws it, so it is drawn in the page's idiom: the kit's card and
// head, the lead, then each idea as a row: its headline and sentences on the
// left (the writer's words as stored, `week_read` prose), on the right the
// months it was heard in and its videos (code's counts), and who those videos
// are about where the brands are counted (`About`, the page's own chips). It
// is the last thing on the page, so it is read after the month's figures
// (level 2 by position), and it holds no comment's words: the long-run read
// stores none.

/** The section's anchor, which the operator's review email links to
 *  (`marketMonthHref(month, MARKET_LONG_RUN_ANCHOR)`). */
export const LONG_RUN_ID = MARKET_LONG_RUN_ANCHOR

/** The prose slot the long-run read was written under (lib/prose/scrub.ts). */
const SLOT = 'week_read'

/** The line under the title: what the section is, and when it was written.
 *  A read written before its month closed (`partialThrough`) says the day it
 *  reads to; an earlier month's read standing in on a filling month
 *  (`earlier`) names what it holds across and says the month in view has no
 *  read of its own yet. */
export function longRunSub(read: Pick<MarketLongRun, 'month' | 'partialThrough' | 'earlier' | 'viewMonth' | 'across'>): string {
  const month = longMonth(read.month)
  const when = read.partialThrough
    ? `written before ${month} closed, on the comments to ${shortDate(`${read.partialThrough.slice(0, 10)}T00:00:00.000Z`)}`
    : `written once ${month} had closed`
  return read.earlier
    ? `${read.across}: our read, ${when}. ${longMonth(read.viewMonth)} has no read of its own yet.`
    : `Our read of what has held across these months, ${when}.`
}

/** The one calm line where the long-run read could not be read (never the
 *  look of a month with no read). */
export const LONG_RUN_UNREAD = 'The long-run read could not be read just now.'

export function LongRunUnread() {
  return <p data-long-run="unread" className="m-0 px-0.5 text-[14px] leading-[1.5] text-muted-foreground">{LONG_RUN_UNREAD}</p>
}

export function LongRunSection({ read, data }: { read: MarketLongRun; data: Pick<MarketData, 'brand' | 'noun' | 'brands'> }) {
  return (
    <section
      id={LONG_RUN_ID}
      aria-labelledby="long-run-title"
      data-long-run={read.partialThrough ? 'partial' : 'full'}
      data-long-run-month={read.month.slice(0, 7)}
      className={cn(CARD, 'scroll-mt-6')}
    >
      <CardHead icon={Layers} id="long-run-title" title={read.title} sub={longRunSub(read)} />
      {read.inShort ? (
        <p data-copy="stored" data-slot={SLOT} className="m-0 max-w-[920px] text-[17px] leading-[1.55] font-medium text-foreground max-sm:text-[16px]">
          {read.inShort}
        </p>
      ) : null}
      <ol className="m-0 flex list-none flex-col p-0">
        {read.ideas.map((idea, i) => (
          <li key={idea.headline} className="grid grid-cols-1 gap-3 border-t border-track py-5 last:pb-1 md:grid-cols-5 md:gap-9">
            <div className="flex min-w-0 flex-col gap-2.5 md:col-span-3">
              <div className="flex items-start gap-3">
                <span aria-hidden className="flex size-[24px] shrink-0 items-center justify-center rounded-full bg-brand text-[12.5px] font-bold text-brand-foreground">{i + 1}</span>
                <h3 className="m-0 text-[17px] leading-[1.35] font-semibold tracking-[-0.005em]">
                  <span data-copy="stored" data-slot={SLOT}>{idea.headline}</span>
                </h3>
              </div>
              {idea.body.map((para) => (
                <p key={para} data-copy="stored" data-slot={SLOT} className="m-0 text-[15px] leading-[1.62] text-foreground">{para}</p>
              ))}
            </div>
            <div className="flex min-w-0 flex-col gap-2 md:col-span-2 md:pt-0.5">
              <p className="m-0 text-[13px] leading-[1.45] text-muted-foreground">
                {idea.heard.length > 0 ? <>Heard in {monthsPhrase(idea.heard)} · </> : null}
                <span data-copy="figure" className="font-mono text-foreground">{fmtInt(idea.videos)}</span> {idea.videos === 1 ? 'video' : 'videos'}
              </p>
              {/* Who the videos are about, only where the brands are counted
                  (the page's one rule: no split on a tenant whose brand rows
                  are not written yet). */}
              {data.brands === 'counted' && idea.who.length > 0 ? (
                <div><About parts={idea.who} brand={data.brand} noun={data.noun} /></div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
