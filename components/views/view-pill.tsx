import Link from 'next/link'

import type { RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import { viewLine, type ViewNote, type ViewState } from '@/lib/views/state'
import type { ViewChoice } from '@/lib/views/view'
import { cn } from '@/lib/utils'

// The view pill (market-first decision F; plan §2.4 C1 "a view switch:
// Everything · Buyers · Makers"; WP3.3), drawn as the approved preview draws
// it under "The market in the month" (Conversation.dc.html): a 44px tinted
// group of three 36px segments, the pressed one white on a hairline with the
// preview's small shadow, then one quiet mono note after it.
//
// LINKS, NOT BUTTONS. The view is in the URL (`?view=`), as the month and the
// horizon are, so each option IS an address: it can be shared, opened in a new
// tab and kept by an export. `aria-current` marks the pressed one.
//
// NOTHING IS DRAWN WHILE NO VIEW IS LIVE (lib/views/config.ts): a control that
// does nothing is not drawn. On a page printed or sent there is no control at
// all, only the view in one line ("Buyers · 243 makers’ and off-topic videos
// set aside"), so a PDF of the Buyers view never passes for the whole market.

/** The pill's three options. Empty choices draw nothing. */
export function ViewPill({ choices, className }: { choices: readonly ViewChoice[]; className?: string }) {
  if (choices.length === 0) return null
  return (
    <nav aria-label="View" className={cn('inline-flex h-11 max-w-full items-center gap-1 rounded-lg bg-inner px-1', className)} data-print-hide>
      {choices.map((c) => (
        <Link key={c.pill} href={c.href} aria-current={c.active ? 'page' : undefined} className="inline-flex h-11 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span
            className={cn(
              'inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-[4px] px-3.5 text-[14px] leading-none transition-colors',
              c.active
                ? 'bg-tile font-semibold text-foreground shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(38,41,44,0.06)]'
                : 'font-medium text-muted-foreground hover:text-foreground',
            )}
          >
            {c.label}
          </span>
        </Link>
      ))}
    </nav>
  )
}

/** The note's words, its count as its own figure. */
function NoteWords({ note, email }: { note: ViewNote; email?: boolean }) {
  if (note.count == null) return <>{note.words}</>
  return (
    <>
      <span data-copy="figure" style={email ? { fontFamily: FONT.mono } : undefined}>{fmtInt(note.count)}</span> {note.words}
    </>
  )
}

/**
 * The pill and its note, or on a printed or sent page the view in one line.
 * Null where the page reads no view (no state) or has nothing to say.
 */
export function ViewRow({ state, mode = 'app', className }: { state: ViewState | null | undefined; mode?: RenderMode; className?: string }) {
  if (!state) return null
  if (mode === 'app') {
    if (state.choices.length === 0 && !state.note) return null
    return (
      <div className={cn('flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2', className)}>
        <ViewPill choices={state.choices} />
        {state.note ? (
          <span className="font-mono text-[13px] leading-[1.5] text-muted-foreground">
            <NoteWords note={state.note} />
          </span>
        ) : null}
      </div>
    )
  }
  const line = viewLine(state)
  if (!line) return null
  if (mode === 'email') {
    return (
      <p style={{ fontFamily: FONT.mono, fontSize: 12, color: EMAIL.muted, margin: '10px 0 0' }}>
        {line.label}{line.note ? <> · <NoteWords note={line.note} email /></> : null}
      </p>
    )
  }
  return (
    <p className={cn('m-0 font-mono text-[13px] leading-[1.5] text-muted-foreground', className)}>
      {line.label}{line.note ? <> · <NoteWords note={line.note} /></> : null}
    </p>
  )
}
