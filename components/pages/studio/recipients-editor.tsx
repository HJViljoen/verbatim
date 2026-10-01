'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import { updateArtefactRecipients, type RecipientsState } from '@/app/dashboard/settings/reports/actions'
import { buttonClass } from './ui'

// Who gets one report, edited from its row (moved in from Settings › Reports
// and recipients). Owners and admins only: the row draws no button for anyone
// else, and the action checks the role again.
//
// THE EDITOR NEVER SWITCHES SENDING. It posts the schedule's own `active`
// back, so saving a list leaves a schedule that sends sending and one that is
// off, off; a report with no schedule yet starts as the old form's default
// did. Switching sending on is still refused for a locked tenant, in the
// lock's own words (lib/tenant-locks.ts), and the briefs, which nothing sends
// on a schedule yet, are stored switched off by the action.

const initial: RecipientsState = { ok: false, message: '' }

export function RecipientsEditor({ artefact, name, recipients, active }: { artefact: string; name: string; recipients: string[]; active: boolean }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(updateArtefactRecipients, initial)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div ref={box} className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={buttonClass('secondary', 'small')}>
        <Pencil aria-hidden className="size-[15px]" strokeWidth={2} />
        Recipients
      </button>
      {open && (
        <form action={action} className="absolute right-0 top-[calc(100%+8px)] z-20 flex w-[320px] max-w-[calc(100vw-48px)] flex-col gap-3 rounded-[16px] border border-[#E4E2DC] bg-white p-4 text-left shadow-[0_6px_24px_rgba(0,0,0,0.08)]">
          <input type="hidden" name="artefact" value={artefact} />
          {active ? <input type="hidden" name="active" value="on" /> : null}
          <label htmlFor={`recipients-${artefact}`} className="text-[14px] font-semibold text-[#26292C]">Who gets {name.startsWith('The ') ? name.replace(/^The /, 'the ') : `the ${name.toLowerCase()}`}</label>
          <textarea
            id={`recipients-${artefact}`}
            name="recipients"
            rows={3}
            defaultValue={recipients.join(', ')}
            placeholder="name@company.com, someone@company.com"
            className="w-full resize-y rounded-[10px] border border-[#E4E2DC] bg-white px-3 py-2 text-[13px] leading-normal text-[#26292C] outline-none focus-visible:border-[#26292C]"
          />
          <p className="m-0 text-[12px] text-[#5F656B]">Email addresses, separated by commas.</p>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending} className={buttonClass('primary', 'small')}>{pending ? 'Saving' : 'Save'}</button>
            <button type="button" onClick={() => setOpen(false)} className={buttonClass('ghost', 'small')}>Cancel</button>
          </div>
          {state.message ? <p role="status" className={`m-0 text-[12px] ${state.ok ? 'text-[#5F656B]' : 'text-[#C2410C]'}`}>{state.message}</p> : null}
        </form>
      )}
    </div>
  )
}
