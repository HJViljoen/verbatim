import Link from 'next/link'
import { fmtInt } from '@/lib/format'
import { quoteWords } from '@/lib/pages/brands'
import { UNCLEAR_ID, type UnclearLine } from '@/lib/pages/v2/products'
import type { CategoryDetail } from '@/lib/pages/v2/products-levels'
import { PRODUCT_TAG_COPY } from '@/lib/products/tags'
import { cn } from '@/lib/utils'
import { OLINK } from '@/components/pages/v2/market/parts'
import { BTN } from './buttons'
import { LIST_CARD } from './level-parts'
import { TagControl } from './tag-control'

// "ABOUT ONE OF YOUR LINERS, BUT WE COULDN'T TELL WHICH" (G4-Products-Category,
// `#unclear`; E4's rows): the category's talk placed under one of the client's
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
          ? <p data-copy="quote" lang={line.quote?.english ? 'en' : undefined} className="m-0 font-serif text-[14.5px] italic leading-[1.5] text-foreground">“{words}”</p>
          : <p className="m-0 text-[14px] leading-[1.5] text-foreground">The video itself names one of your products here.</p>}
        {line.cite ? <span className="text-[12px] text-muted-foreground">{line.cite}</span> : null}
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
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-[30px] shrink-0 items-center justify-center rounded-[8px] bg-accent text-orange-text">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-4"><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.9.8c0 1.7-2.5 2.2-2.5 3.8" /><path d="M12 17.2h.01" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="unclear-title" className="m-0 text-[17px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground">About one of your {word}, but we couldn’t tell which</h2>
          <p className="m-0 mt-0.5 text-[13px] leading-[1.45] text-muted-foreground">
            <span data-copy="figure">{fmtInt(u.videos)}</span> {u.videos === 1 ? 'video' : 'videos'} in {monthWords}.{u.videos > 0 && canTag ? <> {tagSub(u.closed, monthName)}</> : null}
          </p>
        </div>
      </div>
      {u.videos === 0 ? (
        <p className="m-0 text-[13.5px] text-muted-foreground">No video about {word} in {monthWords} was about one of yours without saying which.</p>
      ) : u.lines.length > 0 ? (
        <div role="list">{u.lines.map((l) => <UnclearRow key={l.key} line={l} options={u.options} category={word} />)}</div>
      ) : <p className="m-0 text-[13.5px] text-muted-foreground">None of their comments can be quoted here.</p>}
      {u.withheld > 0 ? <p className="m-0 text-[12.5px] text-muted-foreground"><span data-copy="figure">{fmtInt(u.withheld)}</span> more {u.withheld === 1 ? 'comment' : 'comments'} we do not quote here.</p> : null}
      {!canTag && u.videos > 0 ? <p className="m-0 text-[12.5px] text-muted-foreground">{PRODUCT_TAG_COPY.role}</p> : null}
      {/* "All" only where the opened list draws every line that may print
          (`whole`); else what it does draw, the first N. */}
      {u.fewerHref && !u.whole ? <p className="m-0 text-[12.5px] text-muted-foreground">The first <span data-copy="figure">{fmtInt(u.openCount)}</span> are listed here.</p> : null}
      {u.allHref
        ? <Link href={u.allHref} scroll={false} className={OLINK}>{u.whole ? <>See all <span data-copy="figure">{fmtInt(all)}</span>{comments}</> : <>See the first <span data-copy="figure">{fmtInt(u.openCount)}</span>{comments}</>} →</Link>
        : null}
      {u.fewerHref ? <Link href={u.fewerHref} scroll={false} className={OLINK}>Show fewer</Link> : null}
    </section>
  )
}
