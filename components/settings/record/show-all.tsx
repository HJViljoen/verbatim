import type { ReactNode } from 'react'

import { fmtInt } from '@/lib/format'

/**
 * A LONG LOG SHOWS ITS LATEST FIVE, THEN "Show all N" (Heinrich's default, 26
 * Sep, R-b): the reject log's set-aside posts, the recorded settings changes
 * and the reconstructed ones. The rest sit in a native disclosure, so:
 *
 *   - it needs no client JavaScript: `<details>` and `<summary>` open and close
 *     themselves, and the page stays a server component;
 *   - it is keyboard reachable: a summary is focusable, and Enter or Space
 *     toggles it, announced as a disclosure with its state;
 *   - it prints every row: `details[data-print-all]` is opened for print in
 *     app/globals.css (its `::details-content` made visible, the summary
 *     hidden), so a printed record is the whole record.
 *
 * `count` is what "all" shows, which a caller states in its own unit: a log
 * that draws repeated entries on one line ("×6") counts entries, not lines.
 * Under `shown` lines there is no control at all.
 *
 * A LOG READ ONLY IN PART NEVER SAYS "all" (deploy 2 review): the reject log
 * reads the twenty most recent set-aside posts of thousands, so "Show all 20"
 * claimed a whole it does not hold. Such a log passes `capped`, and its control
 * reads "Show the 20 most recent".
 */

/** How many lines of a long log show before its "Show all N". */
export const LOG_LINES_SHOWN = 5

export function ShowAll<T>({
  items, count, render, shown = LOG_LINES_SHOWN, capped = false,
}: {
  items: readonly T[]
  /** How many "all" is, in the log's own unit (entries). */
  count: number
  render: (item: T, index: number) => ReactNode
  shown?: number
  /** The items are only the most recent part of a longer log. */
  capped?: boolean
}) {
  const head = items.slice(0, shown)
  const rest = items.slice(shown)
  return (
    <>
      {head.map((item, i) => render(item, i))}
      {rest.length > 0 ? (
        <details data-print-all="" className="group/all">
          <summary className="flex min-h-[44px] w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm text-[14px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="underline decoration-border decoration-1 underline-offset-[5px] group-open/all:hidden">{capped ? `Show the ${fmtInt(count)} most recent` : `Show all ${fmtInt(count)}`}</span>
            <span className="hidden underline decoration-border decoration-1 underline-offset-[5px] group-open/all:inline">Show the latest {fmtInt(head.length)}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-muted-foreground transition-transform group-open/all:rotate-180 motion-reduce:transition-none">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </summary>
          {rest.map((item, i) => render(item, shown + i))}
        </details>
      ) : null}
    </>
  )
}
