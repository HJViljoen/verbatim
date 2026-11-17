'use client'

import { startTransition, useActionState, useState, type FormEvent } from 'react'
import { buttonClass } from '@/components/pages/studio/ui'
import type { CostsActionState } from '@/app/dashboard/ops/costs/actions'
import {
  deletePayment, printInvoice, recordPayment, saveProfile, sendInvoiceNow, sendInvoiceTest, setExpected, setHold,
} from '@/app/dashboard/ops/costs/money-actions'
import { DUE_RULE_LABEL, DUE_RULES, FIN_CURRENCIES, SEND_MODE_LABEL, SEND_MODES, type BillingProfile, type FinCurrency, type Invoice } from '@/lib/finance/types'
import { cn } from '@/lib/utils'
import { Check, Field, INPUT, Said, TEXTAREA } from './fields'

// The Money in forms (operator only). Each posts a server action in
// app/dashboard/ops/costs/money-actions.ts, which checks the operator again
// before it writes. Anything that sends or deletes asks inside the page first,
// never in a browser dialog (the loan page's pattern). Forms that a refusal
// must not clear post from onSubmit (React resets a <form action> either way).

const IDLE: CostsActionState = { ok: true, message: '' }

function useAction(action: (prev: CostsActionState, f: FormData) => Promise<CostsActionState>, after?: () => void) {
  return useActionState(async (prev: CostsActionState, f: FormData) => {
    const r = await action(prev, f)
    if (r.ok) after?.()
    return r
  }, IDLE)
}

/** Post a form's fields without React clearing them on the answer. */
function keep(dispatch: (f: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    startTransition(() => dispatch(f))
  }
}

// ---- One invoice's buttons ------------------------------------------------------

export interface InvoiceActionsProps {
  invoice: Pick<Invoice, 'id' | 'number' | 'kind' | 'status' | 'expectedOn' | 'pdfPath'>
  /** Who a real send goes to, said in the question before it goes. */
  recipients: string
  /** The invoice still owes something (Expected date makes sense). */
  owed: boolean
  /** A claim older than ten minutes: a send that crashed may be retried. */
  staleSend: boolean
}

export function InvoiceActions({ invoice, recipients, owed, staleSend }: InvoiceActionsProps) {
  const [armed, setArmed] = useState(false)
  const [sent, send, sending] = useAction(sendInvoiceNow, () => setArmed(false))
  const [tested, test, testing] = useAction(sendInvoiceTest)
  const [printed, print, printing] = useAction(printInvoice)
  const answer = [sent, tested, printed].find((s) => s.message) ?? IDLE
  const canSend = invoice.kind === 'invoice' && invoice.pdfPath !== null && (invoice.status === 'ready' || staleSend)
  const canPrint = invoice.status === 'draft' || invoice.status === 'ready'
  const canTest = invoice.pdfPath !== null && invoice.status !== 'void'

  if (armed) {
    return (
      <form action={send} className="flex flex-wrap items-center gap-2 rounded-[10px] bg-inner px-3 py-2.5">
        <input type="hidden" name="id" value={invoice.id} />
        <span className="text-[13px]">Send invoice {invoice.number} to {recipients} now?</span>
        <button type="submit" autoFocus disabled={sending} className={buttonClass('primary', 'small')}>{sending ? 'Sending…' : 'Send it'}</button>
        <button type="button" onClick={() => setArmed(false)} className={buttonClass('ghost', 'small')}>Not yet</button>
        <Said ok={sent.ok} message={sent.ok ? '' : sent.message} />
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {canSend ? <button type="button" onClick={() => setArmed(true)} className={buttonClass('primary', 'small')}>Send…</button> : null}
        {canPrint ? (
          <form action={print}>
            <input type="hidden" name="id" value={invoice.id} />
            <button type="submit" disabled={printing} className={buttonClass('secondary', 'small')}>
              {printing ? 'Printing…' : invoice.pdfPath ? 'Print again' : 'Print'}
            </button>
          </form>
        ) : null}
        {canTest ? (
          <form action={test}>
            <input type="hidden" name="id" value={invoice.id} />
            <button type="submit" disabled={testing} className={buttonClass('secondary', 'small')}>{testing ? 'Sending test…' : 'Send a test to me'}</button>
          </form>
        ) : null}
      </div>
      {invoice.kind === 'invoice' && owed ? <ExpectedForm id={invoice.id} expectedOn={invoice.expectedOn} /> : null}
      <Said ok={answer.ok} message={answer.message} />
    </div>
  )
}

function ExpectedForm({ id, expectedOn }: { id: string; expectedOn: string | null }) {
  const [state, dispatch, pending] = useAction(setExpected)
  return (
    <form onSubmit={keep(dispatch)} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-1">
        <span className="text-[11.5px] font-semibold text-secondary-foreground">They said they&rsquo;ll pay on</span>
        <input name="expectedOn" type="date" defaultValue={expectedOn ?? ''} className={cn(INPUT, 'w-[160px]')} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass('ghost', 'small')}>{pending ? 'Saving…' : 'Save date'}</button>
      {state.message ? <Said ok={state.ok} message={state.message} /> : null}
    </form>
  )
}

// ---- Payments -------------------------------------------------------------------

export function PaymentForm({ payers, today }: { payers: { id: string; name: string; currency: FinCurrency }[]; today: string }) {
  const [currency, setCurrency] = useState<FinCurrency>(payers[0]?.currency ?? 'ZAR')
  const [state, dispatch, pending] = useAction(recordPayment)
  if (payers.length === 0) return <p className="m-0 text-[13px] text-muted-foreground">No client is invoiced yet, so there is no one to record a payment from.</p>
  return (
    <form onSubmit={keep(dispatch)} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="From">
          <select name="clientId" defaultValue={payers[0].id} className={INPUT}
            onChange={(e) => setCurrency(payers.find((p) => p.id === e.target.value)?.currency ?? currency)}>
            {payers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Day it came in">
          <input name="receivedOn" type="date" required max={today} defaultValue={today} className={INPUT} />
        </Field>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
        <Field label="Amount" hint="As the bank statement shows it">
          <input name="amount" inputMode="decimal" autoComplete="off" required placeholder="1 234.00" className={INPUT} />
        </Field>
        <Field label="Currency">
          <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value as FinCurrency)} className={INPUT}>
            {FIN_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Reference" hint="Optional: the statement's reference, like INV-0123">
        <input name="reference" autoComplete="off" maxLength={200} className={INPUT} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={buttonClass('primary', 'small')}>{pending ? 'Recording…' : 'Record payment'}</button>
        <Said ok={state.ok} message={state.message} />
      </div>
    </form>
  )
}

/** A payment's delete, asked inside the row first. */
export function PaymentDelete({ id }: { id: string }) {
  const [armed, setArmed] = useState(false)
  const [state, remove, removing] = useAction(deletePayment)
  if (!armed) return <button type="button" onClick={() => setArmed(true)} className={buttonClass('ghost', 'small')}>Delete…</button>
  return (
    <form action={remove} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <span className="text-[13px]">Delete this payment? The invoices it paid will owe again.</span>
      <button type="submit" autoFocus disabled={removing} className={cn(buttonClass('secondary', 'small'), 'text-negative')}>{removing ? 'Deleting…' : 'Delete it'}</button>
      <button type="button" onClick={() => setArmed(false)} className={buttonClass('ghost', 'small')}>Keep it</button>
      <Said ok={false} message={state.ok ? '' : state.message} />
    </form>
  )
}

// ---- The billing profile --------------------------------------------------------

export function HoldSwitch({ profileId, on }: { profileId: string; on: boolean }) {
  const [state, action, pending] = useAction(setHold)
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={profileId} />
      <input type="hidden" name="value" value={on ? 'false' : 'true'} />
      <button type="submit" role="switch" aria-checked={on} disabled={pending}
        className="inline-flex h-[30px] cursor-pointer items-center gap-2 rounded-full bg-inner pr-3 pl-1 text-[12.5px] font-medium transition-colors hover:bg-track focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60">
        <span aria-hidden className={`relative inline-flex h-[18px] w-[30px] shrink-0 rounded-full transition-colors ${on ? 'bg-foreground' : 'bg-border'}`}>
          <span className={`absolute top-[2px] size-[14px] rounded-full bg-card transition-[left] duration-200 ${on ? 'left-[14px]' : 'left-[2px]'}`} />
        </span>
        Hold the next invoice for me
      </button>
      {!state.ok ? <Said ok={false} message={state.message} /> : null}
    </form>
  )
}

export function ProfileEdit({ profile }: { profile: BillingProfile }) {
  const [open, setOpen] = useState(false)
  const [state, dispatch, pending] = useAction(saveProfile, () => setOpen(false))
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={buttonClass('secondary', 'small')}>Edit billing</button>
  const rows = [...profile.lines, { description: '', unitUsd: 0, qty: 1 }]
  return (
    <form onSubmit={keep(dispatch)} className="flex flex-col gap-3 rounded-[10px] bg-inner px-4 py-4">
      <input type="hidden" name="id" value={profile.id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Made out to"><input name="billTo" required defaultValue={profile.billTo} className={INPUT} /></Field>
        <Field label="Subject line"><input name="subjectLine" defaultValue={profile.subjectLine} className={INPUT} /></Field>
      </div>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 text-[12px] font-semibold text-secondary-foreground">A month&rsquo;s lines, priced in dollars (blank a description to drop a line)</legend>
        {rows.map((l, n) => (
          <div key={n} className="grid grid-cols-[minmax(0,1fr)_96px_64px] gap-2">
            <input name={`lines.${n}.description`} aria-label={`Line ${n + 1} description`} defaultValue={l.description} className={INPUT} />
            <input name={`lines.${n}.unitUsd`} aria-label={`Line ${n + 1} price in dollars`} inputMode="decimal" defaultValue={l.description ? l.unitUsd : ''} className={INPUT} />
            <input name={`lines.${n}.qty`} aria-label={`Line ${n + 1} quantity`} inputMode="numeric" defaultValue={l.qty} className={INPUT} />
          </div>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Invoiced in">
          <select name="currency" defaultValue={profile.currency} className={INPUT}>
            {FIN_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Fixed rate (R per $)"><input name="fxRate" inputMode="decimal" required defaultValue={profile.fxRate} className={INPUT} /></Field>
        <Field label="Issued on day" hint="Of the month before"><input name="issueDay" inputMode="numeric" required defaultValue={profile.issueDay} className={INPUT} /></Field>
        <Field label="Due">
          <select name="dueRule" defaultValue={profile.dueRule} className={INPUT}>
            {DUE_RULES.map((d) => <option key={d} value={d}>{DUE_RULE_LABEL[d]}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="To" hint="Commas between addresses"><input name="emailTo" required defaultValue={profile.emailTo.join(', ')} className={INPUT} /></Field>
        <Field label="Cc"><input name="emailCc" defaultValue={profile.emailCc.join(', ')} className={INPUT} /></Field>
        <Field label="Bcc"><input name="emailBcc" defaultValue={profile.emailBcc.join(', ')} className={INPUT} /></Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Your ref."><input name="yourRef" defaultValue={profile.yourRef ?? ''} className={INPUT} /></Field>
        <Field label="Greeting"><input name="emailGreeting" defaultValue={profile.emailGreeting ?? ''} placeholder="Hi …" className={INPUT} /></Field>
        <Field label="Sending">
          <select name="sendMode" defaultValue={profile.sendMode} className={INPUT}>
            {SEND_MODES.map((m) => <option key={m} value={m}>{SEND_MODE_LABEL[m]}</option>)}
          </select>
        </Field>
      </div>
      <Field label="A line for the next email only" hint="Cleared once that email is sent">
        <textarea name="noteOnce" defaultValue={profile.noteOnce ?? ''} className={TEXTAREA} />
      </Field>
      <div className="flex flex-wrap gap-4">
        <Check name="active" label="Invoices this client every month" defaultChecked={profile.active} />
        <Check name="holdNext" label="Hold the next invoice for me" defaultChecked={profile.holdNext} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={buttonClass('primary', 'small')}>{pending ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass('ghost', 'small')}>Cancel</button>
        <Said ok={state.ok} message={state.message} />
      </div>
    </form>
  )
}
