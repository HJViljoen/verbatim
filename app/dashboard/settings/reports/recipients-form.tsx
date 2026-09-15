'use client'

import { useActionState, useState } from 'react'
import { updateArtefactRecipients, type RecipientsState } from './actions'

// One artefact's recipient list, edited in place. Opens only when a reader
// asks: seven forms open at once is a wall, and six of the seven have nothing
// in them on both live tenants.

const initial: RecipientsState = { ok: false, message: '' }

export function RecipientsForm({
  artefact, label, recipients, active, canEdit,
}: { artefact: string; label: string; recipients: string[]; active: boolean; canEdit: boolean }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(updateArtefactRecipients, initial)

  if (!canEdit) {
    return (
      <span className="text-[11.5px] text-muted-foreground">
        {recipients.length === 0 ? 'nobody' : `${recipients.length} address${recipients.length === 1 ? '' : 'es'}`}
      </span>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-[3px] text-[11.5px] font-medium text-secondary-foreground transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {recipients.length === 0 ? 'Add recipients' : 'Change recipients'}
      </button>
    )
  }

  return (
    <form action={action} className="flex w-full flex-col gap-2">
      <input type="hidden" name="artefact" value={artefact} />
      <label className="sr-only" htmlFor={`recipients-${artefact}`}>Who receives {label}</label>
      <textarea
        id={`recipients-${artefact}`}
        name="recipients"
        rows={2}
        defaultValue={recipients.join(', ')}
        placeholder="name@company.com, someone.else@company.com"
        className="w-full rounded-[4px] border border-input bg-tile px-2.5 py-1.5 text-[12.5px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-[12px] text-secondary-foreground">
          <input type="checkbox" name="active" defaultChecked={active} className="size-3.5" />
          Send it
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-[4px] bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-accent-foreground disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-[3px] text-[12px] text-muted-foreground hover:underline"
        >
          Cancel
        </button>
        {state.message && (
          <span className={`text-[11.5px] ${state.ok ? 'text-muted-foreground' : 'text-negative'}`}>{state.message}</span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Addresses, separated by commas. Anyone here receives it whether or not they have a login.
      </p>
    </form>
  )
}
