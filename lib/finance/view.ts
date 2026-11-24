import { addDays } from '@/lib/costs/dates'
import { applyPayments, type InvoiceBalance } from './ledger'
import { priceMonth } from './money'
import { upcomingIssue } from './periods'
import { summarise, zarOf, type MoneyIn } from './summary'
import type { BillingProfile, FinCurrency, Invoice, Issuer, Payment } from './types'

// The Money in part of Ops → Costs, decided: the loaded rows in, everything
// the page prints out. Pure (lib/finance/view.test.ts), so the components
// only lay it out.

export interface FinanceRows {
  issuer: Issuer | null
  profiles: BillingProfile[]
  invoices: Invoice[]
  payments: Payment[]
}

export interface InvoiceRow {
  invoice: Invoice
  balance: InvoiceBalance
  /** The number of the invoice it replaces, or the one a credit note cancels. */
  relatedNumber: string | null
  /** A signed link to its PDF, when it has one. */
  pdfUrl: string | null
  /** Ready, and waiting for a tap (held, a review profile, or a paused one). */
  waiting: boolean
  /** Its profile sends it by itself on the next run. */
  autoSends: boolean
}

export interface ProfileView {
  profile: BillingProfile
  clientName: string
  /** What the month costs as invoiced (its own currency). */
  monthTotal: number
  next: ReturnType<typeof upcomingIssue>
}

export interface MoneyInItem {
  date: string
  label: string
  amount: number
  currency: FinCurrency
  zar: number
  late: boolean
}

export interface MoneyView {
  summary: MoneyIn
  invoices: InvoiceRow[]
  payments: Payment[]
  profiles: ProfileView[]
  comingUp: MoneyInItem[]
  /** Clients that pay (have a profile or an invoice), for the payment form. */
  payers: { id: string; name: string; currency: FinCurrency }[]
}

export function buildMoneyView(
  rows: FinanceRows,
  opts: { today: string; usdZar: number; costsThisMonthZar: number; clientNames: ReadonlyMap<string, string>; pdfUrls?: ReadonlyMap<string, string> },
): MoneyView {
  const { today, usdZar } = opts
  const ledger = applyPayments(rows.invoices, rows.payments, today)
  const clientsWithInvoices = [...new Set(rows.invoices.map((i) => i.clientId))]
  const summary = summarise(ledger, rows.payments, { today, usdZar, costsThisMonthZar: opts.costsThisMonthZar, clientsWithInvoices })
  const byId = new Map(rows.invoices.map((i) => [i.id, i]))
  const profileById = new Map(rows.profiles.map((p) => [p.id, p]))

  const invoices = [...rows.invoices]
    .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.number.localeCompare(a.number))
    .map((invoice): InvoiceRow => {
      const p = invoice.profileId ? profileById.get(invoice.profileId) : undefined
      const autoSends = Boolean(p && p.active && p.sendMode === 'auto' && !p.holdNext)
      return {
        invoice,
        balance: ledger.byId.get(invoice.id) as InvoiceBalance,
        relatedNumber: invoice.relatesTo ? (byId.get(invoice.relatesTo)?.number ?? null) : null,
        pdfUrl: invoice.pdfPath ? (opts.pdfUrls?.get(invoice.pdfPath) ?? null) : null,
        waiting: invoice.status === 'ready' && !autoSends,
        autoSends,
      }
    })

  const billed = (clientId: string) => rows.invoices
    .filter((i) => i.clientId === clientId && i.kind === 'invoice' && i.periodStart && i.status !== 'credited' && i.status !== 'void')
    .map((i) => i.periodStart as string)

  const profiles = rows.profiles.map((profile): ProfileView => ({
    profile,
    clientName: opts.clientNames.get(profile.clientId) ?? profile.billTo,
    monthTotal: priceMonth(profile).total,
    next: upcomingIssue(profile, billed(profile.clientId), today),
  }))

  // Coming up, money in: what is owed by its due day (and the day promised,
  // where one was), and each profile's next invoice by the day it issues.
  const horizon = addDays(today, 60)
  const comingUp: MoneyInItem[] = []
  for (const r of invoices) {
    const b = r.balance
    if (b.balanceCents <= 0) continue
    const amount = b.balanceCents / 100
    const zar = zarOf(amount, b.currency, usdZar)
    if (b.dueOn <= horizon) comingUp.push({ date: b.dueOn, label: `Invoice ${b.number} due (${r.invoice.billTo})`, amount, currency: b.currency, zar, late: b.state === 'overdue' })
    if (r.invoice.expectedOn && r.invoice.expectedOn <= horizon) {
      comingUp.push({ date: r.invoice.expectedOn, label: `Invoice ${b.number} promised (${r.invoice.billTo})`, amount, currency: b.currency, zar, late: r.invoice.expectedOn < today })
    }
  }
  for (const p of profiles) {
    if (!p.next || p.next.issueOn > horizon) continue
    comingUp.push({
      date: p.next.issueOn, label: `Invoice for ${p.next.periodLabel} issues (${p.profile.billTo})`, amount: p.monthTotal,
      currency: p.profile.currency, zar: zarOf(p.monthTotal, p.profile.currency, usdZar), late: false,
    })
  }
  comingUp.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label))

  const payers = new Map<string, { id: string; name: string; currency: FinCurrency }>()
  for (const p of rows.profiles) payers.set(p.clientId, { id: p.clientId, name: opts.clientNames.get(p.clientId) ?? p.billTo, currency: p.currency })
  for (const i of rows.invoices) if (!payers.has(i.clientId)) payers.set(i.clientId, { id: i.clientId, name: opts.clientNames.get(i.clientId) ?? i.billTo, currency: i.currency })

  return {
    summary,
    invoices,
    payments: [...rows.payments].sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || b.id.localeCompare(a.id)),
    profiles,
    comingUp,
    payers: [...payers.values()],
  }
}
