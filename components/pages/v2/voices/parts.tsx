import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { TickBar } from '@/components/v2'
import { TAG } from '@/components/colour-roles'
import { fmtCompact, fmtInt } from '@/lib/format'
import { quoteWords } from '@/lib/pages/brands'
import { notMeasuredLine } from '@/lib/pages/not-measured'
import type { VoicesPlatform, VoicesQuote } from '@/lib/pages/v2/voices'
import { FAILED_EXPLAINED, SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { cn } from '@/lib/utils'

// The small pieces the Voices page draws more than once (depth v2, T4; boards
// E3-Voices and E3-Voices-Open): the board's `.mini` row (a name, a short
// bar, its count), the platform strip (`.plat`), a phrase chip (`.phr`), a
// quote card (`.qpanel`), the panel's tag and its Ask button.

/** The board's `.olink`: an orange-text link, 13.5px semibold. */
export const OLINK = 'text-[13.5px] font-semibold text-orange-text no-underline hover:underline hover:underline-offset-[3px]'

/** The board's small caps label (`.ptag`, `.dlabel`). */
export const CAPS = 'm-0 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'

/** One mono figure. */
export function Fig({ children, className }: { children: ReactNode; className?: string }) {
  return <span data-copy="figure" className={cn('font-mono tabular-nums', className)}>{children}</span>
}

/** "96 of 318 videos": one level node, so it carries its denominator. */
export function LevelText({ k, n, unit, className }: { k: number; n: number; unit?: string; className?: string }) {
  return (
    <span data-copy="level" className={cn('font-mono tabular-nums', className)}>
      {fmtInt(k)} of {fmtInt(n)}{unit ? ` ${unit}` : ''}
    </span>
  )
}

/**
 * A name, a short bar of k against n, and k at the row's end (the board's
 * `.mini`, 6px track). `of` is what the bar is drawn against; the row prints
 * k alone, so the block's head names the n ("of their 96").
 */
export function MiniRow({ label, k, of, tone = 'market', size = 'sm', className }: {
  label: ReactNode
  k: number
  of: number
  tone?: 'market' | 'you' | 'rival' | 'ink'
  size?: 'sm' | 'md'
  className?: string
}) {
  const pct = of > 0 ? (100 * k) / of : 0
  return (
    <div className={cn('grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_34px] items-center gap-2', size === 'md' ? 'text-[13.5px]' : 'text-[12.5px]', className)}>
      <span className="min-w-0 leading-[1.3] text-foreground">{label}</span>
      <TickBar pct={pct} tone={tone} size={size === 'md' ? 'md' : 'sm'} label={`${fmtInt(k)} of ${fmtInt(of)}`} />
      <Fig className="text-right text-[12px] text-foreground">{fmtInt(k)}</Fig>
    </div>
  )
}

/** A subject being re-described, named, with its reason (FAILED_EXPLAINED):
 *  said ONCE on the page (14 Oct, the lead's ruling), in the foot of "Who's
 *  in your market" (`FailedSubjectsFoot`), never on each card. The tenant's
 *  subject, never a claim that a set holds it: the sentence says it shows no
 *  figure. */
export function FailedSubjectLine({ label, className }: { label: string; className?: string }) {
  return (
    <p data-subject-failed="" className={cn('m-0 text-[12.5px] leading-[1.45] text-muted-foreground', className)}>
      {/* The name, then the sentence: FAILED_EXPLAINED opens with its own
          colon ("Being re-described: …"), so the name takes a full stop,
          never a second colon (the fresh check, 14 Oct). */}
      <span className="font-medium text-foreground">{label}.</span> {FAILED_EXPLAINED}
    </p>
  )
}

/** The page's one place for why each subject being re-described shows no
 *  figure: one calm line a subject, under a hairline. Nothing where none is. */
export function FailedSubjectsFoot({ failed }: { failed?: readonly { id: string; label: string }[] }) {
  if (!failed || failed.length === 0) return null
  return (
    <div data-subjects-failed="" className="flex flex-col gap-1 border-t border-track pt-3">
      {failed.map((f) => <FailedSubjectLine key={f.id} label={f.label} />)}
    </div>
  )
}

/** RULING U6, a box's one short line under its ready rows: every subject of
 *  the client's whose check has not passed, open or failed, NAMED in the
 *  subjects' order (14 Oct: a tracked subject is named, never folded into a
 *  count): "Not measured yet: Cost & access, Fit & comfort"
 *  (`notMeasuredLine`). The tenant's list, never which of them this set
 *  holds, which rests on their membership. A dump from before the names
 *  carries a count alone and prints it as it did. Nothing where none is. */
export function PendingSubjectsLine({ subjects, count = 0, className }: { subjects?: readonly { id: string; label: string }[]; count?: number; className?: string }) {
  const line = notMeasuredLine(subjects)
  if (!line && count <= 0) return null
  return (
    <p data-subjects-not-measured="" className={cn('m-0 text-[12px] leading-[1.4] text-muted-foreground', className)}>
      {line ?? <><Fig>{fmtInt(count)}</Fig> more {count === 1 ? 'subject' : 'subjects'} not measured yet</>}
    </p>
  )
}

/** RULING U6, a box with no ready subject: the one short line naming the
 *  subjects not measured yet (SUBJECT_NOT_MEASURED alone where a dump names
 *  none), and the rows' empty tracks under it, so the box keeps its frame and
 *  roughly its height (the parity pass: the component carries the gap). */
export function NotMeasuredRows({ rows = 2, size = 'sm', subjects }: { rows?: number; size?: 'sm' | 'md'; subjects?: readonly { id: string; label: string }[] }) {
  return (
    <>
      <p data-subjects-not-measured="" className={cn('m-0 leading-[1.4] text-muted-foreground', size === 'md' ? 'text-[13.5px]' : 'text-[12.5px]')}>{notMeasuredLine(subjects) ?? SUBJECT_NOT_MEASURED}</p>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_34px] items-center gap-2">
          <span className="block h-2.5 w-3/5 rounded-full border border-dashed border-foreground/15" />
          <span className="block h-2 rounded-full border border-dashed border-foreground/15" />
          <span />
        </div>
      ))}
    </>
  )
}

/** Each platform's fill: ink and greys, never a colour that means a party
 *  (gold is you, the orange is a flag). */
const PLATFORM_FILL: Record<string, string> = {
  tiktok: 'bg-foreground',
  instagram: 'bg-comp',
  youtube: 'bg-foreground/25',
  reddit: 'bg-foreground/55',
}

/** A strip of where a set of videos sits, and the counts under it in words
 *  (the board's `.plat` and its `.cmeta`). A video is on one platform, so the
 *  parts make the whole. */
export function PlatformStrip({ platforms, label }: { platforms: readonly VoicesPlatform[]; label: string }) {
  const total = platforms.reduce((s, p) => s + p.k, 0)
  if (total === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <div role="img" aria-label={`${label}: ${platforms.map((p) => `${p.label} ${p.k}`).join(', ')}`} className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        {platforms.map((p) => (
          <span key={p.platform} className={cn('h-full', PLATFORM_FILL[p.platform] ?? 'bg-foreground/40')} style={{ width: `${(100 * p.k) / total}%` }} />
        ))}
      </div>
      <div className="text-[12.5px] leading-[1.4] text-muted-foreground">
        {/* Each platform holds together; the line breaks between them, at
            the separator, where a narrow card cannot hold all four (T9). */}
        {platforms.map((p, i) => (
          <Fragment key={p.platform}>
            {i > 0 ? ' · ' : null}<span className="whitespace-nowrap">{p.label} <Fig>{fmtInt(p.k)}</Fig></span>
          </Fragment>
        ))}
      </div>
    </div>
  )
}

/** "182K followers", or nothing where none can be stated (Reddit). */
export function Followers({ n, word }: { n: number | null; word: string }) {
  if (n == null) return null
  return <><Fig>{fmtCompact(n)}</Fig> {word}</>
}

/** One of their phrases (`.phr`): a commenter's own words, so a quote node. */
export function Phrase({ text, english }: { text: string; english?: string | null }) {
  const words = quoteWords({ text, english: english ?? null })
  if (!words) return null
  return (
    <span data-copy="quote" lang={english ? 'en' : undefined} className="mr-1.5 mb-1.5 inline-block rounded-lg bg-inner px-2.5 py-1.5 font-serif text-[14px] italic leading-[1.35] text-foreground">
      “{words}”
    </span>
  )
}

/** A quote card (`.qpanel`): the words, then where and when. */
export function QuoteCard({ quote }: { quote: VoicesQuote }) {
  // Its English where the comment was not, emoji taken out (the pages print
  // none), as every quote on the v2 pages reads (`quoteWords`).
  const words = quoteWords(quote)
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-1.5 rounded-[10px] bg-inner px-[15px] py-[13px]">
      <blockquote data-copy="quote" className="m-0 font-serif text-[15.5px] italic leading-[1.5] text-foreground">“{words}”</blockquote>
      {quote.cite ? <figcaption className="text-[12px] text-muted-foreground">{quote.cite}</figcaption> : null}
    </figure>
  )
}

/** The panel's tag (`.tag`): "Group", "Brand", "Creator". */
export function PanelTag({ children }: { children: ReactNode }) {
  return <span className={cn('inline-block whitespace-nowrap rounded-md px-2 py-[3px] text-[12px] leading-[1.3]', TAG)}>{children}</span>
}

/** The panel's foot (`.pfoot`): Ask, on the brand yellow. */
export function AskButton({ href, children, after }: { href: string; children: ReactNode; after?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-[18px] border-t border-track pt-5">
      <Link
        href={href}
        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13.5px] font-semibold text-brand-foreground no-underline transition-colors hover:bg-brand/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Sparkles aria-hidden className="size-3.5" strokeWidth={2} />
        {children}
      </Link>
      {/* The boards' foot carries a link beside the button (Your products:
          "See the 52 videos and every comment"). */}
      {after}
    </div>
  )
}

/** A grey line a block prints in place of what it cannot show. */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">{children}</p>
}
