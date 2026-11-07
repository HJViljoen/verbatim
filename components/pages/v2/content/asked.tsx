import Link from 'next/link'
import { CARD, CardHead, EmptyBox, TBL, TD, TD_NUM, TH } from '@/components/v2'
import { GO } from '@/components/v2/look'
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
 * old board's "Trend" column ("up", "steady") is a weekly direction word,
 * which decision 1 rules out; the counts stand in its place with no word. A
 * row opens the conversation in Market.
 *
 * Since the audit design (7 Nov, `Content.dc.html`): the kit's table with
 * sentence-case heads and every column, the counts bare (their bases are the
 * figures row's, decision 2), a missing value said in words ("No group",
 * "Not assigned"), the three weeks in commas, and the empty state in the
 * dashed box (decision 4).
 */

/** A question's name in the table: a link, underlined at rest (the board's
 *  rows). */
const NAME = cn(GO, 'text-[15px] font-semibold')

export function AskedCard({ block, state, month, weekWord, weekHead, afterIdeas = true }: {
  block: AskedBlock
  state: ContentState
  month: { month: string; complete: boolean }
  /** "this week", or the window's days where it is not seven. */
  weekWord: string
  /** The week column's heading: "This week", or the window's days. */
  weekHead: string
  /** Cards stand above it (ideas, or the questions in their places): the
   *  table leaves their conversations out. */
  afterIdeas?: boolean
}) {
  const period = block.period === 'month' ? monthWords(month) : weekWord
  const trend = block.rows.some((r) => r.weeks != null)
  // Where your posts could not be read (or there were none), nothing was
  // left out as touched, and the line does not say so.
  const touchRead = block.posts !== null && block.posts !== 0
  const besides = afterIdeas ? ', besides those above,' : ''
  const sub = touchRead
    ? `Conversations filed as questions ${period}${besides} that none of your posts since ${longMonth(block.since)} touched on, the most videos first`
    : `Conversations filed as questions ${period}${afterIdeas ? ', besides those above' : ''}, the most videos first`
  // An empty table says so in the dashed box in its place (decision 4).
  const empty = block.unread ?? (block.rows.length === 0
    ? block.touched > 0 ? `Every ${afterIdeas ? 'other ' : ''}question people asked was touched on by one of your posts.` : `No ${afterIdeas ? 'other ' : ''}question came up ${period}.`
    : null)
  const more = block.total - block.rows.length
  return (
    <section id={ASKED_ID} aria-labelledby="asked-title" className={cn(CARD, 'scroll-mt-6')}>
      <CardHead id="asked-title" size="lg" title="Also asked, and not yet in your posts" sub={sub} />
      {empty ? <EmptyBox>{empty}</EmptyBox> : (
        // Every column at every width; on a phone the table scrolls inside
        // its tile (the boards' phone rule).
        <div className="min-w-0 overflow-x-auto">
          <table className={cn(TBL, 'min-w-[720px]')}>
            <thead>
              <tr>
                <th scope="col" className={TH}>Question people asked</th>
                <th scope="col" className={TH}>Who asks</th>
                <th scope="col" className={TH}>Subject</th>
                <th scope="col" className={cn(TH, 'w-[90px] text-right')}>{weekHead}</th>
                <th scope="col" className={cn(TH, 'w-[90px] text-right')}>{longMonth(month.month)}</th>
                {trend ? <th scope="col" className={cn(TH, 'pr-0 text-right')}>Last three weeks, oldest first</th> : null}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r) => (
                <tr key={r.registryId}>
                  <td className={TD}>
                    <Link href={conversationHref(r.registryId)} className={NAME}>
                      <span data-copy="subject" data-slot="pass_b_theme">{r.label}</span>
                    </Link>
                  </td>
                  <td className={TD}>{r.groups.length > 0 ? <GroupNames groups={r.groups} /> : <span className="text-muted-foreground">No group</span>}</td>
                  <td className={TD}>{r.subject ?? <span className="text-muted-foreground">Not assigned</span>}</td>
                  <td className={cn(TD, TD_NUM, 'font-semibold')}>{r.week != null ? <Fig>{fmtInt(r.week)}</Fig> : <span className="font-normal text-muted-foreground">Not read</span>}</td>
                  <td className={cn(TD, TD_NUM, 'text-secondary-foreground')}>{r.month != null ? <Fig>{fmtInt(r.month)}</Fig> : <span className="text-muted-foreground">Not read</span>}</td>
                  {trend ? (
                    <td className={cn(TD, TD_NUM, 'pr-0 text-secondary-foreground')}>
                      {r.weeks ? <Fig>{r.weeks.map(fmtInt).join(', ')}</Fig> : <span className="text-muted-foreground">Not read</span>}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!block.unread && (block.total > ASKED_SHOWN || block.touched > 0) ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-t border-track pt-3.5">
          {block.total > ASKED_SHOWN ? (
            block.expanded ? (
              <OLink href={contentHref({ ...state, asked: false })} scroll={false}>Show the first {ASKED_SHOWN}</OLink>
            ) : (
              <OLink href={contentHref({ ...state, asked: true })} scroll={false}>See <Fig>{fmtInt(more)}</Fig> more {more === 1 ? 'question' : 'questions'} not yet in your posts</OLink>
            )
          ) : <span />}
          {block.touched > 0 ? (
            <span className="text-[14px] text-muted-foreground"><Fig>{fmtInt(block.touched)}</Fig> more {block.touched === 1 ? 'was' : 'were'} touched on by your posts and {block.touched === 1 ? 'is' : 'are'} left out.</span>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
