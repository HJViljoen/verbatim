'use client'

import { useActionState, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  EMPTY_STATE,
  setMoveStatusAction,
  trackSubjectAction,
} from '@/lib/actions/subjects'
import { fullDate } from '@/lib/format'
import { MOVE_DIRECTIONS, MOVE_PROMISE, type MoveStatus } from '@/lib/subjects/types'

/**
 * "Track this" on a subject (design §3 SU2, the primary button).
 *
 * WHAT IT PROMISES AND WHAT IT REFUSES TO PROMISE. A move is the client drawing
 * a line and saying what they are trying to change; from that date we report
 * what the conversation did, and we never claim we caused it. That sentence is
 * the masthead OV5 prints over the moves list and it belongs on the control
 * that creates one, before the client commits, rather than only on the list
 * that shows the result.
 *
 * `declared_at` is the DATABASE's `current_date` and is not a field on this
 * form. Everything measured about a move is measured from the line the client
 * drew, and a date a request could choose is a line a request could move.
 *
 * ONCE DECLARED, THE ONE THING THAT CAN CHANGE IS THE LIFECYCLE. The target,
 * the title and the date carry no update grant at all; `status` does (WP12's
 * amendment to M4), so the declared state below is two buttons and no form.
 */

const selectCls =
  'h-8 w-full rounded-[4px] border border-input bg-tile px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'

const DIRECTION_LABEL: Record<(typeof MOVE_DIRECTIONS)[number], string> = {
  up: 'more of this conversation',
  down: 'less of this conversation',
}

export function TrackThisSubject({
  subjectId, subjectName, move,
}: {
  subjectId: string
  subjectName: string
  /** The move already declared on this subject, where there is one. */
  move?: { id: string; title: string; declaredAt: string; status: MoveStatus } | null
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(trackSubjectAction, EMPTY_STATE)
  const [lastCreated, setLastCreated] = useState<string | undefined>(undefined)
  if (state.ok && state.id && state.id !== lastCreated) {
    setLastCreated(state.id)
    if (open) setOpen(false)
  }

  // A DROPPED MOVE DOES NOT BLOCK THE NEXT ONE. While one is running or done,
  // the lifecycle is the only thing to change and the button would be a second
  // line on the same subject. Once it is dropped the client has said they are
  // no longer trying that — and "Track it again" with the old title was then
  // the ONLY affordance, so a differently-worded move on the same subject
  // could not be declared at all. Both are offered: pick the old line up, or
  // draw a new one.
  if (move && move.status !== 'dropped') return <DeclaredMove move={move} />

  return (
    <>
      {move ? <DeclaredMove move={move} /> : null}
      <Button type="button" size="sm" data-print-hide onClick={() => setOpen(true)}>
        Track this
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 bg-tile p-0 data-[side=right]:sm:max-w-[26rem]">
          <SheetHeader className="border-b border-border/70 px-5 py-4 pr-12">
            <SheetTitle className="text-[15px] font-semibold">Track “{subjectName}”</SheetTitle>
            <SheetDescription className="text-[12px]">
              Tell us what you are trying to move. {MOVE_PROMISE}
            </SheetDescription>
          </SheetHeader>
          <form action={action} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <input type="hidden" name="subject_id" value={subjectId} />
            <fieldset disabled={pending} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">What you are trying to move</span>
                <Input name="title" defaultValue={subjectName} maxLength={120} required autoComplete="off" />
                <span className="block text-[11px] text-muted-foreground/70">
                  Yours to rename — it starts as the subject’s name.
                </span>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Progress looks like</span>
                <select name="direction" className={selectCls} defaultValue="up">
                  {MOVE_DIRECTIONS.map((d) => (
                    <option key={d} value={d}>{DIRECTION_LABEL[d]}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Why (optional)</span>
                <Input name="note" maxLength={400} placeholder="Campaign starts Monday" autoComplete="off" />
                <span className="block text-[11px] text-muted-foreground/70">
                  A line for whoever reads the report in six weeks.
                </span>
              </label>
              <div className="flex items-center gap-3 pt-1">
                <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Track it'}</Button>
                {state.message && !(state.ok && state.id === lastCreated) ? (
                  <span className={`text-[11.5px] ${state.ok ? 'text-positive' : 'text-negative'}`} aria-live="polite">
                    {state.message}
                  </span>
                ) : null}
              </div>
            </fieldset>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}

/** The declared state: what was said, when, and the only thing left to change. */
function DeclaredMove({ move }: { move: { id: string; title: string; declaredAt: string; status: MoveStatus } }) {
  const [pending, start] = useTransition()
  const [said, setSaid] = useState<{ ok: boolean; message: string } | null>(null)
  const set = (status: MoveStatus) =>
    start(async () => setSaid(await setMoveStatusAction(move.id, status)))

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1" data-print-hide>
      <span className="rounded-full bg-inner px-2 py-0.5 text-[11.5px] font-medium text-secondary-foreground">
        {move.status === 'active' ? 'Tracking' : move.status === 'done' ? 'Done' : 'Dropped'} · {move.title}
      </span>
      <span className="font-mono text-[10.5px] text-muted-foreground">since {fullDate(move.declaredAt)}</span>
      {move.status === 'active' ? (
        <>
          <button type="button" disabled={pending} onClick={() => set('done')}
            className="text-[11.5px] font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-50">
            Mark done
          </button>
          <button type="button" disabled={pending} onClick={() => set('dropped')}
            className="text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50">
            Drop it
          </button>
        </>
      ) : (
        <button type="button" disabled={pending} onClick={() => set('active')}
          className="text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50">
          Track it again
        </button>
      )}
      {said?.message ? (
        <span className={`text-[11.5px] ${said.ok ? 'text-positive' : 'text-negative'}`} aria-live="polite">{said.message}</span>
      ) : null}
    </span>
  )
}
