'use client'

import { useActionState, useState } from 'react'
import { renameTrackedRival, type RenameState } from './rivals-actions'

// Rename a rival, from the rivals table. Closed until asked for: renaming is
// rare, it is a break in the series, and a text box sitting open beside every
// rival invites the one edit this product cannot undo.
//
// NO <form> ELEMENT, ON PURPOSE — the same rule `community-controls.tsx`
// states in its own docblock and for the same reason. This control is rendered
// in a `GridRow` cell inside `TrackingForm`'s single `<form action={saveTracking}>`,
// and HTML has no nested form: React 19.2.4 logs "<form> cannot contain a
// nested <form>", throws "A React form was unexpectedly submitted" and fires
// NEITHER action, so the reader pressed Rename and nothing happened at all.
// So the dispatch is called directly with a `FormData` (React 19 allows a
// `useActionState` dispatch outside a form), which also means a rename cannot
// carry the reader's unsaved term and rival edits into an action that knows
// nothing about them.
//
// AND THE CONTROL SURVIVES ITS OWN CLICK — the C4 rule the cell next door
// already carries. This returned the success message INSTEAD of the button,
// and `useActionState` keeps its last result for the component's life: the
// action's `revalidatePath` re-renders the row but does not remount this
// component, because the row's key is `r.identity.id` and a rename does not
// change it. So after one successful rename the row's Rename control was gone
// until a full page reload. The notice is now a sibling of the button, and
// `renameNotice` (pure, tested) says which notice a closed cell still owes.

const initial: RenameState = { ok: false, message: '' }

/**
 * What a closed rename cell still has to say.
 *
 * `useActionState` keeps its last result forever and the action's revalidate
 * does not remount the component, so the only thing that spends a result is the
 * ROW coming back under a different name. A REFUSAL is about the name the
 * reader pressed against — once the row is renamed under it, that refusal
 * describes a state that no longer exists, so it goes. A SUCCESS stays: its
 * sentence carries the count of posts rewritten and the name the frozen months
 * stay under, and the row itself carries neither.
 *
 * Pure, so the rule is tested rather than inferred from a screenshot.
 */
export function renameNotice(
  name: string,
  firedFor: string | null,
  state: RenameState,
): { text: string; refused: boolean } | null {
  if (firedFor === null || state.message === '') return null
  if (!state.ok) return firedFor === name ? { text: state.message, refused: true } : null
  return { text: state.message, refused: false }
}

export function RivalRename({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(name)
  const [firedFor, setFiredFor] = useState<string | null>(null)
  const [state, dispatch, pending] = useActionState(renameTrackedRival, initial)
  const notice = renameNotice(name, firedFor, state)
  // The rename landed: the server has re-rendered the row under a new name, so
  // the editor has nothing left to edit and the cell closes itself.
  const landed = firedFor !== null && firedFor !== name

  function send() {
    if (draft.trim() === '' || pending) return
    setFiredFor(name)
    const data = new FormData()
    data.set('id', id)
    data.set('name', draft)
    dispatch(data)
  }

  if (!open || landed) {
    return (
      <span className="flex flex-col items-end gap-0.5">
        <button
          type="button"
          onClick={() => { setDraft(name); setFiredFor(null); setOpen(true) }}
          className="shrink-0 rounded-[3px] text-[11.5px] font-medium text-secondary-foreground transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          Rename
        </button>
        {notice && (
          <span
            role={notice.refused ? 'alert' : 'status'}
            className={notice.refused ? 'text-right text-[11px] leading-[1.3] text-negative' : 'text-right text-[11px] leading-[1.3] text-muted-foreground'}
          >
            {notice.text}
          </span>
        )}
      </span>
    )
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`rename-${id}`}>New name for {name}</label>
        <input
          id={`rename-${id}`}
          // Named so nothing else reads it: the sub-page's one form posts every
          // field it holds, and this one belongs to a different action.
          name="rival_new_name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          // Enter renames; it never submits the page's one form.
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send() } }}
          maxLength={80}
          className="min-w-0 flex-1 rounded-[4px] border border-input bg-tile px-2.5 py-1 text-[12.5px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || draft.trim() === ''}
          className="shrink-0 rounded-[4px] bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Renaming…' : 'Rename'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="shrink-0 rounded-[3px] text-[12px] text-muted-foreground hover:underline">Cancel</button>
      </div>
      <p className="text-left text-[11px] text-muted-foreground">
        The months already counted stay under the old name — they cannot be moved, and we would rather show you
        one line with the change marked on it than quietly restate history.
      </p>
      {state.message && !state.ok && <p role="alert" className="text-left text-[11.5px] text-negative">{state.message}</p>}
    </div>
  )
}
