'use client'

import { useActionState, useState } from 'react'
import { updateCommunity } from '@/app/dashboard/settings/actions'
import type { SettingsFormState } from '@/app/dashboard/settings/actions'
import { CONTROL, FIELD, MonoNote, ROW_CONTROL } from '@/components/settings/chrome'
import { cn } from '@/lib/utils'

// `settings.reddit.col.action` and `settings.reddit.add` — the two Reddit
// controls, which this page has never had. Wave 1 wrote the validation
// (`applySubredditEdit`) and the action (`updateCommunity`); these are the
// buttons.
//
// NO <form> ELEMENT, ON PURPOSE. The whole sub-page is one form — the artboard
// has one save row at its foot — and a form inside a form is not a thing HTML
// has. So these dispatch their server action directly (React 19 lets
// `useActionState`'s dispatch be called with a FormData outside a form), which
// also means pressing "Stop watching" cannot carry the reader's unsaved term
// edits into an action that knows nothing about them.
//
// STOPPING DEMOTES, IT DOES NOT DELETE. That rule lives in the action and its
// pure half, not here; what belongs here is the WORD. "Stop watching" is the
// client's decision, and the row that comes back reads "you stopped watching
// it" rather than "ruled out", which is ours.

const idle: SettingsFormState = { ok: false, message: '' }

/** The per-row control: stop watching, or start on a row the search dragged
 *  in and nobody put on the list.
 *
 *  THE CONTROL SURVIVES ITS OWN CLICK. It used to return the status message
 *  INSTEAD of the button, and `useActionState` keeps its last result forever —
 *  the action's `revalidatePath` re-renders the row but does not remount this
 *  component, so a failed write left the reader an error and no way to retry,
 *  and a successful one left "Saved…" sitting where the row's newly correct
 *  "Watch it" belonged until a full reload. The message is now a sibling of
 *  the button, and it retires by itself: `firedFor` remembers which way the row
 *  pointed when the click went out, so when the server comes back with the row
 *  flipped, the message about the old state goes with it. */
export function CommunityAction({ name, op, proposed = false, canEdit }: { name: string; op: 'add' | 'stop'; proposed?: boolean; canEdit: boolean }) {
  const [state, dispatch, pending] = useActionState(updateCommunity, idle)
  const [firedFor, setFiredFor] = useState<'add' | 'stop' | null>(null)
  const message = rowMessage(op, firedFor, state.message)

  return (
    <span className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={!canEdit || pending}
        onClick={() => {
          setFiredFor(op)
          const data = new FormData()
          data.set('op', op)
          data.set('name', name)
          dispatch(data)
        }}
        className={ROW_CONTROL}
      >
        {/* A PROPOSAL IS NOT A THING WE ARE WATCHING. A candidate is a
            community discovery found and nobody chose, and nothing is read
            from it — so the control that turns it down cannot say "stop". */}
        {pending ? 'Saving…' : op === 'add' ? 'Watch it' : proposed ? 'Don’t watch it' : 'Stop watching'}
      </button>
      {message && (
        <span
          className={cn('text-right text-[11px] leading-[1.3]', state.ok ? 'text-muted-foreground' : 'text-negative')}
          role={state.ok ? 'status' : 'alert'}
        >
          {message}
        </span>
      )}
    </span>
  )
}

/**
 * Which message a row still has to show.
 *
 * `useActionState` keeps its last result for the life of the component and the
 * action's `revalidatePath` does not remount it, so the only thing that says a
 * result is spent is the ROW changing direction: a click sent while the row
 * said "Stop watching" is answered by a row that says "Watch it". Pure, so the
 * rule is tested rather than inferred from a screenshot.
 */
export function rowMessage(op: 'add' | 'stop', firedFor: 'add' | 'stop' | null, message: string): string {
  if (firedFor !== null && firedFor !== op) return ''
  return message
}

/** The add row under the table. */
export function CommunityAdd({ canEdit, note }: { canEdit: boolean; note?: string }) {
  const [draft, setDraft] = useState('')
  const [state, dispatch, pending] = useActionState(updateCommunity, idle)

  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
          disabled={!canEdit || pending}
          placeholder="r/OneBagTravel"
          aria-label="A community to watch"
          // Named so that nothing else on the page reads it: the sub-page's one
          // form posts every field it holds, and this one belongs to a
          // different action entirely.
          name="community_to_add"
          className={cn(FIELD, 'w-[280px] max-w-full')}
        />
        <button
          type="button"
          disabled={!canEdit || pending || draft.trim() === ''}
          onClick={() => {
            const data = new FormData()
            data.set('op', 'add')
            data.set('name', draft)
            dispatch(data)
          }}
          className={CONTROL}
        >
          {pending ? 'Saving…' : 'Watch this community'}
        </button>
        {note ? <MonoNote className="max-w-[420px]">{note}</MonoNote> : null}
      </div>
      {state.message && (
        <span
          className={cn('text-[11.5px]', state.ok ? 'text-muted-foreground' : 'text-negative')}
          role={state.ok ? 'status' : 'alert'}
        >
          {state.message}
        </span>
      )}
    </div>
  )
}
