'use client'

import { useActionState, useState } from 'react'
import { renameTrackedRival, type RenameState } from './rivals-actions'

// Rename a rival, from the rivals table. Closed until asked for: renaming is
// rare, it is a break in the series, and a text box sitting open beside every
// rival invites the one edit this product cannot undo.

const initial: RenameState = { ok: false, message: '' }

export function RivalRename({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(renameTrackedRival, initial)

  if (state.ok && state.message) {
    return <span className="text-[11.5px] text-muted-foreground">{state.message}</span>
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-[3px] text-[11.5px] font-medium text-secondary-foreground transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        Rename
      </button>
    )
  }

  return (
    <form action={action} className="flex w-full flex-col gap-1.5">
      <input type="hidden" name="id" value={id} />
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`rename-${id}`}>New name for {name}</label>
        <input
          id={`rename-${id}`}
          name="name"
          defaultValue={name}
          maxLength={80}
          required
          className="min-w-0 flex-1 rounded-[4px] border border-input bg-tile px-2.5 py-1 text-[12.5px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-[4px] bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-accent-foreground disabled:opacity-50"
        >
          {pending ? 'Renaming…' : 'Rename'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="shrink-0 rounded-[3px] text-[12px] text-muted-foreground hover:underline">Cancel</button>
      </div>
      <p className="text-left text-[11px] text-muted-foreground">
        The months already counted stay under the old name — they cannot be moved, and we would rather show you
        one line with the change marked on it than quietly restate history.
      </p>
      {state.message && !state.ok && <p className="text-left text-[11.5px] text-negative">{state.message}</p>}
    </form>
  )
}
