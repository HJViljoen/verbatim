import Link from 'next/link'
import { Calendar, Sparkles } from 'lucide-react'
import { EYEBROW, IconTile } from '@/components/colour-roles'
import { translationLabel, translationNote } from '@/components/quote-block'
import type { MarketData, PanelQuote, StoredLine, WeekPage } from '@/lib/pages/v2/market'
import { fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { WEEK_THIN, WEEK_UNREAD } from './analysis'
import { ASK } from './panel'
import { Label, OLINK, Stored } from './parts'
import { PAGE_CARD, READ } from './subject-page'

// THE WEEK'S READ, IN FULL (depth as pages, 17 Oct; board F2-Market-Week):
// the published read the top page's week card opens. What happened, a
// paragraph each, each followed by the quote its ref carries (the words
// resolved at render, never stored); what it means; new this week; worth
// watching; the Agent, and the way to every conversation this week on the
// top page. No period switch and no chevron: a read is one week's.

/** No read published yet. */
export const WEEK_NONE = 'This week’s read is not ready yet.'
/** New this week, where the read heard nothing first this week. */
export const WEEK_NOTHING_NEW = 'Nothing new this week.'

/** One of the read's quotes, after the paragraph whose ref it carries. */
function Quote({ q }: { q: PanelQuote }) {
  const note = translationNote({ lang: q.lang, english: q.english })
  const label = translationLabel(note)
  return (
    <figure className="m-0 flex flex-col gap-1.5 rounded-[10px] bg-inner px-[15px] py-[13px]">
      <blockquote data-copy="quote" className="m-0 font-serif text-[15.5px] italic leading-[1.5] text-foreground">“{q.text}”</blockquote>
      {label ? <span className="text-[12px] text-muted-foreground">{label}</span> : null}
      {note.english ? <p data-copy="quote" className="m-0 font-serif text-[14px] leading-[1.5] text-muted-foreground">{note.english}</p> : null}
      {q.source ? <figcaption className="text-[12px] text-muted-foreground">{q.source}</figcaption> : null}
    </figure>
  )
}

/** A list of stored lines, a hairline between (the boards' `.items`). */
function Items({ lines }: { lines: readonly StoredLine[] }) {
  return (
    <div className="flex flex-col">
      {lines.map((l, i) => <Stored key={i} line={l} slot="week_read" className={cn('m-0 text-[15px] leading-[1.55] text-foreground', i > 0 ? 'border-t border-track py-3' : 'pb-3 pt-0.5')} />)}
    </div>
  )
}

/** The page's body under its bar. */
export function WeekPageBody({ page }: { page: WeekPage; data: MarketData }) {
  const eyebrow = (
    <div className="flex items-center gap-3">
      <IconTile icon={Calendar} className="my-0" />
      <p className={cn('m-0', EYEBROW)}>{page.dates ? `This week · ${page.dates}` : 'This week'}</p>
    </div>
  )
  if (page.state !== 'ready') {
    return (
      <article id="week-read" data-week-read={page.state} className={PAGE_CARD}>
        {eyebrow}
        <p className="m-0 text-[15px] leading-[1.55] text-muted-foreground">{page.state === 'thin' ? WEEK_THIN : page.state === 'failed' ? WEEK_UNREAD : WEEK_NONE}</p>
      </article>
    )
  }
  return (
    <article id="week-read" aria-labelledby={page.line ? 'week-head' : undefined} data-week-read="ready" className={PAGE_CARD}>
      {eyebrow}
      {page.line ? <Stored as="h2" id="week-head" line={page.line} slot="week_read" className="m-0 max-w-[900px] text-[28px] leading-[1.28] font-semibold tracking-[-0.02em] text-foreground max-sm:text-[21px] max-sm:leading-[1.3]" /> : null}
      <div className="grid grid-cols-1 gap-11 border-t border-track pt-6 max-sm:pt-[18px] min-[1180px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Label>What happened</Label>
          {page.story.length > 0
            ? page.story.map((p, i) => (
              <div key={i} className="flex flex-col gap-4">
                <Stored line={p.line} slot="week_read" className={READ} />
                {p.quote ? <Quote q={p.quote} /> : null}
              </div>
            ))
            : <p className="m-0 text-[15px] text-muted-foreground">The read tells no story this week.</p>}
        </div>
        <div className="flex min-w-0 flex-col gap-8">
          {page.means.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              <Label>What it means</Label>
              <Items lines={page.means} />
            </div>
          ) : null}
          <div className="flex flex-col gap-2.5">
            <Label>New this week</Label>
            {page.fresh.length > 0 ? <Items lines={page.fresh} /> : <p className="m-0 text-[15px] leading-[1.55] text-muted-foreground">{WEEK_NOTHING_NEW}</p>}
          </div>
          {page.watch.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              <Label>Worth watching</Label>
              <Items lines={page.watch} />
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-[18px] border-t border-track pt-5">
        <Link href={page.askHref} className={cn(ASK, 'max-sm:w-full max-sm:justify-center')}><Sparkles className="size-3.5" aria-hidden />Ask the Agent about this week</Link>
        <Link href={page.tableHref} className={OLINK}>Every conversation this week{page.conversations != null ? <> (<span data-copy="figure">{fmtInt(page.conversations)}</span>)</> : null} →</Link>
      </div>
    </article>
  )
}
