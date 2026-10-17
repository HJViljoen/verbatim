import type { CSSProperties } from 'react'

import { shortDate } from '@/lib/format'
import type { AdviceCard } from '@/lib/pages/v2/moves'
import { cn } from '@/lib/utils'
import { MONO } from './parts'

// "How long we have been saying it" (boards E6-Moves-Open, G6-Moves-Advice):
// every update that raised a piece of advice, as dots on one line with their
// dates under them. Drawn on the advice's page (its history); the root's
// cards draw the nine dots small (`UnitSquares`).

/** Which of a history row's dates print, so none run into another: every
 *  one from 640px to the panel's two-column 1180, where the right column is
 *  narrow, and again from 1320; on a phone and between 1180 and 1320, every
 *  other one counted back from the newest (at most five of nine). */
const DATE_SPACED = 'max-sm:hidden min-[1180px]:max-[1319.98px]:hidden'

/**
 * Every update that raised it, as dots on one line with their dates under
 * them (the board's row).
 *
 * THE NINE-DOT ROW where every date it has is among the card's nine latest
 * updates (`recent`): a dark dot and its date where an update raised it, a
 * pale one where it did not, so a piece raised once or twice keeps the
 * board's row. Its dates thin out where the column is narrow (`DATE_SPACED`).
 *
 * THE LIST otherwise (an older date the nine do not reach): every date, five
 * to a row on a phone, six in the two-column panel from 1180, nine from 1320,
 * twelve between; the line that joins them is drawn only where they fit one
 * row everywhere (five or fewer).
 */
export function Timeline({ history }: { history: AdviceCard['history'] }) {
  const { dates, recent } = history
  if (dates.length === 0) return null
  const carried = recent.filter(Boolean).length
  if (carried === dates.length && dates.length < recent.length) {
    let at = 0
    const slots = recent.map((on) => ({ on, date: on ? dates[at++] ?? null : null }))
    const last = slots.length - 1
    return (
      <ol
        className="relative m-0 grid list-none p-0 [grid-template-columns:repeat(var(--cw),minmax(0,1fr))]"
        style={{ '--cw': slots.length } as CSSProperties}
        aria-label="The updates that raised it"
      >
        <span aria-hidden className="absolute top-[4px] h-px bg-border" style={{ left: `calc(50% / ${slots.length})`, right: `calc(50% / ${slots.length})` }} />
        {slots.map((s, i) => (
          <li key={`${s.date ?? 'none'}-${i}`} className="relative flex min-w-0 flex-col items-center gap-1.5" aria-hidden={s.on ? undefined : true}>
            <span aria-hidden className={cn('size-2.5 rounded-full', s.on ? 'bg-foreground' : 'bg-track')} />
            {s.date ? <span className={cn(MONO, 'whitespace-nowrap text-[10px] text-muted-foreground', (last - i) % 2 === 0 ? null : DATE_SPACED)}>{shortDate(s.date)}</span> : null}
          </li>
        ))}
      </ol>
    )
  }
  const n = dates.length
  return (
    <ol
      className="relative m-0 grid list-none gap-y-3 p-0 [grid-template-columns:repeat(var(--cn),minmax(0,1fr))] sm:[grid-template-columns:repeat(var(--cw),minmax(0,1fr))] min-[1180px]:[grid-template-columns:repeat(var(--c6),minmax(0,1fr))] min-[1320px]:[grid-template-columns:repeat(var(--c9),minmax(0,1fr))]"
      style={{ '--cn': Math.min(n, 5), '--cw': Math.min(n, 12), '--c6': Math.min(n, 6), '--c9': Math.min(n, 9) } as CSSProperties}
      aria-label="The updates that raised it"
    >
      {n > 1 && n <= 5 ? <span aria-hidden className="absolute top-[4px] h-px bg-border" style={{ left: `calc(50% / ${n})`, right: `calc(50% / ${n})` }} /> : null}
      {dates.map((d, i) => (
        <li key={`${d}-${i}`} className="relative flex min-w-0 flex-col items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-foreground" />
          <span className={cn(MONO, 'whitespace-nowrap text-[10px] text-muted-foreground')}>{shortDate(d)}</span>
        </li>
      ))}
    </ol>
  )
}

