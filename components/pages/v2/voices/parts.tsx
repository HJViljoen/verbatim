import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyBox, LBL, TickBar } from '@/components/v2'
import { TAG } from '@/components/colour-roles'
import { fmtCompact, fmtInt } from '@/lib/format'
import { quoteWords } from '@/lib/pages/brands'
import { notMeasuredLine } from '@/lib/pages/not-measured'
import type { VoicesQuote } from '@/lib/pages/v2/voices'
import { FAILED_EXPLAINED, SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { cn } from '@/lib/utils'

// The small pieces the Voices page draws more than once (depth v2, T4; boards
// E3-Voices and E3-Voices-Open; since the audit design, 7 Nov, drawn to
// Voices.dc.html from the kit): a name with its bar and count, a phrase, a
// quote card, the panel's tag and its Ask button. Your products re-exports
// `CAPS`, `Fig`, `LevelText`, `MiniRow`, `EmptyLine`, `AskButton`
// and `PanelTag` (components/pages/v2/products/parts.tsx), so they keep their
// names and take the kit's look in place.

/** A label in sentence case (the kit's `LBL`; the name kept for Your
 *  products). */
export const CAPS = cn('m-0', LBL)

/** One figure, in tabular sans. */
export function Fig({ children, className }: { children: ReactNode; className?: string }) {
  return <span data-copy="figure" className={cn('tabular-nums', className)}>{children}</span>
}

/** "96 of 318 videos": one level node, so it carries its denominator. */
export function LevelText({ k, n, unit, className }: { k: number; n: number; unit?: string; className?: string }) {
  return (
    <span data-copy="level" className={cn('tabular-nums', className)}>
      {fmtInt(k)} of {fmtInt(n)}{unit ? ` ${unit}` : ''}
    </span>
  )
}

/**
 * A name, its bar and its count at the row's end (the board's three columns:
 * the name, a 72px bar, the count). `max` is the list's largest count: the
 * bar is drawn against it (decision 5, `toMax`: the largest row is full).
 * Without it the bar is drawn against `of`, as before. The row prints k
 * alone, so the block's head names the n ("of their 121 videos"); `of` is
 * what the screen reader hears ("27 of 121").
 */
export function MiniRow({ label, k, of, max, tone = 'market', className }: {
  label: ReactNode
  k: number
  of: number
  max?: number
  tone?: 'market' | 'you' | 'rival' | 'ink'
  size?: 'sm' | 'md'
  className?: string
}) {
  const base = max ?? of
  const pct = base > 0 ? (100 * k) / base : 0
  return (
    <div className={cn('grid grid-cols-[minmax(0,1fr)_72px_30px] items-center gap-x-3.5 text-[14.5px] leading-[1.4]', className)}>
      <span className="min-w-0 text-foreground">{label}</span>
      <TickBar pct={pct} tone={tone} size="md" label={`${fmtInt(k)} of ${fmtInt(of)}`} />
      <Fig className="text-right text-foreground">{fmtInt(k)}</Fig>
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
    <p data-subject-failed="" className={cn('m-0 text-[13.5px] leading-[1.5] text-muted-foreground', className)}>
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
    <p data-subjects-not-measured="" className={cn('m-0 text-[13.5px] leading-[1.5] text-muted-foreground', className)}>
      {line ?? <><Fig>{fmtInt(count)}</Fig> more {count === 1 ? 'subject' : 'subjects'} not measured yet</>}
    </p>
  )
}

/** RULING U6, a box with no ready subject: the one short line naming the
 *  subjects not measured yet (SUBJECT_NOT_MEASURED alone where a dump names
 *  none), said in the dashed box in the rows' place (decision 4: the box
 *  keeps its frame, with no empty tracks). */
export function NotMeasuredRows({ subjects }: { rows?: number; size?: 'sm' | 'md'; subjects?: readonly { id: string; label: string }[] }) {
  return (
    <EmptyBox>
      <p data-subjects-not-measured="" className="m-0">{notMeasuredLine(subjects) ?? SUBJECT_NOT_MEASURED}</p>
    </EmptyBox>
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
