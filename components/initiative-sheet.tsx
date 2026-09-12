'use client'

import { useActionState, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createInitiative, type InitiativeFormState } from '@/app/dashboard/settings/initiatives/actions'
import { INITIATIVE_DIRECTIONS, INITIATIVE_DIRECTION_LABEL } from '@/lib/initiatives/types'

// "Track this" — declaring an initiative from the theme you are looking at
// (WP7c). The sheet is deliberately four fields: a client who has to fill in a
// form does not declare anything, and every field beyond the theme and the
// direction is optional.
//
// The theme travels as its REGISTRY id, never its label: labels churn ~88%
// update to update (AGENTS.md), so a label-keyed initiative would lose its
// subject within a fortnight.

const initialState: InitiativeFormState = { ok: false, message: '' }

const selectCls =
  'h-8 w-full rounded-[4px] border border-input bg-tile px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground/70">{hint}</span>}
    </label>
  )
}

export function TrackThisButton({ registryId, themeLabel }: { registryId: string; themeLabel: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(createInitiative, initialState)

  // Close on a save that worked; a failed one stays open with its reason.
  // Adjusted during render (React's own pattern for "state derived from a prop
  // that just changed") rather than in an effect, which would render the sheet
  // once more before closing it.
  //
  // Keyed on the created id, not on `state.ok`: `ok` latches true after the
  // first create and never changes again, so a second initiative declared from
  // the same theme card left the sheet open with the first one's "Tracking it
  // from today." still showing. Every create returns a new id.
  const [lastCreated, setLastCreated] = useState<string | undefined>(undefined)
  if (state.ok && state.id && state.id !== lastCreated) {
    setLastCreated(state.id)
    if (open) setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        data-print-hide
        onClick={() => setOpen(true)}
        className="text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline"
      >
        Track this theme →
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 bg-tile p-0 data-[side=right]:sm:max-w-[26rem]">
          <SheetHeader className="border-b border-border/70 px-5 py-4 pr-12">
            <SheetTitle className="text-[15px] font-semibold">Track this theme</SheetTitle>
            <SheetDescription className="text-[12px]">
              Tell us what you are trying to move. Every update from today on says whether this
              theme grew or shrank as a share of its own group&rsquo;s conversation — never
              whether you succeeded.
            </SheetDescription>
          </SheetHeader>
          <form action={formAction} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <input type="hidden" name="registry_ids" value={registryId} />
            <fieldset disabled={pending} className="space-y-4">
              <Field label="What you are trying to move" hint="Yours to rename — it starts as the theme's name.">
                <Input name="title" defaultValue={themeLabel} maxLength={120} required />
              </Field>
              <Field label="Progress looks like">
                <select name="direction" className={selectCls} defaultValue="up">
                  {INITIATIVE_DIRECTIONS.map((d) => (
                    <option key={d} value={d}>{INITIATIVE_DIRECTION_LABEL[d]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Why (optional)" hint="A line for whoever reads the update in six weeks.">
                <Input name="goal" maxLength={400} placeholder="Campaign starts Monday" />
              </Field>
              <div className="flex items-center gap-3 pt-1">
                <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Track it'}</Button>
                {/* A success message the sheet has already closed on is stale
                    by the time anyone reopens it — say nothing rather than
                    "Tracking it from today." about last week's initiative. */}
                {state.message && !(state.ok && state.id === lastCreated) && (
                  <span className={`text-[11.5px] ${state.ok ? 'text-positive' : 'text-negative'}`} aria-live="polite">{state.message}</span>
                )}
              </div>
            </fieldset>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
