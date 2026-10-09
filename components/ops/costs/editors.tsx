'use client'

import { useActionState, useState } from 'react'
import { ExternalLink, Plus } from 'lucide-react'
import { buttonClass } from '@/components/pages/studio/ui'
import {
  deleteBill, deletePlan, markBillPaid, saveBill, saveOpenaiBalance, savePlan, saveSettings, setToggle,
  settleOverdue, type CostsActionState,
} from '@/app/dashboard/ops/costs/actions'
import { daysBetween, fmtDay } from '@/lib/costs/dates'
import { monthlyEquivalent } from '@/lib/costs/forecast'
import { fmtNative, fmtUsd, fmtZar, toZar, type Rates } from '@/lib/costs/money'
import {
  BILL_CADENCE_LABEL, BILL_CADENCES, BILL_STATUS_LABEL, BILL_STATUSES, CURRENCIES, RUN_CADENCE_LABEL,
  RUN_CADENCES, STAGE_LABEL, type Bill, type CostSettings,
} from '@/lib/costs/types'
import type { PlanView } from '@/lib/costs/view'
import { Check, Field, INPUT, Pill, Said, StagePill, StatusPill, TEXTAREA } from './fields'

// The Costs page's forms (operator only). Each posts a server action in
// app/dashboard/ops/costs/actions.ts, which checks the operator again before
// it writes; the page revalidates and these components close on success.

const IDLE: CostsActionState = { ok: true, message: '' }

/** An action whose success also runs `after` (closing the form): set inside
 *  the action, never in an effect. */
function useAction(
  action: (prev: CostsActionState, f: FormData) => Promise<CostsActionState>,
  after?: () => void,
) {
  return useActionState(async (prev: CostsActionState, f: FormData) => {
    const r = await action(prev, f)
    if (r.ok) after?.()
    return r
  }, IDLE)
}

/** A form that asks before it posts (a delete). */
function confirmFirst(question: string) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    if (!window.confirm(question)) e.preventDefault()
  }
}

// ---- Bills -----------------------------------------------------------------------

/** "$25.00 a month", "R848.70 every 2 years", "about $90.00 a month", "Not known". */
function billPrice(b: Bill): string {
  if (b.amount === null) return 'Amount not known'
  const a = fmtNative(b.amount, b.currency)
  if (b.cadence === 'usage') return `About ${a} a month`
  if (b.cadence === 'yearly') return `${a} a year`
  if (b.cadence === 'two_yearly') return `${a} every 2 years`
  return `${a} a month`
}

export function BillItem({ bill, rates, today }: { bill: Bill; rates: Rates; today: string }) {
  const [editing, setEditing] = useState(false)
  const [paid, pay, paying] = useAction(markBillPaid)
  const [settled, settle, settling] = useAction(settleOverdue)
  const [deleted, remove, removing] = useAction(deleteBill)

  if (editing) return <BillForm bill={bill} onDone={() => setEditing(false)} />

  const monthlyZar = toZar(monthlyEquivalent(bill.amount, bill.cadence), bill.currency, rates)
  const late = bill.nextChargeOn !== null && bill.nextChargeOn < today && bill.status !== 'ended' && bill.status !== 'paused'
  const answer = !paid.ok || paid.message ? paid : deleted
  return (
    <article className="flex flex-col gap-2 rounded-[10px] bg-inner px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="m-0 text-[15px] font-semibold">
            {bill.manageUrl ? (
              <a href={bill.manageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                {bill.name}
                <ExternalLink aria-label="(opens the billing page)" className="size-3.5 text-muted-foreground" />
              </a>
            ) : bill.name}
          </h3>
          <StatusPill status={bill.status} label={BILL_STATUS_LABEL[bill.status]} />
          {bill.isEstimate ? <Pill tone="faint">Estimate</Pill> : null}
          {bill.shared ? <Pill tone="soft">Shared</Pill> : null}
          {bill.usageTracked ? <Pill tone="faint">In usage</Pill> : null}
        </div>
        <div className="text-left text-[13px] leading-[1.4] sm:text-right">
          <div className="font-medium tabular-nums">{billPrice(bill)}</div>
          {bill.amount !== null && bill.cadence !== 'monthly' && bill.cadence !== 'usage' ? (
            <div className="text-muted-foreground tabular-nums">{fmtZar(monthlyZar)} a month</div>
          ) : bill.amount !== null && bill.currency !== 'ZAR' ? (
            <div className="text-muted-foreground tabular-nums">{fmtZar(monthlyZar)}</div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="m-0 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-muted-foreground">
            {bill.what ? <span>{bill.what}</span> : null}
            <span>{BILL_CADENCE_LABEL[bill.cadence]}</span>
            {bill.nextChargeOn ? (
              <span className={late ? 'font-medium text-negative' : undefined}>
                {late ? 'Was due' : 'Next'} {fmtDay(bill.nextChargeOn)}
                {!late ? ` (${daysBetween(today, bill.nextChargeOn) === 0 ? 'today' : `in ${daysBetween(today, bill.nextChargeOn)} days`})` : ''}
              </span>
            ) : null}
            {bill.paymentMethod ? <span>{bill.paymentMethod}</span> : null}
            {bill.lastPaidOn ? <span>Paid {fmtDay(bill.lastPaidOn)}</span> : null}
          </p>

          {bill.overdueAmount > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <p className="m-0 text-[13px] font-medium text-negative">
                {fmtNative(bill.overdueAmount, bill.currency)} owed
                {bill.currency !== 'ZAR' ? ` (${fmtZar(toZar(bill.overdueAmount, bill.currency, rates))})` : ''}
              </p>
              <form action={settle}>
                <input type="hidden" name="id" value={bill.id} />
                <input type="hidden" name="status" value={bill.status} />
                <button type="submit" disabled={settling} className={buttonClass('secondary', 'small')}>
                  {settling ? 'Settling…' : 'Settle overdue'}
                </button>
              </form>
              {/* Settled, the line goes; only a refusal needs words. */}
              <Said ok={false} message={settled.ok ? '' : settled.message} />
            </div>
          ) : null}

          {bill.notes ? (
            <details className="group text-[12.5px]">
              <summary className="cursor-pointer text-secondary-foreground hover:text-foreground">Notes</summary>
              <p className="mt-1.5 mb-0 whitespace-pre-line leading-[1.5]">{bill.notes}</p>
            </details>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {bill.nextChargeOn && bill.status !== 'ended' ? (
            <form action={pay}>
              <input type="hidden" name="id" value={bill.id} />
              <input type="hidden" name="from" value={bill.nextChargeOn} />
              <input type="hidden" name="cadence" value={bill.cadence} />
              <input type="hidden" name="anchor" value={bill.anchorDay ?? ''} />
              <button type="submit" disabled={paying} className={buttonClass('secondary', 'small')}>
                {paying ? 'Marking…' : 'Mark paid'}
              </button>
            </form>
          ) : null}
          <button type="button" onClick={() => setEditing(true)} className={buttonClass('secondary', 'small')}>Edit</button>
          <form action={remove} onSubmit={confirmFirst(`Delete ${bill.name}? This cannot be undone.`)}>
            <input type="hidden" name="id" value={bill.id} />
            <button type="submit" disabled={removing} className={buttonClass('ghost', 'small')}>Delete</button>
          </form>
          <Said ok={answer.ok} message={answer.message} />
        </div>
      </div>
    </article>
  )
}

export function AddBill() {
  const [open, setOpen] = useState(false)
  if (open) return <BillForm onDone={() => setOpen(false)} />
  return (
    <button type="button" onClick={() => setOpen(true)} className={buttonClass('secondary', 'normal')}>
      <Plus aria-hidden className="size-4" /> Add a bill
    </button>
  )
}

export function BillForm({ bill, onDone }: { bill?: Bill; onDone: () => void }) {
  const [state, action, pending] = useAction(saveBill, onDone)
  return (
    <form action={action} className="flex flex-col gap-3 rounded-[10px] bg-inner px-4 py-4">
      {bill ? <input type="hidden" name="id" value={bill.id} /> : null}
      {bill?.anchorDay ? <input type="hidden" name="anchorDay" value={bill.anchorDay} /> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name"><input name="name" required defaultValue={bill?.name} className={INPUT} /></Field>
        <Field label="What it is for"><input name="what" defaultValue={bill?.what ?? ''} className={INPUT} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Amount" hint="Blank if not known">
          <input name="amount" inputMode="decimal" defaultValue={bill?.amount ?? ''} className={INPUT} />
        </Field>
        <Field label="Currency">
          <select name="currency" defaultValue={bill?.currency ?? 'USD'} className={INPUT}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Charges">
          <select name="cadence" defaultValue={bill?.cadence ?? 'monthly'} className={INPUT}>
            {BILL_CADENCES.map((c) => <option key={c} value={c}>{BILL_CADENCE_LABEL[c]}</option>)}
          </select>
        </Field>
        <Field label="Next charge">
          <input name="nextChargeOn" type="date" defaultValue={bill?.nextChargeOn ?? ''} className={INPUT} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Status">
          <select name="status" defaultValue={bill?.status ?? 'active'} className={INPUT}>
            {BILL_STATUSES.map((s) => <option key={s} value={s}>{BILL_STATUS_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field label="Overdue" hint="In the bill's currency">
          <input name="overdueAmount" inputMode="decimal" defaultValue={bill?.overdueAmount || ''} className={INPUT} />
        </Field>
        <Field label="Paid with"><input name="paymentMethod" defaultValue={bill?.paymentMethod ?? ''} className={INPUT} /></Field>
        <Field label="Group"><input name="category" defaultValue={bill?.category ?? ''} className={INPUT} /></Field>
      </div>
      <Field label="Billing page"><input name="manageUrl" type="url" placeholder="https://" defaultValue={bill?.manageUrl ?? ''} className={INPUT} /></Field>
      <Field label="Notes"><textarea name="notes" defaultValue={bill?.notes ?? ''} className={TEXTAREA} /></Field>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Check name="isEstimate" label="The amount is an estimate" defaultChecked={bill?.isEstimate} />
        <Check name="shared" label="Shared with other projects" defaultChecked={bill?.shared} />
        <Check name="usageTracked" label="Covered by the usage figures" defaultChecked={bill?.usageTracked} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={buttonClass('primary', 'small')}>{pending ? 'Saving…' : bill ? 'Save' : 'Add bill'}</button>
        <button type="button" onClick={onDone} className={buttonClass('ghost', 'small')}>Cancel</button>
        <Said ok={state.ok} message={state.message} />
      </div>
    </form>
  )
}

// ---- Clients and prospects -------------------------------------------------------

export function PlanItem({ plan, rates, today }: { plan: PlanView; rates: Rates; today: string }) {
  const [editing, setEditing] = useState(false)
  const [removed, remove, removing] = useAction(deletePlan)
  if (editing) return <PlanForm plan={plan} onDone={() => setEditing(false)} />

  const priceZar = toZar(plan.price, plan.currency, rates)
  const trialDays = plan.trialEndsOn ? daysBetween(today, plan.trialEndsOn) : null
  const perRun = plan.overrideUsd !== null
    ? `${fmtUsd(plan.overrideUsd)} a run, typed here`
    : plan.measured
      ? `${fmtUsd(plan.measured.perRun.openai + plan.measured.perRun.transcripts + plan.measured.perRun.apify)} a run, the average of the last ${plan.measured.runs === 1 ? 'full run' : `${plan.measured.runs} full runs`}`
      : 'No full run yet: add a cost per run to plan with'
  return (
    <article className="flex flex-col gap-2 rounded-[10px] bg-inner px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="m-0 text-[15px] font-semibold">{plan.name}</h3>
          <StagePill stage={plan.stage} label={STAGE_LABEL[plan.stage]} />
        </div>
        <div className="text-left text-[13px] leading-[1.4] sm:text-right tabular-nums">
          {plan.price > 0 ? (
            <>
              <div className="font-medium">{fmtZar(priceZar)} a month</div>
              <div className="text-muted-foreground">{plan.currency === 'ZAR' ? fmtUsd(priceZar / rates.usdZar) : fmtNative(plan.price, plan.currency)}</div>
            </>
          ) : <div className="text-muted-foreground">No price set</div>}
        </div>
      </div>
      <p className="m-0 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-muted-foreground">
        <span>
          {RUN_CADENCE_LABEL[plan.cadence]}
          {plan.clientId ? (plan.cadenceSource === 'schedule' ? ', from its schedule' : ', set here') : ''}
        </span>
        <span>{perRun}</span>
        {plan.stage === 'trial' && plan.trialEndsOn ? (
          <span>
            Trial until {fmtDay(plan.trialEndsOn)}
            {trialDays !== null ? (trialDays < 0 ? `, ${-trialDays} days ago` : trialDays === 0 ? ', today' : `, ${trialDays} days`) : ''}
          </span>
        ) : null}
      </p>
      {plan.unpaidAmount > 0 ? (
        <p className="m-0 text-[13px] font-medium text-negative">
          Owes {fmtNative(plan.unpaidAmount, plan.currency)}
          {plan.currency !== 'ZAR' ? ` (${fmtZar(toZar(plan.unpaidAmount, plan.currency, rates))})` : ''}
        </p>
      ) : null}
      {plan.note ? <p className="m-0 whitespace-pre-line text-[12.5px] leading-[1.5]">{plan.note}</p> : null}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button type="button" onClick={() => setEditing(true)} className={buttonClass('secondary', 'small')}>Edit</button>
        {plan.planId ? (
          <form action={remove} onSubmit={confirmFirst(plan.clientId ? `Clear ${plan.name}'s plan? Its price, unpaid amount and note go.` : `Remove ${plan.name}?`)}>
            <input type="hidden" name="id" value={plan.planId} />
            <button type="submit" disabled={removing} className={buttonClass('ghost', 'small')}>{plan.clientId ? 'Clear' : 'Remove'}</button>
          </form>
        ) : null}
        <Said ok={removed.ok} message={removed.message} />
      </div>
    </article>
  )
}

export function AddProspect() {
  const [open, setOpen] = useState(false)
  if (open) return <PlanForm onDone={() => setOpen(false)} />
  return (
    <button type="button" onClick={() => setOpen(true)} className={buttonClass('secondary', 'normal')}>
      <Plus aria-hidden className="size-4" /> Add a prospect
    </button>
  )
}

/** A client's plan, or (with no plan, or a plan with no client) a prospect. */
export function PlanForm({ plan, onDone }: { plan?: PlanView; onDone: () => void }) {
  const [state, action, pending] = useAction(savePlan, onDone)
  const prospect = !plan || plan.clientId === null
  const [stage, setStage] = useState(plan?.stage ?? 'paying')
  return (
    <form action={action} className="flex flex-col gap-3 rounded-[10px] bg-inner px-4 py-4">
      <input type="hidden" name="kind" value={prospect ? 'prospect' : 'client'} />
      {plan?.planId && prospect ? <input type="hidden" name="id" value={plan.planId} /> : null}
      {plan?.clientId ? <input type="hidden" name="clientId" value={plan.clientId} /> : null}
      {prospect ? (
        <Field label="Prospect"><input name="name" required defaultValue={plan?.name ?? ''} className={INPUT} /></Field>
      ) : (
        <p className="m-0 text-[15px] font-semibold">{plan.name}</p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {!prospect ? (
          <Field label="Stage">
            <select name="stage" value={stage} onChange={(e) => setStage(e.target.value as typeof stage)} className={INPUT}>
              <option value="paying">Paying</option>
              <option value="trial">Trial</option>
            </select>
          </Field>
        ) : null}
        <Field label="Pays a month"><input name="price" inputMode="decimal" defaultValue={plan?.price || ''} className={INPUT} /></Field>
        <Field label="Currency">
          <select name="currency" defaultValue={plan?.currency ?? 'USD'} className={INPUT}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        {!prospect ? (
          <Field label="Unpaid"><input name="unpaidAmount" inputMode="decimal" defaultValue={plan?.unpaidAmount || ''} className={INPUT} /></Field>
        ) : null}
        {!prospect && stage === 'trial' ? (
          <Field label="Trial ends"><input name="trialEndsOn" type="date" defaultValue={plan?.trialEndsOn ?? ''} className={INPUT} /></Field>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Runs">
          <select name="cadence" defaultValue={prospect ? (plan?.cadence ?? 'weekly') : plan.cadenceSource === 'plan' ? plan.cadence : ''} className={INPUT}>
            {!prospect ? <option value="">Follow its schedule ({RUN_CADENCE_LABEL[plan.scheduleCadence ?? 'none'].toLowerCase()})</option> : null}
            {RUN_CADENCES.map((c) => <option key={c} value={c}>{RUN_CADENCE_LABEL[c]}</option>)}
          </select>
        </Field>
        <Field label="Cost per run (USD)" hint={prospect ? 'Your guess for a new client; blank means none yet' : 'Blank uses the average of its last 3 full runs'}>
          <input name="costPerRunUsd" inputMode="decimal" defaultValue={plan?.overrideUsd ?? ''} className={INPUT} />
        </Field>
      </div>
      <Field label="Note"><textarea name="note" defaultValue={plan?.note ?? ''} className={TEXTAREA} /></Field>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={buttonClass('primary', 'small')}>{pending ? 'Saving…' : plan ? 'Save' : 'Add prospect'}</button>
        <button type="button" onClick={onDone} className={buttonClass('ghost', 'small')}>Cancel</button>
        <Said ok={state.ok} message={state.message} />
      </div>
    </form>
  )
}

// ---- OpenAI balance --------------------------------------------------------------

export function BalanceForm({ balanceUsd, balanceOn, today }: { balanceUsd: number | null; balanceOn: string | null; today: string }) {
  const [state, action, pending] = useAction(saveOpenaiBalance)
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] items-end gap-2">
        <Field label="Balance (USD)"><input name="openaiBalanceUsd" inputMode="decimal" required defaultValue={balanceUsd ?? ''} className={INPUT} /></Field>
        <Field label="Read on"><input name="openaiBalanceOn" type="date" required defaultValue={balanceOn ?? today} className={INPUT} /></Field>
        <button type="submit" disabled={pending} className={buttonClass('secondary', 'small')}>{pending ? 'Saving…' : 'Save'}</button>
      </div>
      <Said ok={state.ok} message={state.message} />
    </form>
  )
}

// ---- The forecast's switches -----------------------------------------------------

export function ToggleButton({ name, on, label }: { name: 'countShared' | 'countProspects'; on: boolean; label: string }) {
  const [state, action, pending] = useAction(setToggle)
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="key" value={name} />
      <input type="hidden" name="value" value={on ? 'false' : 'true'} />
      <button
        type="submit"
        role="switch"
        aria-checked={on}
        disabled={pending}
        className="inline-flex h-[30px] cursor-pointer items-center gap-2 rounded-full bg-inner pr-3 pl-1 text-[12.5px] font-medium transition-colors hover:bg-track focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
      >
        <span aria-hidden className={`relative inline-flex h-[18px] w-[30px] shrink-0 rounded-full transition-colors ${on ? 'bg-foreground' : 'bg-border'}`}>
          <span className={`absolute top-[2px] size-[14px] rounded-full bg-card transition-[left] duration-200 ${on ? 'left-[14px]' : 'left-[2px]'}`} />
        </span>
        {label}
      </button>
      {!state.ok ? <Said ok={false} message={state.message} /> : null}
    </form>
  )
}

// ---- The assumptions -------------------------------------------------------------

export function SettingsForm({ settings }: { settings: CostSettings }) {
  const [state, action, pending] = useAction(saveSettings)
  const n = (v: number | null) => (v === null ? '' : String(v))
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Field label="Rand per dollar"><input name="usdZar" inputMode="decimal" required defaultValue={n(settings.usdZar)} className={INPUT} /></Field>
        <Field label="Rand per euro"><input name="eurZar" inputMode="decimal" required defaultValue={n(settings.eurZar)} className={INPUT} /></Field>
        <Field label="Extra OpenAI a month" hint="gbrain and tests, same key"><input name="extraOpenaiUsd" inputMode="decimal" required defaultValue={n(settings.extraOpenaiUsd)} className={INPUT} /></Field>
        <Field label="Extra Apify a month" hint="Snapshots and tests"><input name="extraApifyUsd" inputMode="decimal" required defaultValue={n(settings.extraApifyUsd)} className={INPUT} /></Field>
        <Field label="Apify plan fee" hint="Apify never bills less"><input name="apifyPlanUsd" inputMode="decimal" required defaultValue={n(settings.apifyPlanUsd)} className={INPUT} /></Field>
        <Field label="Apify cap"><input name="apifyCapUsd" inputMode="decimal" required defaultValue={n(settings.apifyCapUsd)} className={INPUT} /></Field>
        <Field label="Apify cycle starts on" hint="Day of the month"><input name="apifyCycleDay" type="number" min={1} max={28} required defaultValue={settings.apifyCycleDay} className={INPUT} /></Field>
        <Field label="OpenAI balance (USD)"><input name="openaiBalanceUsd" inputMode="decimal" defaultValue={n(settings.openaiBalanceUsd)} className={INPUT} /></Field>
        <Field label="Balance read on"><input name="openaiBalanceOn" type="date" defaultValue={settings.openaiBalanceOn ?? ''} className={INPUT} /></Field>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Check name="countShared" label="Count shared bills (Claude Max)" defaultChecked={settings.countShared} />
        <Check name="countProspects" label="Count prospects" defaultChecked={settings.countProspects} />
      </div>
      <p className="m-0 text-[12px] text-muted-foreground">Dollar figures are US dollars.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={buttonClass('primary', 'small')}>{pending ? 'Saving…' : 'Save assumptions'}</button>
        <Said ok={state.ok} message={state.message} />
      </div>
    </form>
  )
}
