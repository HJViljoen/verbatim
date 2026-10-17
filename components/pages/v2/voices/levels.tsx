import Link from 'next/link'
import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { translationLabel, translationNote } from '@/components/quote-block'
import { BubbleGlyph, LayersGlyph } from '@/components/shell/level-glyphs'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { CARD, PeriodSwitch, type Period, type PeriodOption } from '@/components/v2'
import { longMonth } from '@/lib/format'
import { monthHeading } from '@/lib/reading/month-label'
import { surface } from '@/lib/nav'
import { BACK_TO_VOICES, type LevelMonth, type LevelQuote } from '@/lib/pages/v2/voices-levels'
import { VOICES_ONE_MONTH } from '@/lib/pages/v2/voices'
import { cn } from '@/lib/utils'
import { OLINK } from './parts'

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

/** A small tile inside a card or a row (the boards' `.mt`): each names the
 *  level it opens (a subject's layers or a group's people on yellow, a
 *  conversation's bubble on the neutral). */
export function MiniTile({ kind, size = 'md' }: { kind: 'subject' | 'group' | 'conversation'; size?: 'md' | 'sm' }) {
  const Glyph = kind === 'subject' ? LayersGlyph : kind === 'group' ? PeopleGlyph : BubbleGlyph
  return (
    <span aria-hidden className={cn(
      'flex shrink-0 items-center justify-center',
      size === 'md' ? 'size-[26px] rounded-[7px]' : 'size-[22px] rounded-[6px]',
      kind === 'conversation' ? 'bg-track text-secondary-foreground' : 'bg-accent text-orange-text',
    )}>
      <Glyph className={size === 'md' ? 'size-3.5' : 'size-3'} />
    </span>
  )
}

/** The month switch as Voices honours it on a level page: the month on, named
 *  as decision 3 names a month column, the week and over time shown and not
 *  offered (a group has no reading of either yet, decision 2). */
export function LevelMonthSwitch({ month, href, reason = VOICES_ONE_MONTH }: { month: Pick<LevelMonth, 'month' | 'monthLabel'>; href: string; reason?: string }) {
  const options: PeriodOption<Period>[] = [
    { value: 'week', label: 'This week', disabled: reason },
    { value: 'month', label: monthHeading(longMonth(month.month), month.monthLabel) },
    { value: 'time', label: 'Over time', disabled: reason },
  ]
  return <PeriodSwitch value="month" options={options} hrefFor={() => href} />
}

/** A page whose address names nothing Voices follows: one calm line inside
 *  the page, and the way back. */
export function VoicesLevelMissing({ line }: { line: string }) {
  return (
    <PageFrame className="text-foreground">
      <PageBar title={surface('voices').label} />
      <div className="flex flex-col gap-2">
        <p data-voices-missing="" className="m-0 text-[15px] text-muted-foreground">{line}</p>
        <Link href={surface('voices').href} className={OLINK}>{BACK_TO_VOICES} →</Link>
      </div>
    </PageFrame>
  )
}

// ---- the hub's header card -------------------------------------------------------------

/** The boards' `.pcard`: a page card's padding and rhythm (Market's). */
export const PAGE_CARD = cn(CARD, 'gap-[26px] sm:px-[34px] sm:pt-[30px] sm:pb-8 max-sm:gap-5 max-sm:px-[18px] max-sm:py-5')
/** Written prose on a page (the boards' `.read`). */
export const READ = 'm-0 text-[15.5px] leading-[1.62] text-foreground max-sm:text-[15px] max-sm:leading-[1.6]'
/** A state said in one line inside its card. */
export const GAPLINE = 'm-0 text-[15px] leading-[1.55] text-muted-foreground max-sm:text-[14.5px]'
const EYEBROW = 'm-0 text-[12px] font-semibold uppercase tracking-[0.06em] text-orange-text'

export const FV = 'font-mono text-[34px] leading-none font-medium tracking-[-0.02em] tabular-nums text-foreground max-sm:text-[26px]'
export const FW = 'text-[22px] leading-[34px] font-semibold tracking-[-0.01em] text-foreground max-sm:text-[17px] max-sm:leading-[26px]'
export const FL = 'text-[13.5px] leading-[1.4] text-foreground max-sm:text-[12.5px]'
export const FS = 'text-[12.5px] leading-[1.4] text-muted-foreground max-sm:text-[12px]'

/** One figure of the strip (the boards' `.fig`): four in a row from 1180, two
 *  to a row under it and on a phone, a hairline between. */
export function HubFig({ children }: { children: ReactNode }) {
  return (
    <div data-fig="" className="flex min-w-0 flex-col gap-1.5 border-border px-[22px] pt-5 pb-[22px] max-sm:px-4 max-sm:pt-[15px] max-sm:pb-4 min-[1180px]:border-l min-[1180px]:first:border-l-0 min-[1180px]:first:pl-[34px] max-[1179px]:odd:pl-[34px] max-[1179px]:even:border-l max-[1179px]:[&:nth-child(n+3)]:border-t max-sm:odd:pl-[18px]">
      {children}
    </div>
  )
}

/** The bar under a level figure (the boards' `.sbar`), in a colour role. */
export function HubBar({ pct, tone = 'market' }: { pct: number; tone?: 'market' | 'rival' | 'you' }) {
  return (
    <div aria-hidden className="relative mt-1 mb-0.5 h-2.5 max-w-[240px] rounded-[5px] bg-border">
      <div className={cn('absolute inset-y-0 left-0 rounded-[5px]', tone === 'rival' ? 'bg-comp' : tone === 'you' ? 'bg-you' : 'bg-brand')} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}

/** The hub card: its eyebrow, its lead (stored prose, never invented), then
 *  the four figures inside the card. */
export function HubCard({ id, eyebrow, lead, label, children }: { id: string; eyebrow: ReactNode; lead: ReactNode | null; label: string; children: ReactNode }) {
  return (
    <article id={id} aria-label={label} className={cn(CARD, 'gap-[22px] overflow-hidden sm:px-[34px] sm:pt-[30px] sm:pb-0 max-sm:gap-4 max-sm:px-[18px] max-sm:pt-5 max-sm:pb-0')}>
      <div className="flex flex-col gap-2.5">
        <p className={EYEBROW}>{eyebrow}</p>
        {lead}
      </div>
      <div role="group" aria-label={`${label} in figures`} data-strip="" className="-mx-[34px] mt-1.5 grid grid-cols-2 border-t border-track bg-inner max-sm:-mx-[18px] max-sm:mt-1 min-[1180px]:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,1fr))]">
        {children}
      </div>
    </article>
  )
}

/** The hub's lead sentence (the boards' `.hubhd`). */
export const HUB_LEAD = 'm-0 max-w-[900px] text-[32px] leading-[1.24] font-semibold tracking-[-0.02em] text-foreground max-sm:text-[23px] max-sm:leading-[1.28]'

// ---- a comment, labelled ----------------------------------------------------------------

/** One comment (the boards' `.qpanel`), labelled with its conversation where
 *  the page names one; its words the commenter's own, translated as every
 *  quote is (the original, the label, the English). */
export function LevelQuoteCard({ q }: { q: LevelQuote }) {
  const note = translationNote({ lang: q.lang, english: q.english })
  const label = translationLabel(note)
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-1.5 rounded-[10px] bg-inner px-[15px] py-[13px]">
      {q.from ? (
        <Link href={q.from.href} data-quote-from="" className="mb-0.5 inline-flex items-center gap-1.5 self-start text-[12px] font-semibold text-secondary-foreground no-underline underline-offset-[3px] hover:text-foreground hover:underline">
          <BubbleGlyph className="size-3 text-muted-foreground" />
          <span data-copy="subject" data-slot="pass_b_theme">{q.from.label}</span>
        </Link>
      ) : null}
      <blockquote data-copy="quote" className="m-0 font-serif text-[15.5px] italic leading-[1.5] text-foreground max-sm:text-[15px]">“{q.text}”</blockquote>
      {label ? <span className="text-[12px] text-muted-foreground">{label}</span> : null}
      {note.english ? <p data-copy="quote" className="m-0 text-[14px] leading-[1.5] text-foreground">{note.english}</p> : null}
      {q.cite ? <figcaption className="text-[12px] text-muted-foreground">{q.cite}</figcaption> : null}
    </figure>
  )
}

// ---- the Agent ---------------------------------------------------------------------------

const ASK = 'inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-lg bg-brand px-3.5 text-[13.5px] font-semibold text-brand-foreground no-underline transition-colors hover:bg-brand/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** The Agent's box at a page's foot; on a phone the button alone, full width. */
export function AskBox({ text, href, button }: { text: ReactNode; href: string; button: ReactNode }) {
  return (
    <>
      <section aria-label="Ask the Agent" className={cn(CARD, 'flex-row flex-wrap items-center justify-between gap-3.5 px-[26px] py-5 max-sm:hidden')}>
        <p className="m-0 text-[14.5px] text-secondary-foreground">{text}</p>
        <Link href={href} className={ASK}><Sparkles className="size-3.5" aria-hidden />{button}</Link>
      </section>
      <Link href={href} className={cn(ASK, 'justify-center sm:hidden')}><Sparkles className="size-3.5" aria-hidden />{button}</Link>
    </>
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

/** A dashed empty track where a figure would be (the boards' `.etrack`):
 *  decoration, the words say why once. */
export function EmptyBar({ className }: { className?: string }) {
  return <span aria-hidden data-empty-track="" className={cn('block h-2 rounded-full border border-dashed border-foreground/20', className)} />
}
