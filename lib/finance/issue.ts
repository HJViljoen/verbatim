import type { createAdminClient } from '@/lib/supabase-admin'
import { check } from './load'
import { IN_ADVANCE_NOTE, priceMonth } from './money'
import { nextBillablePeriod, type BillableMonth } from './periods'
import { linesToJson } from './rows'
import type { BillingProfile } from './types'

// Issuing a month's invoice (the daily job's 'issue' step; nothing else
// issues one). The pure part decides the month and the lines; the database
// takes the number and inserts in one transaction (fin_issue_invoice), so a
// month already billed answers with its invoice and no number is burned. Run
// twice for one day, it makes one invoice.

type Admin = ReturnType<typeof createAdminClient>

/** fin_issue_invoice's arguments for a month (pure). */
export function issueArgs(profile: BillingProfile, month: BillableMonth): Record<string, unknown> {
  const priced = priceMonth(profile)
  return {
    p_profile_id: profile.id,
    p_period_start: month.periodStart,
    p_period_label: month.periodLabel,
    p_issued_on: month.issuedOn,
    p_due_on: month.dueOn,
    p_lines: linesToJson(priced.lines),
    p_total: priced.total,
    p_fx_note: priced.fxNote,
    p_note: profile.dueRule === 'end_of_prev_month' ? IN_ADVANCE_NOTE : null,
  }
}

export interface Issued {
  invoiceId: string
  number: string
  /** False when the month was billed already: this is that invoice. */
  created: boolean
  periodStart: string
}

/** The months a client already has a live invoice for (credited and void
 *  ones give their month back). */
export async function billedPeriods(admin: Admin, clientId: string): Promise<string[]> {
  const rows = check<{ period_start: string | null }[]>('fin_invoices', await admin
    .from('fin_invoices')
    .select('period_start')
    .eq('client_id', clientId)
    .eq('kind', 'invoice')
    .not('period_start', 'is', null)
    .not('status', 'in', '(credited,void)')
    .limit(1000))
  return rows.flatMap((r) => (r.period_start ? [String(r.period_start).slice(0, 10)] : []))
}

/** Issue the profile's next month if today is its day. Null when nothing is due. */
export async function issueDue(admin: Admin, profile: BillingProfile, today: string): Promise<Issued | null> {
  const month = nextBillablePeriod(profile, await billedPeriods(admin, profile.clientId), today)
  if (!month) return null
  const rows = check<{ invoice_id: string; invoice_number: string; created: boolean }[]>(
    'fin_issue_invoice',
    await admin.rpc('fin_issue_invoice', issueArgs(profile, month)),
  )
  const r = rows[0]
  if (!r) throw new Error(`finance: fin_issue_invoice returned nothing for ${month.periodLabel}`)
  return { invoiceId: String(r.invoice_id), number: String(r.invoice_number), created: Boolean(r.created), periodStart: month.periodStart }
}
