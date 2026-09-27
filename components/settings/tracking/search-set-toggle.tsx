'use client'

import { useState, type ReactNode } from 'react'

// The search set's one control (market-first WP3.10, the approved preview's
// "Queue a change"): it opens the editor in the card's place, and closes it
// again. The editor is the page's one form (app/dashboard/settings/
// tracking-form.tsx) with every save path it had: the terms, the brands you
// track, the communities you watch, each logged with its actor, and, where the
// searches are held still, queued for the 1st rather than written.

export function SearchSetBody({ banner, button, read, editor }: {
  /** The strip over the set: what holds it still, and what is queued. */
  banner: ReactNode
  /** The control's words ("Queue a change"); null where this reader cannot
   *  change the set, and no control is drawn. */
  button: string | null
  /** The set as it is read: each group's searches with their days. */
  read: ReactNode
  /** The editor, drawn in the set's place while it is open. */
  editor: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {banner || button ? (
        <div className="flex flex-col gap-4 rounded-lg bg-inner p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-6">
          <div className="min-w-0">{banner}</div>
          {button ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls="search-set-editor"
              onClick={() => setOpen((o) => !o)}
              className="inline-flex h-11 shrink-0 items-center justify-center self-start whitespace-nowrap rounded-lg bg-tile px-4 text-[14px] font-medium text-foreground ring-1 ring-border transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:self-center"
            >
              {open ? 'Close' : button}
            </button>
          ) : null}
        </div>
      ) : null}
      {open ? <div id="search-set-editor">{editor}</div> : read}
    </>
  )
}
