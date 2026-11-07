import type { ReactNode } from 'react'
import { MovementBadge, nonAnswerParts, signedChange } from '@/components/delta-badge'
import { fmtInt } from '@/lib/format'
import type { Verdict } from '@/lib/reading/verdicts'
import { cn } from '@/lib/utils'

// Your products' furniture (depth v2, T5; since the audit design, 7 Nov,
// drawn to the Products boards): the buttons, the link, the big figure and
// its words, and the verdict as the page prints it. Written out whole so Tailwind's scanner sees them, in the app's
// tokens (palette A; no literal colour, no shadow of our own: cards are the
// kit's `CARD`, panels the kit's `InPlacePanel`). The pieces Voices already
// draws (a figure, a level, a mini bar row, the panel's tag and Ask button)
// are Voices' own, imported, never copied.

export { AskButton, CAPS, EmptyLine, Fig, LevelText, MiniRow, PanelTag } from '@/components/pages/v2/voices/parts'

// The buttons live in ./buttons so the client Tag control can import them
// without pulling the page's loader (and its server imports) into the browser.
export { BTN, BTN_INK } from './buttons'

/** A card's figure (the boards' 32px at 700, its words in 15px beside it,
 *  under a hairline): "3 videos in September", "43 of 43 name none of your
 *  products". `of` prints the figure as "k of n", two figures. */
export function MidFigure({ value, of, children }: { value: number; of?: number; children?: ReactNode }) {
  return (
    <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-track pt-3.5">
      <span className="text-[32px] leading-none font-bold tabular-nums text-foreground">
        {/* "k of n" is a level, so the copy contract sees its base. */}
        {of != null ? <span data-copy="level">{fmtInt(value)} of {fmtInt(of)}</span> : <span data-copy="figure">{fmtInt(value)}</span>}
      </span>
      {children ? <span className="text-[15px] text-secondary-foreground">{children}</span> : null}
    </p>
  )
}

/** "7 of its 9 videos": two figures, so the denominator is printed whatever
 *  the words between them. */
export function OfIts({ k, n, noun = 'videos' }: { k: number; n: number; noun?: string }) {
  return <><span data-copy="figure">{fmtInt(k)}</span> of its <span data-copy="figure">{fmtInt(n)}</span> {noun}</>
}

/** A verdict, banded, as the page prints it: inside its own verdict node.
 *  `answersOnly` prints only an answer (moved, or no clear change) and
 *  leaves out the thin and refused ones, for a tight space like a shelf
 *  column's head. */
export function VerdictBadge({ verdict, answersOnly = false, className }: { verdict: Verdict | null; answersOnly?: boolean; className?: string }) {
  if (!verdict || verdict.state === 'refused') return null
  if (answersOnly && verdict.state !== 'moved' && verdict.state !== 'no_clear_change') return null
  // A non-answer in the screen's words: the word and its change in commas
  // ("No clear change, +2 pts"), never the badge's " · " (the audit design);
  // a movement keeps the badge.
  const nonAnswer = nonAnswerParts(verdict, 'pts')
  if (nonAnswer) {
    return (
      <span data-copy="verdict" title={nonAnswer.title} className={cn('text-[13px] text-muted-foreground', className)}>
        {nonAnswer.word.charAt(0).toUpperCase() + nonAnswer.word.slice(1)}{nonAnswer.change != null ? <>, <span className="whitespace-nowrap">{signedChange(nonAnswer.change, 'pts')}</span></> : null}
      </span>
    )
  }
  return (
    <span data-copy="verdict" className={cn('text-[13px]', className)}>
      <MovementBadge verdict={verdict} unit="pts" good="neutral" bandTip />
    </span>
  )
}
