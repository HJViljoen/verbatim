import { HandCoins, ListOrdered, Plus } from 'lucide-react'
import { Figure, Section } from '@/components/ops/costs/sections'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { fmtDay } from '@/lib/costs/dates'
import { summariseLoan, type LoanSummary } from '@/lib/family-loan/ledger'
import { randFormatter } from '@/lib/family-loan/money'
import type { LoanEntry } from '@/lib/family-loan/types'
import { cn } from '@/lib/utils'
import { EntryForm, LedgerRow, type LedgerRowData } from './editors'
import { LEDGER_COLS } from './ledger-cols'

// The loan page, laid out (operator only). Every figure arrives decided in
// `LoanSummary` (lib/family-loan/ledger.ts); these components print it, on the
// Costs page's cards and figures (components/ops/costs/sections.tsx). One
// formatter for the page: whole rand while every amount is whole, cents
// everywhere once one is not.

type Fmt = (cents: number) => string

/** What is owed now, and under it what was borrowed, paid back, and the last
 *  repayment. More paid back than borrowed says so; it is never a negative
 *  debt. */
export function Balance({ s, fmt }: { s: LoanSummary; fmt: Fmt }) {
  if (s.standing === 'empty') {
    return (
      <Section icon={HandCoins} title="Owed to Dad">
        <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground">
          Nothing recorded yet. Add what you borrowed and each repayment, and the balance keeps itself.
        </p>
      </Section>
    )
  }
  const over = s.standing === 'overpaid'
  const last = s.lastRepayment
  return (
    <Section icon={HandCoins} title={over ? 'Overpaid' : 'Owed to Dad now'}>
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[34px] font-semibold leading-none tabular-nums">
          {fmt(Math.abs(s.outstandingCents))}
        </span>
        {over ? (
          <p className="m-0 text-[13px] text-muted-foreground">You have paid Dad back {fmt(-s.outstandingCents)} more than you borrowed.</p>
        ) : s.standing === 'settled' ? (
          <p className="m-0 text-[13px] text-muted-foreground">All paid back.</p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Figure label="Borrowed"><span className="text-[15px] font-semibold tabular-nums">{fmt(s.borrowedCents)}</span></Figure>
        <Figure label="Paid back"><span className="text-[15px] font-semibold tabular-nums">{fmt(s.repaidCents)}</span></Figure>
        <Figure label="Last repayment" sub={last ? fmtDay(last.on) : undefined} className="col-span-2 sm:col-span-1">
          {last
            ? <span className="text-[15px] font-semibold tabular-nums">{fmt(last.amountCents)}</span>
            : <span className="text-[13px] text-muted-foreground">None yet</span>}
        </Figure>
      </div>
    </Section>
  )
}

/** The balance after an entry, in words where it went below zero. */
function balanceWords(cents: number, fmt: Fmt): string {
  return cents < 0 ? `${fmt(-cents)} overpaid` : fmt(cents)
}

/** Every entry, newest first, with the balance after each. */
export function Ledger({ s, fmt, today }: { s: LoanSummary; fmt: Fmt; today: string }) {
  const rows: LedgerRowData[] = s.lines.map((l) => ({
    entry: l.entry,
    amount: fmt(l.entry.amountCents),
    balance: balanceWords(l.balanceAfterCents, fmt),
    overpaid: l.balanceAfterCents < 0,
  }))
  const n = rows.length
  return (
    <Section icon={ListOrdered} title="Ledger" meta={n ? <span>{n} {n === 1 ? 'entry' : 'entries'} · newest first</span> : undefined}>
      {n === 0 ? (
        <p className="m-0 text-[13px] text-muted-foreground">No entries yet.</p>
      ) : (
        <div role="table" aria-label="Ledger, newest first" className="@container/ledger flex min-w-0 flex-col">
          <div
            role="row"
            className={cn(
              'hidden items-end gap-x-4 border-b border-border pb-2 text-[12px] font-semibold text-secondary-foreground @min-[800px]/ledger:grid',
              LEDGER_COLS,
            )}
          >
            <span role="columnheader">Date</span>
            <span role="columnheader">Note</span>
            <span role="columnheader" className="text-right">Borrowed</span>
            <span role="columnheader" className="text-right">Paid back</span>
            <span role="columnheader" className="text-right">Balance after</span>
            <span role="columnheader"><span className="sr-only">Change it</span></span>
          </div>
          {rows.map((r) => <LedgerRow key={r.entry.id} row={r} today={today} />)}
        </div>
      )}
    </Section>
  )
}

/** The whole page from its loaded rows: what app/dashboard/ops/loan/page.tsx
 *  renders once the operator is checked. */
export function LoanBody({ entries, today }: { entries: LoanEntry[]; today: string }) {
  const s = summariseLoan(entries)
  const fmt = randFormatter(entries.map((e) => e.amountCents))
  return (
    <PageFrame>
      <PageBar title="Dad" line="What you borrowed from Dad and what you have paid back, in rand" />
      <div className="grid grid-cols-1 gap-[22px] xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <Balance s={s} fmt={fmt} />
        <Section icon={Plus} title="Add an entry">
          <EntryForm today={today} />
        </Section>
      </div>
      <Ledger s={s} fmt={fmt} today={today} />
    </PageFrame>
  )
}
