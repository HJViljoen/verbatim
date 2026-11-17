import { centsOf } from './money'
import type { FinCurrency, Invoice, Payment } from './types'

// What each invoice still owes, derived on every read and never stored
// (supabase/migrations/20261115090000_finance.sql). Pure.
//
// THE RULES. A credit note cancels the invoice it relates to: that invoice is
// `credited` and owes nothing, and the credit note itself is never owed. An
// invoice is owed once it is SENT; a draft or one waiting to be sent owes
// nothing yet. A client's payments are applied, in the order received, to its
// owed invoices IN THE SAME CURRENCY, oldest due first (an invoice due on
// receipt is due on the day it was issued); a payment larger than what is
// owed leaves the rest as the client's credit in that currency. Every sum is
// in whole cents.

export type LedgerState = 'unsent' | 'open' | 'part' | 'paid' | 'overdue' | 'credited' | 'void'

export interface InvoiceBalance {
  invoiceId: string
  number: string
  clientId: string
  currency: FinCurrency
  /** What the invoice is for, in cents (0 for one not owed). */
  totalCents: number
  paidCents: number
  balanceCents: number
  /** The day it is due: due_on, or the issue day for one due on receipt. */
  dueOn: string
  state: LedgerState
  /** Some paid, some still owed (whatever the due date says). */
  partPaid: boolean
  /** The day of the payment that settled it. */
  paidOn: string | null
}

export interface Ledger {
  /** Every invoice and credit note, by id. A credit note owes nothing and
   *  reads `credited` (or `void`); so does the invoice it cancels. */
  byId: Map<string, InvoiceBalance>
  /** What payments left over, per client and currency, in cents. */
  credit: { clientId: string; currency: FinCurrency; cents: number }[]
}

/** The day an invoice is due for ordering and lateness. */
export const effectiveDue = (i: Pick<Invoice, 'dueOn' | 'issuedOn'>): string => i.dueOn ?? i.issuedOn

/** Whether a credit note (or the status) cancels this invoice. */
function creditedIds(invoices: readonly Invoice[]): Set<string> {
  const out = new Set<string>()
  for (const i of invoices) {
    if (i.kind === 'invoice' && i.status === 'credited') out.add(i.id)
    if (i.kind === 'credit_note' && i.status !== 'void' && i.relatesTo) out.add(i.relatesTo)
  }
  return out
}

export function applyPayments(invoices: readonly Invoice[], payments: readonly Payment[], today: string): Ledger {
  const credited = creditedIds(invoices)
  const byId = new Map<string, InvoiceBalance>()

  // Owed invoices, oldest due first; the issue day and the number break ties.
  const owed = invoices
    .filter((i) => i.kind === 'invoice' && i.status === 'sent' && !credited.has(i.id))
    .sort((a, b) => effectiveDue(a).localeCompare(effectiveDue(b)) || a.issuedOn.localeCompare(b.issuedOn) || a.number.localeCompare(b.number))

  for (const i of invoices) {
    const isOwed = i.kind === 'invoice' && i.status === 'sent' && !credited.has(i.id)
    const state: LedgerState = i.kind === 'credit_note'
      ? (i.status === 'void' ? 'void' : 'credited')
      : credited.has(i.id) ? 'credited'
      : i.status === 'void' ? 'void'
      : !isOwed ? 'unsent'
      : 'open'
    byId.set(i.id, {
      invoiceId: i.id,
      number: i.number,
      clientId: i.clientId,
      currency: i.currency,
      totalCents: isOwed ? centsOf(i.total) : 0,
      paidCents: 0,
      balanceCents: isOwed ? centsOf(i.total) : 0,
      dueOn: effectiveDue(i),
      state,
      partPaid: false,
      paidOn: null,
    })
  }

  const credit = new Map<string, { clientId: string; currency: FinCurrency; cents: number }>()
  const ordered = [...payments].sort((a, b) => a.receivedOn.localeCompare(b.receivedOn) || a.id.localeCompare(b.id))
  for (const p of ordered) {
    let left = centsOf(p.amount)
    for (const inv of owed) {
      if (left <= 0) break
      if (inv.clientId !== p.clientId || inv.currency !== p.currency) continue
      const b = byId.get(inv.id) as InvoiceBalance
      if (b.balanceCents <= 0) continue
      const take = Math.min(left, b.balanceCents)
      b.paidCents += take
      b.balanceCents -= take
      left -= take
      if (b.balanceCents === 0) b.paidOn = p.receivedOn
    }
    if (left > 0) {
      const key = `${p.clientId}:${p.currency}`
      const c = credit.get(key) ?? { clientId: p.clientId, currency: p.currency, cents: 0 }
      c.cents += left
      credit.set(key, c)
    }
  }

  for (const inv of owed) {
    const b = byId.get(inv.id) as InvoiceBalance
    b.partPaid = b.paidCents > 0 && b.balanceCents > 0
    b.state = b.balanceCents === 0 ? 'paid' : today > b.dueOn ? 'overdue' : b.partPaid ? 'part' : 'open'
  }

  return { byId, credit: [...credit.values()] }
}

export const LEDGER_STATE_LABEL: Record<LedgerState, string> = {
  unsent: 'Not sent',
  open: 'Open',
  part: 'Part-paid',
  paid: 'Paid',
  overdue: 'Overdue',
  credited: 'Credited',
  void: 'Void',
}
