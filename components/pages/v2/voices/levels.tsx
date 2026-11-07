import Link from 'next/link'
import type { ReactNode } from 'react'
import { translationNote } from '@/components/quote-block'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { BTN_PRIMARY, CARD, commaCite, GoLink, PeriodSwitch, QUOTE, translationLine, type Period, type PeriodOption } from '@/components/v2'
import { surface } from '@/lib/nav'
import { BACK_TO_VOICES, type LevelMonth, type LevelQuote } from '@/lib/pages/v2/voices-levels'
import { VOICES_ONE_MONTH } from '@/lib/pages/v2/voices'
import { cn } from '@/lib/utils'

// THE PARTS VOICES' LEVEL PAGES SHARE (G3, 17 Oct): the level tiles (a group
// is people on the hub yellow; a brand is a tag on its colour role, yours or a
// rival's; a creator is a camera on the evidence neutral, since a video keeps
// the play mark), the month switch as Voices honours it, the hub's figure
// strip, a comment labelled with its conversation, the Agent's box and the
// calm missing state. Server components, no client code.

type Glyph = { className?: string }

function Svg({ className, children }: Glyph & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn('shrink-0', className)}>
      {children}
    </svg>
  )
}

/** A group: people (the boards' glyph). */
export function PeopleGlyph(p: Glyph) {
  return <Svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Svg>
}

/** A brand: a tag. */
export function TagGlyph(p: Glyph) {
  return <Svg {...p}><path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z" /><circle cx="7.5" cy="7.5" r="1.5" /></Svg>
}

/** A creator: a camera. */
export function CameraGlyph(p: Glyph) {
  return <Svg {...p}><path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 10.5" /><rect x="2" y="6" width="14" height="12" rx="2" /></Svg>
}

export type VoicesLevel = 'group' | 'brand' | 'creator'

const TILE: Record<'group' | 'rival' | 'you' | 'creator', string> = {
  group: 'bg-accent text-orange-text',
  rival: 'bg-comp text-white',
  you: 'bg-you text-you-foreground',
  creator: 'bg-track text-secondary-foreground',
}

/** A level's tile in the title block: 46px, its glyph 22px (38px and 19px on
 *  a phone), as Market's `LevelTile`. A brand's in its colour role. */
export function VoicesLevelTile({ level, you = false }: { level: VoicesLevel; you?: boolean }) {
  const tone = level === 'brand' ? (you ? 'you' : 'rival') : level
  const Glyph = level === 'group' ? PeopleGlyph : level === 'brand' ? TagGlyph : CameraGlyph
  return (
    <span aria-hidden data-level-tile={level} className={cn('flex size-[46px] shrink-0 items-center justify-center rounded-[11px] max-sm:size-[38px] max-sm:rounded-[10px]', TILE[tone])}>
      <Glyph className="size-[22px] max-sm:size-[19px]" />
    </span>
  )
}

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

/** A section's head on a level page (the boards' `.sec`): its title, its note
 *  at the right (under it on a phone). */
export function LevelSection({ id, title, note }: { id?: string; title: ReactNode; note?: ReactNode }) {
  return (
    <div id={id} className="mt-3.5 flex scroll-mt-6 items-baseline justify-between gap-3 px-0.5 max-sm:mt-2.5 max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
      <h2 className="m-0 text-[19px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground max-sm:text-[18px]">{title}</h2>
      {note ? <span className="text-[13px] leading-[1.4] text-muted-foreground">{note}</span> : null}
    </div>
  )
}

/** A small caps label (the boards' `.dlabel`). */
export function Caps({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('m-0 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground', className)}>{children}</p>
}
