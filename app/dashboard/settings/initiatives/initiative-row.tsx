'use client'

import { useActionState, useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { updateInitiative, setInitiativeStatus, type InitiativeFormState } from './actions'
import {
  INITIATIVE_DIRECTIONS, INITIATIVE_DIRECTION_LABEL, INITIATIVE_STATUS_LABEL,
  type Initiative, type InitiativeStatus,
} from '@/lib/initiatives/types'

// One initiative in the settings list: read as a line, edited in place. The
// themes and the start date are shown and not editable — they are what the
// measurement MEANS, and changing either would silently turn every point
// already reported into a point about something else.

const initialState: InitiativeFormState = { ok: false, message: '' }

const selectCls =
  'h-8 w-full rounded-[4px] border border-input bg-tile px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'

export function InitiativeRowForm({
  initiative, themeNames, startedLabel,
}: { initiative: Initiative; themeNames: string[]; startedLabel: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(updateInitiative, initialState)
  const [statusPending, startStatus] = useTransition()
  const [status, setStatus] = useState<InitiativeStatus>(initiative.status)
  const [statusError, setStatusError] = useState('')

  const move = (next: InitiativeStatus) =>
    startStatus(async () => {
      const res = await setInitiativeStatus(initiative.id, next)
      if (res.ok) setStatus(next)
      else setStatusError(res.message)
    })

  return (
    <div className={`border-t border-border/70 py-2.5 first:border-t-0 first:pt-0 last:pb-0 ${status === 'active' ? '' : 'opacity-60'}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">{initiative.title}</p>
          <p className="text-[11.5px] text-muted-foreground">
            {INITIATIVE_DIRECTION_LABEL[initiative.direction].toLowerCase()} · {themeNames.join(' · ')}
            {initiative.competitorName ? ` · vs ${initiative.competitorName}` : ''} · since {startedLabel}
          </p>
          {initiative.goal && <p className="mt-0.5 text-[11.5px] text-muted-foreground/80">{initiative.goal}</p>}
        </div>
        <span className="shrink-0 pt-0.5 text-[10.5px] text-muted-foreground">{INITIATIVE_STATUS_LABEL[status]}</span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11.5px]">
        <button type="button" className="text-muted-foreground hover:text-foreground hover:underline" onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : 'Edit'}
        </button>
        {status === 'active' ? (
          <>
            <button type="button" disabled={statusPending} className="text-muted-foreground hover:text-foreground hover:underline" onClick={() => move('done')}>Finish</button>
            <button type="button" disabled={statusPending} className="text-muted-foreground hover:text-foreground hover:underline" onClick={() => move('dropped')}>Stop tracking</button>
          </>
        ) : (
          <button type="button" disabled={statusPending} className="text-muted-foreground hover:text-foreground hover:underline" onClick={() => move('active')}>Track again</button>
        )}
        {statusError && <span className="text-negative" aria-live="polite">{statusError}</span>}
      </div>

      {open && (
        <form action={formAction} className="mt-2.5 rounded-[4px] bg-tile p-3">
          <input type="hidden" name="id" value={initiative.id} />
          <fieldset disabled={pending} className="space-y-2.5">
            <Input name="title" defaultValue={initiative.title} maxLength={120} required aria-label="Name" />
            <Input name="goal" defaultValue={initiative.goal ?? ''} maxLength={400} placeholder="Why (optional)" aria-label="Why" />
            <select name="direction" className={selectCls} defaultValue={initiative.direction} aria-label="Progress looks like">
              {INITIATIVE_DIRECTIONS.map((d) => (
                <option key={d} value={d}>{INITIATIVE_DIRECTION_LABEL[d]}</option>
              ))}
            </select>
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
              {state.message && (
                <span className={`text-[11.5px] ${state.ok ? 'text-positive' : 'text-negative'}`} aria-live="polite">{state.message}</span>
              )}
            </div>
          </fieldset>
        </form>
      )}
    </div>
  )
}
