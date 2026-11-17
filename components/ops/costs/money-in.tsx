import { CalendarCheck, FileText, HandCoins, Landmark } from 'lucide-react'
import { Card } from '@/components/pages/studio/ui'
import { fmtDay } from '@/lib/costs/dates'
import { fmtUsd, fmtZar } from '@/lib/costs/money'
import { LEDGER_STATE_LABEL, type LedgerState } from '@/lib/finance/ledger'
import { fmtMoney } from '@/lib/finance/money'
import { DUE_RULE_LABEL, SEND_MODE_LABEL, mayHaveGone } from '@/lib/finance/types'
import type { MoneyView } from '@/lib/finance/view'
import { cn } from '@/lib/utils'
import { Pill } from './fields'
import { HoldSwitch, InvoiceActions, PaymentDelete, PaymentForm, ProfileEdit } from './money-editors'
import { Figure, Section } from './sections'

// Money in, on Ops → Costs (operator only, Finance 2026-11-17): what clients
// owe and pay, each invoice and what it still owes, the payments, and each
// client's billing. Every figure arrives decided in `MoneyView`
// (lib/finance/view.ts); these components print it. Rand first, dollars
// beside, at the page's rate.

const PAD = 'gap-4 px-5 pt-[22px] pb-5 sm:px-[30px] sm:pt-[26px] sm:pb-[22px]'

const STATE_TONE: Record<LedgerState, 'plain' | 'soft' | 'bad' | 'faint'> = {
  unsent: 'soft', open: 'plain', part: 'soft', paid: 'faint', overdue: 'bad', credited: 'faint', void: 'faint',
}

function Big({ zar, usdZar, signed = false }: { zar: number; usdZar: number; signed?: boolean }) {
  const neg = Math.round(zar) < 0
  return (
    <span className={cn('tabular-nums', signed && neg ? 'text-negative' : null)}>
      <span className="font-mono text-[26px] font-semibold leading-none">{signed && !neg && Math.round(zar) > 0 ? '+' : ''}{fmtZar(zar)}</span>
      <span className="ml-1.5 text-[13px] text-muted-foreground">{fmtUsd(zar / usdZar)}</span>
    </span>
  )
}

/** `owedToYouZar` is the page's one "Owed to you" (the summary below prints
 *  the same): the invoices' balances, plus the hand-kept unpaid amount of any
 *  client with no invoices yet. */
export function MoneyInSummary({ view, usdZar, owedToYouZar }: { view: MoneyView; usdZar: number; owedToYouZar: number }) {
  const s = view.summary
  const byHand = Math.round(owedToYouZar - s.owedToYouZar)
  const subs = [
    s.overdueZar > 0 ? `${fmtZar(s.overdueZar)} of it overdue` : 'Nothing overdue',
    ...(byHand > 0 ? [`${fmtZar(byHand)} of it kept by hand, for clients with no invoices`] : []),
  ]
  return (
    <Card className={PAD}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Figure label="Owed to you" sub={subs.join(' · ')}>
          <Big zar={owedToYouZar} usdZar={usdZar} />
        </Figure>
        <Figure label="Due in the next 30 days" sub="Overdue included">
          <Big zar={s.dueNext30Zar} usdZar={usdZar} />
        </Figure>
        <Figure label="Received this month" sub={`${fmtZar(s.receivedThisYearZar)} this year`}>
          <Big zar={s.receivedThisMonthZar} usdZar={usdZar} />
        </Figure>
        <Figure label="Costs this month" sub="Bills and usage, as planned below">
          <Big zar={s.costsThisMonthZar} usdZar={usdZar} />
        </Figure>
        <Figure label="Left over this month" sub="Received less costs">
          <Big zar={s.leftOverZar} usdZar={usdZar} signed />
        </Figure>
      </div>
      {s.creditZar > 0 ? (
        <p className="m-0 text-[13px] text-muted-foreground">Paid beyond what was owed, held as the client&rsquo;s credit: {fmtZar(s.creditZar)}.</p>
      ) : null}
    </Card>
  )
}

export function Invoices({ view, today, usdZar, now }: { view: MoneyView; today: string; usdZar: number; now: Date }) {
  const recipients = new Map(view.profiles.map((p) => [p.profile.id, [...p.profile.emailTo, ...p.profile.emailCc].join(', ')]))
  return (
    <Section icon={FileText} title="Invoices" meta={<span>{view.invoices.length} · newest first</span>}>
      {view.invoices.length === 0 ? <p className="m-0 text-[13px] text-muted-foreground">No invoices yet.</p> : (
        <ol className="m-0 flex list-none flex-col p-0">
          {view.invoices.map(({ invoice: i, balance: b, relatedNumber, pdfUrl, waiting, autoSends }) => {
            const credit = i.kind === 'credit_note'
            const unsure = mayHaveGone(i, now)
            return (
              <li key={i.id} className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-border py-3.5 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[14px] font-semibold tabular-nums">{credit ? i.number : `Invoice ${i.number}`}</span>
                    <span className="text-[13.5px]">{i.periodLabel}</span>
                    <Pill tone={unsure ? 'bad' : STATE_TONE[b.state]}>{credit ? 'Credit note' : unsure ? 'May have gone' : i.status === 'draft' ? 'Not printed' : i.status === 'sending' ? 'Sending' : LEDGER_STATE_LABEL[b.state]}</Pill>
                    {b.partPaid && b.state !== 'part' ? <Pill tone="soft">Part-paid</Pill> : null}
                    {waiting ? <Pill tone="soft">Held for you</Pill> : null}
                    {i.status === 'ready' && autoSends ? <Pill tone="faint">Sends itself</Pill> : null}
                  </div>
                  <p className="m-0 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-muted-foreground">
                    <span>{i.billTo}</span>
                    <span>Issued {fmtDay(i.issuedOn)}</span>
                    {credit || b.state === 'credited' || b.state === 'void' ? null : <span className={b.state === 'overdue' ? 'font-medium text-negative' : undefined}>{i.dueOn ? `Due ${fmtDay(i.dueOn)}` : 'Due on receipt'}</span>}
                    {relatedNumber ? <span>{credit ? `Cancels ${relatedNumber}` : `Replaces ${relatedNumber}`}</span> : null}
                    {i.sentAt ? <span>Sent {fmtDay(i.sentAt.slice(0, 10))}</span> : null}
                    {b.paidOn ? <span>Paid {fmtDay(b.paidOn)}</span> : null}
                    {i.expectedOn && b.balanceCents > 0 ? <span className={i.expectedOn < today ? 'text-negative' : undefined}>Promised for {fmtDay(i.expectedOn)}</span> : null}
                    {pdfUrl ? <a href={pdfUrl} target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-2 hover:underline">PDF</a> : null}
                  </p>
                  {i.sendError && i.status === 'ready' ? (
                    <p className="m-0 text-[12.5px] text-negative">The last send did not go: {i.sendError} The daily job will not retry it; Send does.</p>
                  ) : null}
                  {unsure ? (
                    <p className="m-0 text-[12.5px] text-negative">
                      It may have gone{i.sendError ? ` (${i.sendError})` : ' (the send stopped half-way)'}. The daily job will not send it again.
                    </p>
                  ) : null}
                  <InvoiceActions
                    invoice={i}
                    recipients={(i.profileId ? recipients.get(i.profileId) : null) || 'the client'}
                    owed={b.balanceCents > 0}
                    unsure={unsure}
                  />
                </div>
                <div className="text-left text-[13px] tabular-nums lg:text-right">
                  <div className="font-medium">{credit ? fmtMoney(-i.total, i.currency) : fmtMoney(i.total, i.currency)}</div>
                  {i.currency === 'USD' ? <div className="text-muted-foreground">{fmtZar(i.total * usdZar)}</div> : null}
                  {b.paidCents > 0 && b.balanceCents > 0 ? <div className="text-muted-foreground">{fmtMoney(b.paidCents / 100, b.currency)} paid</div> : null}
                  {b.balanceCents > 0 ? <div className={cn('font-semibold', b.state === 'overdue' ? 'text-negative' : null)}>{fmtMoney(b.balanceCents / 100, b.currency)} owed</div> : null}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Section>
  )
}

export function Payments({ view, today }: { view: MoneyView; today: string }) {
  return (
    <Section icon={HandCoins} title="Payments" meta={<span>Applied to the oldest invoice first</span>}>
      <PaymentForm payers={view.payers} today={today} />
      {view.payments.length === 0 ? <p className="m-0 text-[13px] text-muted-foreground">No payments recorded yet.</p> : (
        <ol className="m-0 flex list-none flex-col p-0">
          {view.payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-border py-2.5 first:border-t-0">
              <span className="flex flex-wrap items-baseline gap-x-3 text-[13px]">
                <span className="font-mono text-[12px] tabular-nums text-secondary-foreground">{fmtDay(p.receivedOn)}</span>
                <span className="font-medium tabular-nums">{fmtMoney(p.amount, p.currency)}</span>
                {p.reference ? <span className="text-muted-foreground">{p.reference}</span> : null}
              </span>
              <PaymentDelete id={p.id} />
            </li>
          ))}
        </ol>
      )}
    </Section>
  )
}

export function Billing({ view }: { view: MoneyView }) {
  return (
    <Section icon={Landmark} title="Billing" meta={<span>What each client is invoiced, and when</span>}>
      {view.profiles.length === 0 ? <p className="m-0 text-[13px] text-muted-foreground">No client is set up for invoicing yet. scripts/finance-backfill.ts sets one up.</p> : null}
      {view.profiles.map(({ profile: p, clientName, monthTotal, next }) => (
        <article key={p.id} className="flex flex-col gap-2.5 rounded-[10px] bg-inner px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-[15px] font-semibold">{clientName}</h3>
            {p.active ? <Pill tone="plain">{SEND_MODE_LABEL[p.sendMode]}</Pill> : <Pill tone="faint">Paused</Pill>}
            {p.holdNext ? <Pill tone="soft">Next one held for you</Pill> : null}
          </div>
          <p className="m-0 text-[13px]">
            <span className="font-medium tabular-nums">{fmtMoney(monthTotal, p.currency)}</span> a month to {p.billTo}
            {p.currency === 'ZAR' ? <span className="text-muted-foreground"> · ${p.lines.reduce((s, l) => s + l.unitUsd * l.qty, 0).toFixed(2)} at a fixed R{p.fxRate.toFixed(2)}</span> : null}
          </p>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[12.5px] text-muted-foreground">
            {p.lines.map((l, n) => <li key={n}>{l.description}: ${l.unitUsd.toFixed(2)}{l.qty !== 1 ? ` × ${l.qty}` : ''}</li>)}
          </ul>
          <p className="m-0 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-muted-foreground">
            <span>Issued on the {p.issueDay}{p.issueDay === 1 || p.issueDay === 21 ? 'st' : p.issueDay === 2 || p.issueDay === 22 ? 'nd' : p.issueDay === 3 || p.issueDay === 23 ? 'rd' : 'th'} of the month before</span>
            <span>Due: {DUE_RULE_LABEL[p.dueRule].toLowerCase()}</span>
            <span>To {p.emailTo.join(', ')}{p.emailCc.length ? `, cc ${p.emailCc.join(', ')}` : ''}</span>
          </p>
          {next ? (
            <p className="m-0 flex items-center gap-1.5 text-[13px]">
              <CalendarCheck aria-hidden className="size-4 text-muted-foreground" />
              Next: {next.periodLabel}, issued {fmtDay(next.issueOn)}{next.dueOn ? `, due ${fmtDay(next.dueOn)}` : ''}
              {p.sendMode === 'auto' && !p.holdNext ? ', sent by itself' : ', held for your tap'}.
            </p>
          ) : null}
          {p.noteOnce ? <p className="m-0 text-[12.5px] text-muted-foreground">The next email also says: &ldquo;{p.noteOnce}&rdquo;</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <HoldSwitch profileId={p.id} on={p.holdNext} />
            <ProfileEdit profile={p} />
          </div>
        </article>
      ))}
    </Section>
  )
}

/** Shown in place of Money in until the finance migration is applied. */
export function MoneyInMissing() {
  return (
    <Card className="gap-2 px-[30px] py-[26px] text-[13px]">
      <p className="m-0 font-semibold">Money in: the finance tables are not in this database yet.</p>
      <p className="m-0 text-muted-foreground">Apply supabase/migrations/20261115090000_finance.sql, then reload. The costs below work without it.</p>
    </Card>
  )
}
