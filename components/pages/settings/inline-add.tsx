'use client'

import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react'
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SM, INPUT } from '@/components/v2/look'
import { cn } from '@/lib/utils'
import { saveWords } from '@/lib/pages/settings-words'
import { TENANT_LOCK_REFUSAL } from '@/lib/tenant-locks'
import type { SettingsFormState } from '@/app/dashboard/settings/actions'

// The artboard's "Add a term", "Add a brand", "Add a community": a button
// that opens one field in place, saves it through the page's own action and
// says what happened in the client's words (lib/pages/settings-words.ts). The
// artboard draws the resting state; the field is the least it can open to.
//
// SINCE THE AUDIT DESIGN (7 Nov, Settings.dc.html): the resting button is the
// white secondary at the small size with no icon, the field the kit's input,
// Add the yellow button. Its look comes from components/v2/look.ts, which
// imports nothing (a client file's style, the client-bundle guard).

type Action = (prev: SettingsFormState, formData: FormData) => Promise<SettingsFormState>

const initial: SettingsFormState = { ok: false, message: '' }
const LOCKS = [TENANT_LOCK_REFUSAL.tracking, TENANT_LOCK_REFUSAL.sends]

export function InlineAdd({
  label, field, placeholder, action, hidden, inputLabel,
}: {
  /** The button's words: "Add a term". */
  label: string
  /** The name the new value posts under. */
  field: string
  placeholder: string
  action: Action
  /** Everything else the action needs, posted as hidden fields. */
  hidden: ReactNode
  inputLabel: string
}) {
  const [open, setOpen] = useState(false)
  // A save that landed closes the field; its words stay beside the button.
  const [state, run, pending] = useActionState(async (prev: SettingsFormState, fd: FormData) => {
    const out = await action(prev, fd)
    if (out.ok) setOpen(false)
    return out
  }, initial)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) input.current?.focus() }, [open])

  const words = saveWords(state, LOCKS)

  return (
    <div className="flex flex-col items-end gap-2">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={cn(BTN_SECONDARY, BTN_SM, 'max-sm:h-11')}>
          {label}
        </button>
      ) : (
        <form action={run} className="flex flex-wrap items-center justify-end gap-2">
          {hidden}
          <label className="sr-only" htmlFor={`add-${field}`}>{inputLabel}</label>
          <input
            ref={input}
            id={`add-${field}`}
            name={field}
            required
            placeholder={placeholder}
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
            className={cn(INPUT, 'w-[220px] max-w-full max-sm:h-11')}
          />
          <button type="submit" disabled={pending} className={cn(BTN_PRIMARY, BTN_SM, 'max-sm:h-11')}>{pending ? 'Saving' : 'Add'}</button>
          <button type="button" onClick={() => setOpen(false)} className={cn(BTN_SECONDARY, BTN_SM, 'max-sm:h-11')}>Cancel</button>
        </form>
      )}
      {words ? <p role="status" className={cn('m-0 max-w-[320px] text-right text-[13px] leading-[1.45]', state.ok ? 'text-muted-foreground' : 'text-caution')}>{words}</p> : null}
    </div>
  )
}
