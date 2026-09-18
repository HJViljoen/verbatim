'use client'

import { useActionState, useState } from 'react'
import { updateCommunity } from '@/app/dashboard/settings/actions'
import type { SettingsFormState } from '@/app/dashboard/settings/actions'
import { CONTROL, FIELD, MonoNote } from '@/components/settings/chrome'
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
 *  in and nobody put on the list. */
export function CommunityAction({ name, op, canEdit }: { name: string; op: 'add' | 'stop'; canEdit: boolean }) {
  const [state, dispatch, pending] = useActionState(updateCommunity, idle)

  if (state.message) {
    return <span className={cn('text-[11.5px]', state.ok ? 'text-muted-foreground' : 'text-negative')} role="status">{state.message}</span>
  }

  return (
    <button
      type="button"
      disabled={!canEdit || pending}
      onClick={() => {
        const data = new FormData()
        data.set('op', op)
        data.set('name', name)
        dispatch(data)
      }}
      className="rounded-[3px] text-[12px] font-medium text-foreground transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Saving…' : op === 'stop' ? 'Stop watching' : 'Watch it'}
    </button>
  )
}

/** The add row under the table. */
export function CommunityAdd({ canEdit, note }: { canEdit: boolean; note: string }) {
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
        <MonoNote className="max-w-[420px]">{note}</MonoNote>
      </div>
      {state.message && (
        <span className={cn('text-[11.5px]', state.ok ? 'text-muted-foreground' : 'text-negative')} role="status">{state.message}</span>
      )}
    </div>
  )
}
