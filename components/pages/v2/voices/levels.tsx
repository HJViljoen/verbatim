import Link from 'next/link'
import type { ReactNode } from 'react'
import { translationNote } from '@/components/quote-block'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { BTN_PRIMARY, CARD, commaCite, GoLink, PeriodSwitch, QUOTE, translationLine, type Period, type PeriodOption } from '@/components/v2'
import { surface } from '@/lib/nav'
import { BACK_TO_VOICES, type LevelMonth, type LevelQuote } from '@/lib/pages/v2/voices-levels'
import { VOICES_ONE_MONTH } from '@/lib/pages/v2/voices'
import { cn } from '@/lib/utils'

// THE PARTS VOICES' LEVEL PAGES SHARE (G3, 17 Oct; since the audit design, 7
// Nov, drawn to the Voices boards): the month switch as Voices honours it
// with its line, a state's line, a comment as a tile labelled with its
// conversation, the Agent's tile and the calm missing state. Server
// components, no client code.

/** The month switch as Voices honours it on a level page: the month on, by
 *  its name ("October", "November so far"), the week and over time shown and
 *  not offered (a group has no reading of either yet, decision 2); the
 *  reason is their tooltip and the line under the switch (the boards'). */
export function LevelMonthSwitch({ month, href, reason = VOICES_ONE_MONTH }: { month: Pick<LevelMonth, 'month' | 'monthWords'>; href: string; reason?: string }) {
  const options: PeriodOption<Period>[] = [
    { value: 'week', label: 'This week', disabled: reason },
    { value: 'month', label: month.monthWords },
    { value: 'time', label: 'Over time', disabled: reason },
  ]
  return (
    <div className="flex flex-col items-end gap-2 max-sm:items-start">
      <PeriodSwitch value="month" options={options} hrefFor={() => href} />
      <p data-voices-one-month="" className="m-0 max-w-[360px] text-right text-[13px] leading-[1.45] text-muted-foreground max-sm:text-left">{reason}</p>
    </div>
  )
}

/** A page whose address names nothing Voices follows: one calm line inside
 *  the page, and the way back. */
export function VoicesLevelMissing({ line }: { line: string }) {
  return (
    <PageFrame className="text-foreground">
      <PageBar title={surface('voices').label} />
      <div className="flex flex-col gap-2">
        <p data-voices-missing="" className="m-0 text-[15px] text-muted-foreground">{line}</p>
        <GoLink href={surface('voices').href} className="self-start">{BACK_TO_VOICES}</GoLink>
      </div>
    </PageFrame>
  )
}

/** A state said in one line inside its card. */
export const GAPLINE = 'm-0 text-[15px] leading-[1.55] text-muted-foreground max-sm:text-[14.5px]'

// ---- a comment, labelled ----------------------------------------------------------------

/** One comment as the audit design's boards draw it on a level page (7 Nov):
 *  a tile, its conversation's link above, the commenter's words in the serif,
 *  its language line and its English where it has them, then where and when
 *  in commas ("TikTok, 9 Oct"). */
export function LevelQuoteTile({ q }: { q: LevelQuote }) {
  const note = translationNote({ lang: q.lang, english: q.english })
  const line = translationLine({ language: note.language, english: note.english })
  return (
    <article className={CARD}>
      <figure className="m-0 flex min-w-0 flex-col gap-2">
        {q.from ? (
          <GoLink href={q.from.href} className="self-start text-[13.5px]">
            <span data-quote-from=""><span data-copy="subject" data-slot="pass_b_theme">{q.from.label}</span></span>
          </GoLink>
        ) : null}
        <blockquote data-copy="quote" className={cn('m-0 text-foreground', QUOTE, 'text-[17px] leading-[1.5]')}>“{q.text}”</blockquote>
        {line ? <span className="text-[13px] text-muted-foreground">{line}</span> : null}
        {note.english ? <p data-copy="quote" className="m-0 text-[15px] leading-[1.55] text-secondary-foreground">{note.english}</p> : null}
        {q.cite ? <figcaption className="text-[13.5px] text-muted-foreground">{commaCite(q.cite)}</figcaption> : null}
      </figure>
    </article>
  )
}

// ---- the Agent ---------------------------------------------------------------------------

/** The Agent's tile at a page's foot (the boards': the line, then the yellow
 *  button, no icon), 48px under what it follows. */
export function AskBox({ text, href, button }: { text: ReactNode; href: string; button: ReactNode }) {
  return (
    <section aria-label="Ask the Agent" className={cn(CARD, 'mt-[26px] flex-row flex-wrap items-center justify-between gap-5')}>
      <p className="m-0 text-[16px] leading-[1.5] text-foreground">{text}</p>
      <Link href={href} className={cn(BTN_PRIMARY, 'no-underline max-sm:w-full')}>{button}</Link>
    </section>
  )
}
