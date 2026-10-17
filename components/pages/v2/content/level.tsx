import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { CARD } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import type { Elsewhere } from '@/lib/pages/v2/content-levels'
import { CONTENT_ROOT } from '@/lib/pages/v2/content-address'
import { cn } from '@/lib/utils'
import { OLINK, Sentence } from './parts'

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
    <div className="flex flex-col gap-2">
      <p data-content-missing="" className="m-0 text-[15px] text-muted-foreground">{line}</p>
      <Link href={CONTENT_ROOT} className={OLINK}>{BACK_TO_CONTENT} →</Link>
    </div>
  )
}

/** The boards' section head between blocks: its title, a quiet note at the
 *  right (under it on a phone). */
export function ContentSectionHead({ id, title, note, action }: { id?: string; title: string; note?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-3.5 flex items-baseline justify-between gap-3 px-0.5 max-sm:mt-2.5 max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
      <h2 id={id} className="m-0 text-[19px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground max-sm:text-[18px]">{title}</h2>
      {note ? <span className="text-[13px] leading-[1.4] text-muted-foreground">{note}</span> : null}
      {action}
    </div>
  )
}

/** The Agent's yellow button. */
export const ASK = 'inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-lg bg-brand px-3.5 text-[13.5px] font-semibold text-brand-foreground no-underline transition-colors hover:bg-brand/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** The Agent at a page's foot: a card from 640 (its line and its button), the
 *  button alone and full width on a phone, as Market's level pages close. */
export function AskCard({ line, label, href }: { line: string; label: string; href: string }) {
  return (
    <>
      <section aria-label="Ask the Agent" className={cn(CARD, 'flex-row flex-wrap items-center justify-between gap-3.5 px-[26px] py-5 max-sm:hidden')}>
        <p className="m-0 text-[14.5px] text-secondary-foreground">{line}</p>
        <Link href={href} className={ASK}><Sparkles className="size-3.5" aria-hidden />{label}</Link>
      </section>
      <Link href={href} className={cn(ASK, 'justify-center sm:hidden')}><Sparkles className="size-3.5" aria-hidden />{label}</Link>
    </>
  )
}

const SIB = 'flex min-w-0 flex-col gap-1.5 rounded-[12px] bg-card px-4 pt-3.5 pb-[13px] no-underline shadow-card transition-shadow hover:shadow-panel'

/** One idea in the foot: its title (`stored`), "Post idea 1 · 48 of 640
 *  videos, 14 Sep to 11 Oct · 31 in October so far", and in a medical market
 *  the medical team line, as under every printed idea. */
function IdeaSibling({ idea, medical }: { idea: Elsewhere['ideas'][number]; medical: boolean }) {
  return (
    <>
      <span data-copy="stored" data-slot="post_idea" className="text-[14px] leading-[1.35] font-semibold text-foreground">{idea.title}</span>
      <span className="text-[12.5px] leading-[1.45] text-muted-foreground">
        Post idea {idea.rank}
        {idea.read && idea.month != null ? (
          <> · <span data-copy="level"><span className="font-mono text-foreground">{fmtInt(idea.read.k)}</span> of {fmtInt(idea.read.n)} videos</span>, {idea.readLabel} · <span data-copy="figure" className="font-mono text-foreground">{fmtInt(idea.month)}</span> {idea.monthWords}</>
        ) : null}
      </span>
      {medical ? <span data-medical-line="" className="text-[12px] leading-[1.4] text-muted-foreground">{MEDICAL_LINE}</span> : null}
    </>
  )
}

/** "Elsewhere on Content": the root's first two ideas and the other evidence
 *  page, three cards from 640, a list in one card on a phone, then the root. */
export function ElsewhereSection({ data }: { data: Elsewhere }) {
  const root = <Link href={CONTENT_ROOT} className={OLINK}>Content →</Link>
  const page = (
    <>
      <span className="text-[14px] leading-[1.35] font-semibold text-foreground">{data.page.label}</span>
      <span className="text-[12.5px] leading-[1.45] text-muted-foreground"><Sentence parts={data.page.line} /></span>
    </>
  )
  return (
    <>
      <div className="max-sm:hidden"><ContentSectionHead title="Elsewhere on Content" action={root} /></div>
      <nav aria-label="Elsewhere on Content" data-elsewhere="" className="grid grid-cols-1 gap-3 max-sm:hidden lg:grid-cols-3">
        {data.ideas.map((i) => <Link key={i.id} href={i.href} className={SIB}><IdeaSibling idea={i} medical={data.medical ?? false} /></Link>)}
        {data.ideas.length === 0 ? (
          <Link href={CONTENT_ROOT} className={SIB}>
            <span className="text-[14px] leading-[1.35] font-semibold text-foreground">What to post next</span>
            <span className="text-[12.5px] leading-[1.45] text-muted-foreground">{data.ideasLine}</span>
          </Link>
        ) : null}
        <Link href={data.page.href} className={SIB}>{page}</Link>
      </nav>
      <section aria-label="Elsewhere on Content" className={cn(CARD, 'gap-3 sm:hidden')}>
        <h2 className="m-0 text-[17px] leading-[1.3] font-semibold text-foreground">Elsewhere on Content</h2>
        <div className="flex flex-col">
          {data.ideas.map((i) => <Link key={i.id} href={i.href} className="flex min-w-0 flex-col gap-1 border-t border-track py-[11px] no-underline first:border-t-0 first:pt-0"><IdeaSibling idea={i} medical={data.medical ?? false} /></Link>)}
          {data.ideas.length === 0 ? (
            <Link href={CONTENT_ROOT} className="flex min-w-0 flex-col gap-1 border-t border-track py-[11px] no-underline first:border-t-0 first:pt-0">
              <span className="text-[14px] font-semibold text-foreground">What to post next</span>
              <span className="text-[12.5px] text-muted-foreground">{data.ideasLine}</span>
            </Link>
          ) : null}
          <Link href={data.page.href} className="flex min-w-0 flex-col gap-1 border-t border-track py-[11px] no-underline first:border-t-0 first:pt-0">{page}</Link>
        </div>
        {root}
      </section>
    </>
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
