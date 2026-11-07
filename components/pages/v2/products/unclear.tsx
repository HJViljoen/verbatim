import Link from 'next/link'
import { commaCite, EmptyBox } from '@/components/v2'
import { GO, QUOTE } from '@/components/v2/look'
import { fmtInt } from '@/lib/format'
import { quoteWords } from '@/lib/pages/brands'
import { UNCLEAR_ID, type UnclearLine } from '@/lib/pages/v2/products'
import type { CategoryDetail } from '@/lib/pages/v2/products-levels'
import { PRODUCT_TAG_COPY } from '@/lib/products/tags'
import { cn } from '@/lib/utils'
import { BTN } from './buttons'
import { LIST_CARD } from './level-parts'
import { TagControl } from './tag-control'

// "ABOUT ONE OF YOUR LINERS, BUT WE COULDN'T TELL WHICH" (G4-Products-Category,
// `#unclear`; E4's rows; since the audit design, 7 Nov, a tile beside the
// product cards, its empty state the dashed box): the category's talk placed under one of the client's
// products without saying which, each line a comment the quote gate lets
// print (or the video itself, where its own words name one of the client's),
// with Watch the video and, for an owner or an admin, Tag the product. "See
// all" makes the list longer on the same page (`?unclear=all`); it opens no
// panel. A member reads the words and the one line why there is no Tag.

/** One line: the words (or the video), where and when, Watch, Tag. */
export function UnclearRow({ line, options, category }: { line: UnclearLine; options: CategoryDetail['unclear']['options']; category: string }) {
  const words = line.quote ? quoteWords({ text: line.quote.text, english: line.quote.english }) : null
  return (
    <div role="listitem" data-unclear-row="" className="grid grid-cols-1 items-center gap-3 border-t border-track py-3 first:border-t-0 first:pt-0.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
      <div className="min-w-0">
        {words
          ? <p data-copy="quote" lang={line.quote?.english ? 'en' : undefined} className={cn('m-0 text-foreground', QUOTE)}>“{words}”</p>
          : <p className="m-0 text-[15px] leading-[1.5] text-foreground">The video itself names one of your products here.</p>}
        {line.cite ? <span className="text-[13px] text-muted-foreground">{commaCite(line.cite)}</span> : null}
      </div>
      <div className="flex flex-wrap items-start gap-2 sm:justify-end">
        {line.watchHref ? <a href={line.watchHref} target="_blank" rel="noreferrer noopener" className={BTN}>Watch the video</a> : null}
        {options.length > 0
          ? <TagControl videoId={line.videoId} commentId={line.commentId} options={options.map((o) => ({ value: o.value, label: o.label }))} label={words ?? `a video about ${category}`} />
          : null}
      </div>
    </div>
  )
}

/** What a tag does in this month, true to the code: an open month counts it
 *  from now on (as every open month does); a closed one keeps it and moves
 *  no count (`PRODUCT_TAG_COPY`). */
export function tagSub(closed: boolean, monthName: string): string {
  return closed
    ? `${monthName} has closed, so a tag here is kept and its counts stay as they were.`
    : `Tag the product and it counts from then on, in ${monthName} and in any month still open.`
}

/** The list's card. */
export function UnclearCard({ detail, canTag, monthWords, monthName }: { detail: CategoryDetail; canTag: boolean; monthWords: string; monthName: string }) {
  const u = detail.unclear
  const word = detail.name.toLowerCase()
  const all = u.lines.length + u.more
  const comments = u.allComments ? ' comments' : null
  return (
    <section id={UNCLEAR_ID} aria-labelledby="unclear-title" className={cn(LIST_CARD, 'scroll-mt-6')}>
      <div className="min-w-0">
        <h3 id="unclear-title" className="m-0 text-[19px] leading-[1.3] font-semibold text-foreground">About one of your {word}, but we couldn’t tell which</h3>
        {u.videos > 0 ? (
          <p className="m-0 mt-1.5 text-[14px] leading-[1.45] text-muted-foreground">
            <span data-copy="figure">{fmtInt(u.videos)}</span> {u.videos === 1 ? 'video' : 'videos'} in {monthWords}.{canTag ? <> {tagSub(u.closed, monthName)}</> : null}
          </p>
        ) : null}
      </div>
      {u.videos === 0 ? (
        <EmptyBox title={<><span data-copy="figure">0</span> videos in {monthWords}</>}>No video about {word} in {monthWords} was about one of yours without saying which.</EmptyBox>
      ) : u.lines.length > 0 ? (
        <div role="list">{u.lines.map((l) => <UnclearRow key={l.key} line={l} options={u.options} category={word} />)}</div>
      ) : <p className="m-0 text-[14px] text-muted-foreground">None of their comments can be quoted here.</p>}
      {u.withheld > 0 ? <p className="m-0 text-[13.5px] text-muted-foreground"><span data-copy="figure">{fmtInt(u.withheld)}</span> more {u.withheld === 1 ? 'comment' : 'comments'} we do not quote here.</p> : null}
      {!canTag && u.videos > 0 ? <p className="m-0 text-[13.5px] text-muted-foreground">{PRODUCT_TAG_COPY.role}</p> : null}
      {/* "All" only where the opened list draws every line that may print
          (`whole`); else what it does draw, the first N. */}
      {u.fewerHref && !u.whole ? <p className="m-0 text-[13.5px] text-muted-foreground">The first <span data-copy="figure">{fmtInt(u.openCount)}</span> are listed here.</p> : null}
      {u.allHref
        ? <Link href={u.allHref} scroll={false} className={cn(GO, 'self-start')}>{u.whole ? <>See all <span data-copy="figure">{fmtInt(all)}</span>{comments}</> : <>See the first <span data-copy="figure">{fmtInt(u.openCount)}</span>{comments}</>}</Link>
        : null}
      {u.fewerHref ? <Link href={u.fewerHref} scroll={false} className={cn(GO, 'self-start')}>Show fewer</Link> : null}
    </section>
  )
}
