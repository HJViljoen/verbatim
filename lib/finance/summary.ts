import { addDays } from '@/lib/costs/dates'
import type { Ledger } from './ledger'
import type { FinCurrency, Payment } from './types'

// The "Money in" figures at the top of Ops → Costs: what is owed, what is due
// soon, what came in, what the month costs and what is left. Dollar figures
// are turned into rand at the COST side's rate (cost_settings.usd_zar, live
// when it refreshes itself): what a dollar balance is worth today, not the
// rate an invoice was priced at. Pure.

export interface MoneyIn {
  /** Every sent invoice's balance. */
  owedToYouZar: number
  /** The part of it already past due. */
  overdueZar: number
  /** Owed and due by 30 days from today, overdue included. */
  dueNext30Zar: number
  receivedThisMonthZar: number
  receivedThisYearZar: number
  /** A month's costs, as the plan below works it out (bills and usage). */
  costsThisMonthZar: number
  /** Received this month less this month's costs. */
  leftOverZar: number
  /** Payments beyond what was owed, held as the client's credit. */
  creditZar: number
  /** Each client's balance, for the clients that have invoices. */
  owedByClientZar: Map<string, number>
}

export function zarOf(amount: number, currency: FinCurrency, usdZar: number): number {
  return currency === 'USD' ? amount * usdZar : amount
}

export function summarise(
  ledger: Ledger,
  payments: readonly Payment[],
  opts: { today: string; usdZar: number; costsThisMonthZar: number; clientsWithInvoices: readonly string[] },
): MoneyIn {
  const { today, usdZar } = opts
  const horizon = addDays(today, 30)
  let owed = 0
  let overdue = 0
  let dueSoon = 0
  const byClient = new Map<string, number>(opts.clientsWithInvoices.map((c) => [c, 0]))
  for (const b of ledger.byId.values()) {
    if (b.balanceCents <= 0) continue
    const zar = zarOf(b.balanceCents / 100, b.currency, usdZar)
    owed += zar
    if (b.state === 'overdue') overdue += zar
    if (b.dueOn <= horizon) dueSoon += zar
    byClient.set(b.clientId, (byClient.get(b.clientId) ?? 0) + zar)
  }
  const month = today.slice(0, 7)
  const year = today.slice(0, 4)
  let thisMonth = 0
  let thisYear = 0
  for (const p of payments) {
    const zar = zarOf(p.amount, p.currency, usdZar)
    if (p.receivedOn.slice(0, 7) === month) thisMonth += zar
    if (p.receivedOn.slice(0, 4) === year) thisYear += zar
  }
  const creditZar = ledger.credit.reduce((s, c) => s + zarOf(c.cents / 100, c.currency, usdZar), 0)
  return {
    owedToYouZar: owed,
    overdueZar: overdue,
    dueNext30Zar: dueSoon,
    receivedThisMonthZar: thisMonth,
    receivedThisYearZar: thisYear,
    costsThisMonthZar: opts.costsThisMonthZar,
    leftOverZar: thisMonth - opts.costsThisMonthZar,
    creditZar,
    owedByClientZar: byClient,
  }
}
