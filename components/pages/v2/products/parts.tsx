import type { ReactNode } from 'react'
import { MovementBadge } from '@/components/delta-badge'
import { fmtInt } from '@/lib/format'
import { sharePct, type Level } from '@/lib/pages/v2/products'
import type { Verdict } from '@/lib/reading/verdicts'
import { cn } from '@/lib/utils'

// Your products' furniture (depth v2, T5; boards E4-Products and
// E4-Products-Liners): the board's two buttons, its link, the big figure and
// its words, a k-of-n bar with its level, and the verdict badge as the page
// prints it. Written out whole so Tailwind's scanner sees them, in the app's
// tokens (palette A; no literal colour, no shadow of our own: cards are the
// kit's `CARD`, panels the kit's `InPlacePanel`). The pieces Voices already
// draws (a figure, a level, a mini bar row, the panel's tag and Ask button)
// are Voices' own, imported, never copied.

export { AskButton, CAPS, EmptyLine, Fig, LevelText, MiniRow, OLINK, PanelTag } from '@/components/pages/v2/voices/parts'

/** The board's `.btn`: 38px, the inner ground, ink words. */
export const BTN =
  'inline-flex min-h-[38px] cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-inner px-3.5 text-[13.5px] font-semibold text-foreground no-underline transition-colors hover:bg-track focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60'

/** The board's `.btn.ink`: ink with white words. */
export const BTN_INK =
  'inline-flex min-h-[38px] cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3.5 text-[13.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60'

/** The board's `.mid`: a card's 30px figure, its words beside it in mono. */
export function MidFigure({ value, children }: { value: number; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span data-copy="figure" className="font-mono text-[30px] font-medium leading-none tracking-[-0.02em] tabular-nums text-foreground">{fmtInt(value)}</span>
      {children ? <span className="font-mono text-[12.5px] text-muted-foreground">{children}</span> : null}
    </div>
  )
}

/** "7 of its 9 videos": two figures, so the denominator is printed whatever
 *  the words between them. */
export function OfIts({ k, n, noun = 'videos' }: { k: number; n: number; noun?: string }) {
  return <><span data-copy="figure">{fmtInt(k)}</span> of its <span data-copy="figure">{fmtInt(n)}</span> {noun}</>
}

/** The board's two-bar comparison row: a name, "k of n · pct", and the bar
 *  (the market's yellow, or the client's gold). */
export function ShareRow({ name, level, tone }: { name: ReactNode; level: Level; tone: 'market' | 'you' }) {
  const pct = level.n > 0 ? Math.min(100, (100 * level.k) / level.n) : 0
  return (
    <div>
      <div className="flex justify-between gap-3 text-[12.5px] leading-[1.35]">
        <span className={cn('min-w-0', tone === 'you' ? 'font-medium' : null)}>{name}</span>
        <span className="shrink-0 font-mono tabular-nums">
          <span data-copy="level">{fmtInt(level.k)} of {fmtInt(level.n)}</span> · <span data-copy="figure">{sharePct(level.k, level.n)}</span>
        </span>
      </div>
      <div role="img" aria-label={`${fmtInt(level.k)} of ${fmtInt(level.n)}`} className="relative mt-[5px] h-2 rounded-full bg-track">
        {pct > 0 ? <i className={cn('absolute inset-y-0 left-0 rounded-full', tone === 'you' ? 'bg-you' : 'bg-brand')} style={{ width: `${pct}%` }} /> : null}
      </div>
    </div>
  )
}

/** A verdict, banded, as the page prints it: inside its own verdict node.
 *  `answersOnly` prints only an answer (moved, or no clear change) and
 *  leaves out the thin and refused ones, for a tight space like a shelf
 *  column's head. */
export function VerdictBadge({ verdict, answersOnly = false, className }: { verdict: Verdict | null; answersOnly?: boolean; className?: string }) {
  if (!verdict || verdict.state === 'refused') return null
  if (answersOnly && verdict.state !== 'moved' && verdict.state !== 'no_clear_change') return null
  return (
    <span data-copy="verdict" className={cn('text-[11.5px]', className)}>
      <MovementBadge verdict={verdict} unit="pts" good="neutral" bandTip />
    </span>
  )
}
