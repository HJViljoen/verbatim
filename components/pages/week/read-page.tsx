import { Fragment, type ReactNode } from 'react'
import { translationLabel, translationNote } from '@/components/quote-block'
import { BrandWho, WhoInline, WHO_MUTED, type WhoNames } from '@/components/brand-who'
import { PageBar } from '@/components/shell/page-grid'
import { platformLabel, shortDate } from '@/lib/format'
import { substituteFigures } from '@/lib/reports/cover'
import type { FigureTable } from '@/lib/reports/types'
import { monthPrefix, type WeekReadPageData, type WeekReadPageFinding, type WeekReadQuote } from '@/lib/pages/week-read'
import { cn } from '@/lib/utils'

/**
 * This week: the weekly read in full (the pages build, 1 Oct), drawn to the
 * approved artboard Page-This-week.dc.html: the title; one card holding In
 * short and every finding (headline, what was seen, what it means; beside it
 * the quote, the evidence line, who the month's talk was about, and the
 * context line); then "Also heard this week". Nothing else.
 *
 * NOTHING EMPTY PRINTS (§0a.2): a finding with no quote has no panel, a read
 * stored before its videos were has no brand line, and "Also heard" is left
 * out when nothing else was heard. No word about how the read was made.
 *
 * Palette A literals (the app's tokens are still the old brand's; the colour
 * swap is a later task): yellow #FFD43B, orange text #C2410C, ink #26292C,
 * muted #5F656B, hairline #E4E2DC, ground #F7F6F2.
 */

const HAIR = 'border-[#E4E2DC]'
const INK = 'text-[#26292C]'

/** The page's own title: the shared bar, at the artboard's 26px on 40px. */
export function PageTitle({ children }: { children: ReactNode }) {
  return <PageBar title={children} />
}

/** A card on the page: paper, 16px corners. The tile shadow keeps it apart
 *  from the shell's current ground (the artboard's ground is #F7F6F2). */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('flex min-w-0 flex-col rounded-[16px] bg-white shadow-tile', className)}>{children}</section>
}

/** The writer's sentences (slot `week_read`, scrubbed when stored), any
 *  `[[key]]` put back as code's figure; a sentence naming a key the table
 *  lacks is left out. */
function Stored({ body, figures, className, as = 'p' }: { body: string; figures: FigureTable; className?: string; as?: 'p' | 'div' | 'span' }) {
  const Tag = as
  if (!body.includes('[[')) return <Tag data-copy="stored" data-slot="week_read" className={className}>{body}</Tag>
  const parts = substituteFigures(body, figures)
  if (parts.length === 0) return null
  return (
    <Tag data-copy="stored" data-slot="week_read" className={className}>
      {parts.map((p, i) => ('text' in p ? <Fragment key={i}>{p.text}</Fragment> : <span key={i} data-copy="figure">{p.figure}</span>))}
    </Tag>
  )
}

/** Code's line, its figures put back (the evidence and context lines). */
function CodeLine({ body, figures, className, verdict = false }: { body: string; figures: FigureTable; className?: string; verdict?: boolean }) {
  if (!body) return null
  const parts = substituteFigures(body, figures)
  if (parts.length === 0) return null
  return (
    <div data-copy={verdict ? 'verdict' : undefined} className={className}>
      {parts.map((p, i) => ('text' in p ? <Fragment key={i}>{p.text}</Fragment> : <span key={i} data-copy="figure">{p.figure}</span>))}
    </div>
  )
}

/** Emoji out of printed words (the artboard prints none). */
export function stripEmoji(s: string): string {
  return s.replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu, ' ').replace(/\s+/g, ' ').trim()
}

/** The quote panel: serif italic on the ground, no stripe; its source line
 *  says where and when, and who the words are about. */
export function QuotePanel({ quote, names, size = 17 }: { quote: WeekReadQuote; names: WhoNames; size?: number }) {
  const note = translationNote({ lang: quote.lang, english: quote.english })
  const label = translationLabel(note)
  const source = [quote.platform ? platformLabel(quote.platform) : null, quote.date ? shortDate(`${quote.date}T12:00:00.000Z`) : null].filter(Boolean).join(' · ')
  const words = stripEmoji(quote.text)
  if (!words) return null
  return (
    <div className="flex flex-col gap-2 rounded-[12px] bg-[#F7F6F2] px-[18px] py-4">
      <p data-copy="quote" className={cn('m-0 font-serif italic leading-[1.5]', INK)} style={{ fontSize: size }}>“{words}”</p>
      {label ? <div className={cn('text-[12px]', WHO_MUTED)}>{label}</div> : null}
      {note.english ? <p data-copy="quote" className={cn('m-0 font-serif text-[14px] leading-[1.5]', WHO_MUTED)}>{stripEmoji(note.english)}</p> : null}
      {source || quote.who ? (
        <div className={cn('text-[12px]', WHO_MUTED)}>
          {source}
          {quote.who ? <>{source ? <span> · </span> : null}<WhoInline parts={quote.who} names={names} /></> : null}
        </div>
      ) : null}
    </div>
  )
}

function Finding({ f, data }: { f: WeekReadPageFinding; data: WeekReadPageData }) {
  const { figures, names } = data
  return (
    <article id={`finding-${f.n}`} className={cn('grid scroll-mt-6 grid-cols-1 gap-6 border-t py-[26px] lg:grid-cols-5 lg:gap-9', HAIR)}>
      <div className="flex min-w-0 flex-col gap-3.5 lg:col-span-3">
        <div className="flex items-start gap-3">
          <div aria-hidden className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-[#FFD43B] text-[13px] font-bold">{f.n}</div>
          <h2 className={cn('m-0 text-[21px] leading-[1.3] font-bold', INK)}>
            <Stored as="span" body={f.headline} figures={figures} />
          </h2>
        </div>
        {f.saw.map((p, i) => <Stored key={i} body={p} figures={figures} className={cn('m-0 text-[16px] leading-[1.6]', INK)} />)}
        {f.means ? (
          <div className="flex flex-col gap-1.5">
            <div className={cn('text-[12px] font-bold tracking-[0.08em] uppercase', INK)}>What it means</div>
            <Stored body={f.means} figures={figures} className={cn('m-0 text-[16px] leading-[1.6]', INK)} />
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-3 lg:col-span-2 lg:pt-9">
        {f.quote ? <QuotePanel quote={f.quote} names={names} /> : null}
        <div className="flex flex-col gap-1">
          <CodeLine body={f.evidence} figures={figures} className={cn('text-[13px]', WHO_MUTED)} />
          {f.who ? <BrandWho parts={f.who} names={names} prefix={monthPrefix(data.month)} className="text-[13px]" /> : null}
          <CodeLine body={f.context} figures={figures} verdict className={cn('text-[13px]', INK)} />
        </div>
      </div>
    </article>
  )
}

/** The read: In short, then every finding. */
export function WeekReadCard({ data }: { data: WeekReadPageData }) {
  return (
    <Card className="gap-3.5 px-8 pt-7 pb-2.5">
      {data.lead ? (
        <>
          <div className="text-[12px] font-bold tracking-[0.08em] text-[#C2410C] uppercase">In short</div>
          <Stored body={data.lead} figures={data.figures} className={cn('m-0 max-w-[1000px] font-serif text-[24px] leading-[1.4] font-medium', INK)} />
        </>
      ) : null}
      <div className="flex flex-col">
        {data.findings.map((f) => <Finding key={f.n} f={f} data={data} />)}
      </div>
    </Card>
  )
}

/** "Also heard this week": the conversations no finding rests on. */
export function AlsoHeardCard({ data }: { data: WeekReadPageData }) {
  if (data.alsoHeard.length === 0) return null
  return (
    <Card className="gap-3.5 px-7 py-6">
      <h2 className={cn('m-0 text-[20px] font-bold', INK)}>Also heard this week</h2>
      <div className="flex flex-col">
        {data.alsoHeard.map((x, i) => (
          <div key={i} className={cn('flex items-start justify-between gap-3 border-t py-2.5 text-[15px]', HAIR)}>
            <div className="flex min-w-0 flex-col gap-[3px]">
              <span data-copy="subject" data-slot="pass_b_theme" className={cn('font-semibold', INK)}>{x.label}</span>
              {x.who ? <BrandWho parts={x.who} names={data.names} /> : null}
            </div>
            <span className={cn('shrink-0', WHO_MUTED)}><span data-copy="figure">{x.videos}</span> videos</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

/** The neutral line for a workspace with no read yet (ruling U2). */
export const WEEK_READ_FIRST = 'Your market’s first week will appear here.'

export function WeekReadPage({ data, title }: { data: WeekReadPageData | null; title: string }) {
  return (
    <div className="flex flex-col gap-[22px]">
      <PageTitle>{title}</PageTitle>
      {data && data.findings.length > 0 ? (
        <>
          <WeekReadCard data={data} />
          <AlsoHeardCard data={data} />
        </>
      ) : (
        <Card className="px-7 py-6">
          <p className={cn('m-0 text-[15px]', WHO_MUTED)}>{WEEK_READ_FIRST}</p>
        </Card>
      )}
    </div>
  )
}
