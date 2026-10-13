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
 * over the period, and the last three weeks as three bare counts. The
 * board's "Trend" column ("▲ up", "steady") is a weekly direction word, which
 * decision 1 rules out; the counts stand in its place with no word. A row
 * opens the conversation in Market.
 */

const TH = 'pr-3 pb-2.5 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap text-muted-foreground'
const TD = 'py-[11px] pr-3 align-middle'

export function AskedCard({ block, state, month, weekWord }: { block: AskedBlock; state: ContentState; month: { month: string; complete: boolean }; weekWord: string }) {
  const period = block.period === 'month' ? monthWords(month) : weekWord
  const videosHead = block.period === 'month' ? `Videos ${monthWords(month).replace(/^in /, '')}` : 'Videos this week'
  return (
    <section id={ASKED_ID} aria-labelledby="asked-title" className={cn(CARD, 'scroll-mt-6')}>
      <CardHead
        icon={CircleHelp}
        id="asked-title"
        title="Also asked, and not yet in your posts"
        sub={`The next questions people asked ${period}, after the ideas above, that none of your posts in ${longMonth(month.month)} touched on`}
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
              <th scope="col" className={cn(TH, 'text-right')}>{videosHead}</th>
              <th scope="col" className={cn(TH, 'hidden pr-0 text-right sm:table-cell')}>The last three weeks</th>
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
                <td className={cn(TD, 'text-right')}><Fig>{fmtInt(r.videos)}</Fig></td>
                <td className={cn(TD, 'hidden pr-0 text-right sm:table-cell')}>
                  {r.weeks ? <Fig className="text-[13px] text-muted-foreground">{r.weeks.map(fmtInt).join(' · ')}</Fig> : <span className="text-muted-foreground">·</span>}
                </td>
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
