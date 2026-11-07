import Link from 'next/link'
import type { ReactNode } from 'react'
import { CARD, GoLink, SectionHead } from '@/components/v2'
import { BTN_PRIMARY } from '@/components/v2/look'
import { fmtInt } from '@/lib/format'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import type { Elsewhere } from '@/lib/pages/v2/content-levels'
import { CONTENT_ROOT } from '@/lib/pages/v2/content-address'
import { cn } from '@/lib/utils'
import { Sentence } from './parts'

// CONTENT'S LEVEL PAGES, THE PIECES THEY SHARE (depth as pages, 17 Oct; the
// G5 boards): the level tiles (a post idea is a lightbulb on the yellow, the
// HUB; the reply list a reply arrow and your posts a person, each on the
// neutral, the EVIDENCE), drawn exactly as the boards draw them; the one calm
// line an address that names nothing prints; "Elsewhere on Content"; and the
// Agent's card. Server components, no client code.

type Glyph = { className?: string }

function Svg({ className, children }: Glyph & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn('shrink-0', className)}>
      {children}
    </svg>
  )
}

/** A post idea: a lightbulb. */
export function LightbulbGlyph(p: Glyph) {
  return <Svg {...p}><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></Svg>
}

/** The reply list: a reply arrow. */
export function ReplyGlyph(p: Glyph) {
  return <Svg {...p}><path d="M20 18v-2a4 4 0 0 0-4-4H4" /><path d="m9 17-5-5 5-5" /></Svg>
}

/** Your posts: a person. */
export function PersonGlyph(p: Glyph) {
  return <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></Svg>
}

/** A sub-question: a question mark in a ring. */
export function QuestionGlyph(p: Glyph) {
  return <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></Svg>
}

export type ContentLevel = 'idea' | 'replies' | 'posts'

/** The level's tile: 46px, its glyph 22px (38px and 19px on a phone), the
 *  idea on the yellow, the two evidence pages on the neutral. */
export function ContentLevelTile({ level }: { level: ContentLevel }) {
  const Glyph = level === 'idea' ? LightbulbGlyph : level === 'replies' ? ReplyGlyph : PersonGlyph
  return (
    <span aria-hidden data-level-tile={level} className={cn('flex size-[46px] shrink-0 items-center justify-center rounded-[11px] max-sm:size-[38px] max-sm:rounded-[10px]', level === 'idea' ? 'bg-accent text-orange-text' : 'bg-track text-secondary-foreground')}>
      <Glyph className="size-[22px] max-sm:size-[19px]" />
    </span>
  )
}

export const BACK_TO_CONTENT = 'Back to Content'

/** An address that names nothing Content shows: one calm line and the way
 *  back, never a 404. */
export function ContentMissing({ line }: { line: string }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p data-content-missing="" className="m-0 text-[15px] text-muted-foreground">{line}</p>
      <GoLink href={CONTENT_ROOT}>{BACK_TO_CONTENT}</GoLink>
    </div>
  )
}

/** The Agent at a page's foot (the Content boards' last tile): its line and
 *  the yellow button, the page's one primary, with no icon; the button under
 *  the line on a phone. */
export function AskCard({ line, label, href }: { line: string; label: string; href: string }) {
  return (
    <section aria-label="Ask the Agent" className={cn(CARD, 'flex-row flex-wrap items-center justify-between gap-6 max-sm:gap-3')}>
      <p className="m-0 min-w-0 flex-[1_1_420px] text-[15.5px] leading-[1.55]">{line}</p>
      <Link href={href} className={cn(BTN_PRIMARY, 'no-underline max-sm:w-full')}>{label}</Link>
    </section>
  )
}

/** A tile of the foot, the whole tile its link (the board's). */
const SIB = cn(CARD, 'gap-1.5 text-foreground no-underline transition-shadow hover:shadow-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground')
const SIB_TITLE = 'text-[16px] leading-[1.35] font-semibold underline decoration-control underline-offset-4'
const SIB_LINE = 'text-[14px] leading-[1.5] text-secondary-foreground'

/** One idea in the foot: its title (`stored`), and "Post idea 1, in 48 of 640
 *  videos from 14 Sep to 11 Oct and 31 in October so far." (decision 1: the
 *  four weeks beside their month; their base is no figures row's here, so it
 *  stays). */
function IdeaSibling({ idea }: { idea: Elsewhere['ideas'][number] }) {
  return (
    <>
      <span data-copy="stored" data-slot="post_idea" className={SIB_TITLE}>{idea.title}</span>
      <span className={SIB_LINE}>
        Post idea {idea.rank}
        {idea.read && idea.month != null ? (
          <>, in <span data-copy="level">{fmtInt(idea.read.k)} of {fmtInt(idea.read.n)} videos</span> from {idea.readLabel} and <span data-copy="figure">{fmtInt(idea.month)}</span> {idea.monthWords}</>
        ) : null}.
      </span>
    </>
  )
}

/** "Elsewhere on Content": the root's first two ideas and the other evidence
 *  page, a tile each (stacked on a phone), "Open Content" in the head, and in
 *  a medical market the medical team line once under the ideas (decision 14). */
export function ElsewhereSection({ data }: { data: Elsewhere }) {
  return (
    <section aria-labelledby="elsewhere-title" className="flex flex-col">
      <SectionHead id="elsewhere-title" title="Elsewhere on Content" action={<GoLink href={CONTENT_ROOT}>Open Content</GoLink>} />
      <nav aria-label="Elsewhere on Content" data-elsewhere="" className="mt-[22px] grid grid-cols-1 gap-5 lg:grid-cols-3">
        {data.ideas.map((i) => <Link key={i.id} href={i.href} className={SIB}><IdeaSibling idea={i} /></Link>)}
        {data.ideas.length === 0 ? (
          <Link href={CONTENT_ROOT} className={SIB}>
            <span className={SIB_TITLE}>What to post next</span>
            <span className={SIB_LINE}>{data.ideasLine}</span>
          </Link>
        ) : null}
        <Link href={data.page.href} className={SIB}>
          <span className={SIB_TITLE}>{data.page.label}</span>
          <span className={SIB_LINE}><Sentence parts={data.page.line} />.</span>
        </Link>
      </nav>
      {data.medical && data.ideas.length > 0 ? <p data-medical-line="" className="m-0 mx-0.5 mt-3.5 text-[14px] leading-[1.5] text-secondary-foreground">{MEDICAL_LINE}</p> : null}
    </section>
  )
}

/** The evidence pages' rail and its facts (F3's `.rail3`; a card on a phone). */
export const FACT = 'flex min-w-0 flex-col gap-[9px] border-t border-border py-4 first-of-type:border-t-0 first-of-type:pt-2'
export const RAIL = 'flex min-w-0 flex-col sm:-mx-2 sm:px-2 max-sm:rounded-[14px] max-sm:bg-card max-sm:px-[18px] max-sm:pt-4 max-sm:pb-1.5 max-sm:shadow-card'

/** A rail fact's row (the boards' `.fact .rrow`): 13px, its name wider than
 *  the kit's, so "Elsewhere in your market" holds one line in the 300px rail. */
export const RAIL_ROW = 'text-[13px] grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_26px]'

/** A rail fact's small caps label. */
export function FactLabel({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{children}</p>
}

/** The evidence pages' "Show more" button. */
export const MORE = 'inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-lg bg-card px-3.5 text-[13.5px] font-semibold text-foreground no-underline ring-1 ring-border hover:bg-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** A video's play mark, the evidence cards' 36px tile. */
export function VideoTile() {
  return (
    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-track text-foreground">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="size-[15px]"><path d="m8 6 10 6-10 6z" /></svg>
    </span>
  )
}
