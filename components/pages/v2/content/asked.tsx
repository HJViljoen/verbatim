import Link from 'next/link'
import { CircleHelp } from 'lucide-react'
import { CARD, CardHead } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import { ASKED_ID, ASKED_SHOWN, contentHref, conversationHref, monthWords, type AskedBlock, type ContentState } from '@/lib/pages/v2/content'
import { cn } from '@/lib/utils'
import { Fig, GroupNames, OLink } from './parts'

/**
 * ALSO ASKED, AND NOT YET IN YOUR POSTS (E5-Content's last card): the
 * question conversations of the week (or the month) after the post ideas,
 * that none of your posts this month touched on, the most videos first.
 *
 * Each row: the conversation (Pass B's label, a `subject` node), the groups
 * whose profile cites it (names only, decision 5), its subject, its videos
 * over the week with its month beside them (decision 1), and the last three
 * weeks as three bare counts. The conversations are those the run filed as
 * questions; the post-ideas step's own ranking (its question test reads the
 * evidence) is not re-run on a page load, so the card does not claim to be
 * "next in line" after the ideas. The
 * board's "Trend" column ("▲ up", "steady") is a weekly direction word, which
 * decision 1 rules out; the counts stand in its place with no word. A row
 * opens the conversation in Market.
 */

const TH = 'pr-3 pb-2.5 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap text-muted-foreground'
const TD = 'py-[11px] pr-3 align-middle'

export function AskedCard({ block, state, month, weekWord, weekHead, afterIdeas = true }: {
  block: AskedBlock
  state: ContentState
  month: { month: string; complete: boolean }
  /** "this week", or the window's days where it is not seven. */
  weekWord: string
  /** The week column's heading: "This week", or the window's days. */
  weekHead: string
  /** Post ideas stand above it: the table leaves their conversations out. */
  afterIdeas?: boolean
}) {
  const period = block.period === 'month' ? monthWords(month) : weekWord
  const monthHead = `${longMonth(month.month)} ${month.complete ? 'in total' : 'so far'}`
  const trend = block.rows.some((r) => r.weeks != null)
  return (
    <section id={ASKED_ID} aria-labelledby="asked-title" className={cn(CARD, 'scroll-mt-6')}>
      <CardHead
        icon={CircleHelp}
        id="asked-title"
        title="Also asked, and not yet in your posts"
        sub={`Conversations filed as questions ${period}${afterIdeas ? ', besides the ideas above,' : ''} that none of your posts since ${longMonth(block.since)} touched on, the most videos first`}
      />
      {block.unread ? (
        <p className="m-0 text-[14px] leading-[1.5] text-muted-foreground">{block.unread}</p>
      ) : block.rows.length === 0 ? (
        <p className="m-0 text-[14px] leading-[1.5] text-muted-foreground">
          {block.touched > 0 ? 'Every other question people asked was touched on by one of your posts.' : `No other question came up ${period}.`}
        </p>
      ) : (
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className={TH}>Question people asked</th>
              <th scope="col" className={cn(TH, 'hidden md:table-cell')}>Who asks</th>
              <th scope="col" className={cn(TH, 'hidden lg:table-cell')}>Subject</th>
              <th scope="col" className={cn(TH, 'text-right')}>{weekHead}</th>
              <th scope="col" className={cn(TH, 'text-right')}>{monthHead}</th>
              {trend ? <th scope="col" className={cn(TH, 'hidden pr-0 text-right sm:table-cell')}>The last three weeks</th> : null}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((r) => (
              <tr key={r.registryId} className="border-b border-track last:border-b-0">
                <td className={TD}>
                  <Link href={conversationHref(r.registryId)} className="font-medium no-underline hover:underline hover:underline-offset-[3px]">
                    <span data-copy="subject" data-slot="pass_b_theme">{r.label}</span>
                  </Link>
                </td>
                <td className={cn(TD, 'hidden text-muted-foreground md:table-cell')}>{r.groups.length > 0 ? <GroupNames groups={r.groups} /> : <span aria-label="No group cites it">·</span>}</td>
                <td className={cn(TD, 'hidden text-muted-foreground lg:table-cell')}>{r.subject ?? <span aria-label="No subject holds it">·</span>}</td>
                <td className={cn(TD, 'text-right')}>{r.week != null ? <Fig>{fmtInt(r.week)}</Fig> : <span className="text-muted-foreground">·</span>}</td>
                <td className={cn(TD, 'text-right')}>{r.month != null ? <Fig>{fmtInt(r.month)}</Fig> : <span className="text-muted-foreground">·</span>}</td>
                {trend ? (
                  <td className={cn(TD, 'hidden pr-0 text-right sm:table-cell')}>
                    {r.weeks ? <Fig className="text-[13px] text-muted-foreground">{r.weeks.map(fmtInt).join(' · ')}</Fig> : <span className="text-muted-foreground">·</span>}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!block.unread && (block.total > ASKED_SHOWN || block.touched > 0) ? (
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
          {block.total > ASKED_SHOWN ? (
            block.expanded ? (
              <OLink href={contentHref({ ...state, asked: false })} scroll={false}>Show the first {ASKED_SHOWN} ↑</OLink>
            ) : (
              <OLink href={contentHref({ ...state, asked: true })} scroll={false}>All <Fig>{fmtInt(block.total)}</Fig> questions not yet in your posts →</OLink>
            )
          ) : null}
          {block.touched > 0 ? (
            <span className="text-[13px] text-muted-foreground"><Fig>{fmtInt(block.touched)}</Fig> more {block.touched === 1 ? 'was' : 'were'} touched on by your posts and {block.touched === 1 ? 'is' : 'are'} left out.</span>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
