import { commaCite, GoLink, translationLine } from '@/components/v2'
import { QUOTE } from '@/components/v2/look'
import { translationNote } from '@/components/quote-block'
import type { MarketData, PanelQuote, StoredLine, WeekPage } from '@/lib/pages/v2/market'
import { fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { WEEK_THIN, WEEK_UNREAD } from './analysis'
import { Stored } from './parts'
import { PAGE_CARD } from './subject-page'

// THE WEEK'S READ, IN FULL (depth as pages, 17 Oct), drawn to the audit
// design's board (Market-Week.dc.html, 7 Nov): the published read the top
// page's week card opens. The week in one line as the heading; then what
// happened, a paragraph each, each followed by the quote its ref carries
// (the words resolved at render, never stored), beside what it means, new
// this week and worth watching; then every conversation this week and the
// Agent, as links. No period switch and no chevron: a read is one week's.
// The dates and the week's figures are the figures row's.

/** No read published yet. */
export const WEEK_NONE = 'This week’s read is not ready yet.'
/** New this week, where the read heard nothing first this week. */
export const WEEK_NOTHING_NEW = 'Nothing new this week.'

/** The read's heading where it has no line to lead with (thin, failed,
 *  none): the week by its dates. */
export const weekHeading = (dates: string | null): string => (dates ? `The week of ${dates}` : 'This week')

/** A section's heading inside the read (the board's h3). */
const H3 = 'm-0 text-[15px] leading-[1.4] font-semibold text-secondary-foreground'
/** A paragraph of the read. */
const PARA = 'm-0 text-[16px] leading-[1.65] text-foreground max-sm:text-[15px] max-sm:leading-[1.6]'

/** One of the read's quotes, after the paragraph whose ref it carries (the
 *  board's `figure.q`): the quote, its language line and its English where
 *  it has them, then where and when ("TikTok, 26 Oct"). */
function Quote({ q }: { q: PanelQuote }) {
  const note = translationNote({ lang: q.lang, english: q.english })
  const line = translationLine({ language: note.language, english: note.english })
  return (
    <figure className="m-0 flex flex-col gap-2 rounded-[10px] bg-inner px-[18px] py-4">
      <blockquote data-copy="quote" className={cn('m-0 text-foreground', QUOTE, 'text-[16.5px] leading-[1.55]')}>“{q.text}”</blockquote>
      {line ? <span className="text-[13px] text-muted-foreground">{line}</span> : null}
      {note.english ? <p data-copy="quote" className="m-0 font-serif text-[15px] leading-[1.55] text-secondary-foreground">{note.english}</p> : null}
      {q.source ? <figcaption className="text-[13px] text-muted-foreground">{commaCite(q.source)}</figcaption> : null}
    </figure>
  )
}

/** A list of stored lines, a hairline between. */
function Items({ lines }: { lines: readonly StoredLine[] }) {
  return (
    <div className="flex flex-col">
      {lines.map((l, i) => <Stored key={i} line={l} slot="week_read" className={cn(PARA, 'leading-[1.6]', i > 0 ? 'border-t border-track pt-3.5 mt-3.5' : null)} />)}
    </div>
  )
}

/** The page's body under its bar. */
export function WeekPageBody({ page }: { page: WeekPage; data: MarketData }) {
  if (page.state !== 'ready') {
    return (
      <article id="week-read" aria-labelledby="week-head" data-week-read={page.state} className={PAGE_CARD}>
        <h2 id="week-head" className="m-0 text-[21px] leading-[1.3] font-semibold text-foreground">{weekHeading(page.dates)}</h2>
        <p className="m-0 text-[15px] leading-[1.55] text-secondary-foreground">{page.state === 'thin' ? WEEK_THIN : page.state === 'failed' ? WEEK_UNREAD : WEEK_NONE}</p>
      </article>
    )
  }
  return (
    <article id="week-read" aria-labelledby="week-head" data-week-read="ready" className={PAGE_CARD}>
      {page.line
        ? <Stored as="h2" id="week-head" line={page.line} slot="week_read" className="m-0 max-w-[1000px] text-[28px] leading-[1.3] font-bold tracking-[-0.01em] text-foreground max-sm:text-[21px]" />
        : <h2 id="week-head" className="m-0 text-[21px] leading-[1.3] font-semibold text-foreground">{weekHeading(page.dates)}</h2>}
      <div className="grid grid-cols-1 gap-12 border-t border-track pt-[26px] max-sm:gap-8 max-sm:pt-[18px] min-[1180px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="flex min-w-0 flex-col gap-[18px]">
          <h3 className={H3}>What happened</h3>
          {page.story.length > 0
            ? page.story.map((p, i) => (
              <div key={i} className="flex flex-col gap-[18px]">
                <Stored line={p.line} slot="week_read" className={PARA} />
                {p.quote ? <Quote q={p.quote} /> : null}
              </div>
            ))
            : <p className="m-0 text-[15px] text-secondary-foreground">The read tells no story this week.</p>}
        </section>
        <aside className="flex min-w-0 flex-col gap-3.5">
          {page.means.length > 0 ? (
            <>
              <h3 className={H3}>What it means</h3>
              <Items lines={page.means} />
            </>
          ) : null}
          <h3 className={cn(H3, page.means.length > 0 ? 'mt-[22px]' : null)}>New this week</h3>
          {page.fresh.length > 0 ? <Items lines={page.fresh} /> : <p className="m-0 text-[15px] leading-[1.55] text-secondary-foreground">{WEEK_NOTHING_NEW}</p>}
          {page.watch.length > 0 ? (
            <>
              <h3 className={cn(H3, 'mt-[22px]')}>Worth watching</h3>
              <ul className="m-0 flex list-disc flex-col gap-2.5 pl-5 text-[15px] leading-[1.55] text-foreground">
                {page.watch.map((l, i) => <li key={i}><Stored as="span" line={l} slot="week_read" /></li>)}
              </ul>
            </>
          ) : null}
        </aside>
      </div>
      {/* The board's foot: every conversation this week first, then the
          Agent, each a link that says where it goes. */}
      <div data-week-foot="" className="flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-track pt-5">
        <GoLink href={page.tableHref}>{page.conversations != null ? <>See all <span data-copy="figure">{fmtInt(page.conversations)}</span> conversations this week</> : 'See every conversation this week'}</GoLink>
        <GoLink href={page.askHref}>Ask the Agent about this week</GoLink>
      </div>
    </article>
  )
}
