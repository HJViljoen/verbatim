import { shortDate } from '@/lib/format'
import type { AdviceCard } from '@/lib/pages/v2/moves'

// "How long we have been saying it" (boards E6-Moves-Open, G6-Moves-Advice;
// since the audit design, 7 Nov, Moves-Advice.dc.html): every update that
// raised a piece of advice, as dated rules, the oldest first, three to a row
// on a phone and five from 640. No dots: a date is the mark.

/** Every update that raised it, as dated rules (the board's row). */
export function Timeline({ history }: { history: AdviceCard['history'] }) {
  const { dates } = history
  if (dates.length === 0) return null
  return (
    <ol aria-label="The updates that raised it" className="m-0 grid list-none grid-cols-3 gap-3 p-0 sm:grid-cols-5">
      {dates.map((d, i) => (
        <li key={`${d}-${i}`} data-update-date="" className="border-t-2 border-foreground pt-2 text-[15px] font-semibold whitespace-nowrap tabular-nums">{shortDate(d)}</li>
      ))}
    </ol>
  )
}
