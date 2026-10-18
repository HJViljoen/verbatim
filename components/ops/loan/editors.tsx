'use client'

import { startTransition, useActionState, useRef, useState, type FormEvent } from 'react'
import { buttonClass } from '@/components/pages/studio/ui'
import { deleteEntry, saveEntry, type LoanActionState } from '@/app/dashboard/ops/loan/actions'
import { Field, INPUT, Said } from '@/components/ops/costs/fields'
import { fmtDay } from '@/lib/costs/dates'
import { NOTE_MAX } from '@/lib/family-loan/forms'
import { typedAmount } from '@/lib/family-loan/money'
import { LOAN_KIND_LABEL, LOAN_KINDS, type LoanEntry, type LoanKind } from '@/lib/family-loan/types'
import { cn } from '@/lib/utils'
import { LEDGER_COLS } from './ledger-cols'

// The loan page's forms (operator only). Each posts a server action in
// app/dashboard/ops/loan/actions.ts, which checks the operator again before
// it writes; the page revalidates and the ledger redraws.
//
// The add and edit forms post from onSubmit rather than <form action>: React
// resets a form whose action finishes, refused or not, and a refusal ("the
// date is in the future") must leave what was typed in place to correct.

const IDLE: LoanActionState = { ok: true, message: '' }

/** An action whose success also runs `after`: set inside the action, never
 *  in an effect (the Costs page's editors do the same). */
function useAction(
  action: (prev: LoanActionState, f: FormData) => Promise<LoanActionState>,
  after?: () => void,
) {
  return useActionState(async (prev: LoanActionState, f: FormData) => {
    const r = await action(prev, f)
    if (r.ok) after?.()
    return r
  }, IDLE)
}

/** Borrowed or Paid back: the period switch's look, as two radios. */
function KindToggle({ defaultKind }: { defaultKind: LoanKind }) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
      <legend className="sr-only">Borrowed or paid back</legend>
      <div className="inline-flex w-fit max-w-full gap-0.5 rounded-[9px] bg-card p-[3px] shadow-block ring-1 ring-foreground/6">
        {LOAN_KINDS.map((k) => (
          <label
            key={k}
            className={cn(
              'cursor-pointer whitespace-nowrap rounded-[7px] px-[13px] py-[7px] text-[13.5px] leading-[1.2] text-secondary-foreground transition-colors hover:bg-inner hover:text-foreground',
              'has-[:checked]:bg-accent has-[:checked]:font-semibold has-[:checked]:text-accent-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
            )}
          >
            <input type="radio" name="kind" value={k} defaultChecked={k === defaultKind} className="sr-only" />
            {LOAN_KIND_LABEL[k]}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * One entry's fields: the add form (no entry) or an edit (an entry). After an
 * add, the amount and the note clear and the amount takes the focus; which
 * way and the date stay, for the next of several.
 */
export function EntryForm({ entry, today, onDone }: { entry?: LoanEntry; today: string; onDone?: () => void }) {
  const amount = useRef<HTMLInputElement>(null)
  const note = useRef<HTMLInputElement>(null)
  const [state, dispatch, pending] = useAction(saveEntry, () => {
    if (onDone) return onDone()
    if (amount.current) amount.current.value = ''
    if (note.current) note.current.value = ''
    amount.current?.focus()
  })
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    startTransition(() => dispatch(f))
  }
  return (
    <form onSubmit={submit} className={cn('flex flex-col gap-3', entry ? 'rounded-[10px] bg-inner px-4 py-4' : null)}>
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
      <KindToggle defaultKind={entry?.kind ?? 'borrowed'} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input name="occurredOn" type="date" required max={today} defaultValue={entry?.occurredOn ?? today} className={INPUT} />
        </Field>
        <Field label="Amount (rand)">
          <input
            ref={amount}
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            required
            placeholder="2 500"
            defaultValue={entry ? typedAmount(entry.amountCents) : ''}
            className={INPUT}
          />
        </Field>
      </div>
      <Field label="Note" hint={entry ? undefined : 'Optional: what it was for'}>
        <input ref={note} name="note" maxLength={NOTE_MAX} autoComplete="off" defaultValue={entry?.note ?? ''} className={INPUT} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={buttonClass('primary', 'small')}>
          {pending ? (entry ? 'Saving…' : 'Adding…') : entry ? 'Save' : 'Add entry'}
        </button>
        {entry ? <button type="button" onClick={onDone} className={buttonClass('ghost', 'small')}>Cancel</button> : null}
        <Said ok={state.ok} message={state.message} />
      </div>
    </form>
  )
}

/** One ledger line, drawn and worded by the page (components/ops/loan/sections.tsx). */
export interface LedgerRowData {
  entry: LoanEntry
  /** The entry's amount, formatted. */
  amount: string
  /** The balance after it, worded ("R12,000", "R500 overpaid"). */
  balance: string
  overpaid: boolean
}

const WIDE_AUTO = '@min-[800px]/ledger:col-start-auto @min-[800px]/ledger:row-start-auto'
const NARROW_LABEL = 'font-normal text-muted-foreground @min-[800px]/ledger:sr-only'

/** A ledger row: its figures, Edit (the row becomes its form) and a delete
 *  that asks inside the row first, never a browser dialog. */
export function LedgerRow({ row, today }: { row: LedgerRowData; today: string }) {
  const [editing, setEditing] = useState(false)
  const [armed, setArmed] = useState(false)
  const [deleted, remove, removing] = useAction(deleteEntry)
  const { entry } = row

  if (editing) {
    return (
      <div role="row" className="border-b border-border/60 py-3 last:border-b-0">
        <div role="cell">
          <EntryForm entry={entry} today={today} onDone={() => setEditing(false)} />
        </div>
      </div>
    )
  }

  const amountCell = (kind: LoanKind) => (
    <span
      role="cell"
      className={cn(
        'text-right text-[13.5px] tabular-nums',
        entry.kind === kind ? 'col-start-2 row-start-1 font-medium' : 'hidden @min-[800px]/ledger:block',
        WIDE_AUTO,
      )}
    >
      {entry.kind === kind ? (
        <>
          <span className={NARROW_LABEL}>{LOAN_KIND_LABEL[kind]} </span>
          {row.amount}
        </>
      ) : <span aria-hidden className="text-muted-foreground">–</span>}
    </span>
  )

  return (
    <div
      role="row"
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 border-b border-border/60 py-3 last:border-b-0',
        LEDGER_COLS,
      )}
    >
      <span role="cell" className={cn('col-start-1 row-start-1 font-mono text-[12px] tabular-nums text-secondary-foreground', WIDE_AUTO)}>
        {fmtDay(entry.occurredOn)}
      </span>
      <span role="cell" className={cn('col-start-1 row-start-2 min-w-0 text-[13px] leading-[1.45] [overflow-wrap:anywhere]', WIDE_AUTO)}>
        {entry.note}
      </span>
      {amountCell('borrowed')}
      {amountCell('repaid')}
      <span role="cell" className={cn('col-start-2 row-start-2 text-right text-[13px] tabular-nums', row.overpaid ? 'text-secondary-foreground' : null, WIDE_AUTO)}>
        <span className={NARROW_LABEL}>Balance after </span>
        {row.balance}
      </span>
      {armed ? null : (
        <span role="cell" className={cn('col-span-2 row-start-3 flex flex-wrap items-center gap-2 pt-1', '@min-[800px]/ledger:col-span-1 @min-[800px]/ledger:justify-end @min-[800px]/ledger:pt-0', WIDE_AUTO)}>
          <button type="button" onClick={() => setEditing(true)} className={buttonClass('secondary', 'small')}>Edit</button>
          <button type="button" onClick={() => setArmed(true)} className={buttonClass('ghost', 'small')}>Delete…</button>
        </span>
      )}
      {armed ? (
        <form action={remove} role="cell" className="col-span-full flex flex-wrap items-center gap-2 rounded-[10px] bg-inner px-3 py-2.5">
          <input type="hidden" name="id" value={entry.id} />
          <span className="text-[13px]">Delete this entry? It cannot be undone.</span>
          <button type="submit" autoFocus disabled={removing} className={cn(buttonClass('secondary', 'small'), 'text-negative')}>
            {removing ? 'Deleting…' : 'Delete it'}
          </button>
          <button type="button" onClick={() => setArmed(false)} className={buttonClass('ghost', 'small')}>Keep it</button>
          {/* Deleted, the row goes; only a refusal needs words. */}
          <Said ok={false} message={deleted.ok ? '' : deleted.message} />
        </form>
      ) : null}
    </div>
  )
}
