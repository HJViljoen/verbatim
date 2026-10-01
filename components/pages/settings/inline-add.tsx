'use client'

import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { buttonClass } from '@/components/pages/studio/ui'
import { saveWords } from '@/lib/pages/settings-words'
import { TENANT_LOCK_REFUSAL } from '@/lib/tenant-locks'
import type { SettingsFormState } from '@/app/dashboard/settings/actions'

// The artboard's "Add a term", "Add a brand", "Add a community": a button
// that opens one field in place, saves it through the page's own action and
// says what happened in the client's words (lib/pages/settings-words.ts). The
// artboard draws the resting state; the field is the least it can open to.

type Action = (prev: SettingsFormState, formData: FormData) => Promise<SettingsFormState>

const initial: SettingsFormState = { ok: false, message: '' }
const LOCKS = [TENANT_LOCK_REFUSAL.tracking, TENANT_LOCK_REFUSAL.sends]

export function InlineAdd({
  label, field, placeholder, action, hidden, kind = 'ghost', inputLabel,
}: {
  /** The button's words: "Add a term". */
  label: string
  /** The name the new value posts under. */
  field: string
  placeholder: string
  action: Action
  /** Everything else the action needs, posted as hidden fields. */
  hidden: ReactNode
  kind?: 'ghost' | 'secondary'
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
        <button type="button" onClick={() => setOpen(true)} className={buttonClass(kind, 'small')}>
          <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
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
            className="h-[34px] w-[200px] rounded-[10px] border border-[#E4E2DC] bg-white px-3 text-[13px] text-[#26292C] outline-none focus-visible:border-[#26292C]"
          />
          <button type="submit" disabled={pending} className={buttonClass('primary', 'small')}>{pending ? 'Saving' : 'Add'}</button>
          <button type="button" onClick={() => setOpen(false)} className={buttonClass('ghost', 'small')}>Cancel</button>
        </form>
      )}
      {words ? <p role="status" className={`m-0 max-w-[320px] text-right text-[12px] ${state.ok ? 'text-[#5F656B]' : 'text-[#C2410C]'}`}>{words}</p> : null}
    </div>
  )
}
