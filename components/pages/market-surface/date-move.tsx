'use client'

import { useActionState, useState } from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { dateMoveAction } from '@/lib/actions/date-move'
import { EMPTY_STATE } from '@/lib/subjects/form-state'
import {
  DATE_MOVE, DATE_MOVE_TITLE_HINT, DATE_MOVE_TODAY, dateMoveLead,
  dayWindowLine, targetGroups, targetValue, type MoveDating,
} from '@/lib/pages/date-move'

// "Date a move" (the approved preview's Your moves, WP3.6 wave 2): the green
// button in the page bar and under Your moves, and the sheet it opens: what
// you changed, what it is about, and the day you changed it.
//
// THE DAY IS OFFERED ONCE MF5 IS APPLIED (`dating.datable`). Before it, the
// sheet says the move is dated today and sends no day, so the write is the one
// every move has always been.
//
// APP ONLY, and the block that draws it decides that: an export never draws a
// button nobody can press.

const selectCls =
  'h-9 w-full rounded-[4px] border border-input bg-tile px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'

/** The preview's green button: 44px under Your moves, 40px in the page bar. */
const GREEN = 'cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 text-[14px] font-semibold text-primary-foreground transition-colors hover:bg-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

export function DateMove({ dating, place = 'block' }: { dating: MoveDating; place?: 'block' | 'bar' }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(dateMoveAction, EMPTY_STATE)
  const [lastDated, setLastDated] = useState<string | undefined>(undefined)
  // A MOVE THAT LANDED CLOSES THE SHEET; the page is re-read with it on.
  if (state.ok && state.id && state.id !== lastDated) {
    setLastDated(state.id)
    if (open) setOpen(false)
  }
  const groups = targetGroups(dating)

  return (
    <>
      <button
        type="button"
        data-print-hide
        onClick={() => setOpen(true)}
        // ONE DISPLAY CLASS PER WIDTH: the bar's button is `hidden` below sm
        // (the block's own is there), and never `inline-flex` beside it.
        className={`${GREEN} ${place === 'bar' ? 'hidden h-10 sm:inline-flex' : 'inline-flex h-11 w-fit px-[18px]'}`}
      >
        <Plus className="size-4" aria-hidden />
        {DATE_MOVE}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 bg-tile p-0 data-[side=right]:sm:max-w-[28rem]">
          <SheetHeader className="border-b border-border/70 px-5 py-4 pr-12">
            <SheetTitle className="text-[15px] font-semibold">{DATE_MOVE}</SheetTitle>
            <SheetDescription className="text-[12.5px] leading-[1.5]">{dateMoveLead(dating.datable)}</SheetDescription>
          </SheetHeader>
          <form action={action} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <fieldset disabled={pending} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">What you changed</span>
                <Input name="title" maxLength={120} required autoComplete="off" />
                <span className="block text-[11px] text-muted-foreground/80">{DATE_MOVE_TITLE_HINT}</span>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">What it is about</span>
                <select name="target" required defaultValue="" className={selectCls}>
                  <option value="" disabled>Pick one</option>
                  {dating.subjects.length > 0 ? (
                    <optgroup label={groups.subjects}>
                      {dating.subjects.map((x) => <option key={x.id} value={targetValue('subject', x.id)}>{x.name}</option>)}
                    </optgroup>
                  ) : null}
                  {dating.themes.length > 0 ? (
                    <optgroup label={groups.themes}>
                      {dating.themes.map((t) => <option key={t.registryId} value={targetValue('theme', t.registryId)}>{t.label}</option>)}
                    </optgroup>
                  ) : null}
                  {dating.advice ? (
                    <optgroup label={groups.advice}>
                      <option value={targetValue('advice', dating.advice.lineageId)}>{dating.advice.title}</option>
                    </optgroup>
                  ) : null}
                </select>
              </label>
              {dating.datable ? (
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">When you changed it</span>
                  <Input type="date" name="dated_on" min={dating.earliest} max={dating.today} defaultValue={dating.today} required />
                  <span className="block text-[11px] text-muted-foreground/80">{dayWindowLine(dating.earliest)}</span>
                </label>
              ) : (
                <p className="m-0 text-[12px] text-muted-foreground">{DATE_MOVE_TODAY}</p>
              )}
              <div className="flex items-center gap-3 pt-1">
                <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Date it'}</Button>
                {state.message && !(state.ok && state.id === lastDated) ? (
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
