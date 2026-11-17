import type { createAdminClient } from '@/lib/supabase-admin'
import { invoiceFromRow, issuerFromRow, paymentFromRow, profileFromRow } from './rows'
import type { BillingProfile, Invoice, Issuer, Payment } from './types'

// What the finance code reads, through the service role (the tables refuse
// every other session). The caller has already checked the operator or the
// admin key. I/O glue only: every figure is decided by the pure modules
// beside this one.
//
// NO READ HERE CAN MEET THE 1000-ROW CAP (AGENTS.md): a client is invoiced
// about twelve times a year, so the invoices and payments are tens of rows for
// years yet. `.limit(1000)` is written out so the day that stops being true is
// a visible cap, not a silent one.

type Admin = ReturnType<typeof createAdminClient>
type Row = Record<string, unknown>

/** The finance migration has not been applied: callers say so instead of failing. */
export class FinanceTablesMissing extends Error {}

const MISSING = new Set(['42P01', 'PGRST205', 'PGRST202', '42883', '42703'])

export function check<T>(label: string, res: { data: T | null; error: { code?: string; message?: string } | null }): T {
  if (res.error) {
    if (res.error.code && MISSING.has(res.error.code)) throw new FinanceTablesMissing(label)
    throw new Error(`finance: ${label}: ${res.error.message ?? res.error.code}`)
  }
  return res.data as T
}

export interface FinanceData {
  issuer: Issuer | null
  profiles: BillingProfile[]
  invoices: Invoice[]
  payments: Payment[]
}

export async function loadFinance(admin: Admin): Promise<FinanceData> {
  const [issuerRes, profilesRes, invoicesRes, paymentsRes] = await Promise.all([
    admin.from('fin_issuer').select('*').eq('id', true).maybeSingle(),
    admin.from('fin_billing_profiles').select('*').order('created_at'),
    admin.from('fin_invoices').select('*').order('issued_on', { ascending: false }).order('number', { ascending: false }).limit(1000),
    admin.from('fin_payments').select('*').order('received_on', { ascending: false }).limit(1000),
  ])
  return {
    issuer: issuerFromRow(check<Row | null>('fin_issuer', issuerRes)),
    profiles: check<Row[]>('fin_billing_profiles', profilesRes).map(profileFromRow),
    invoices: check<Row[]>('fin_invoices', invoicesRes).map(invoiceFromRow),
    payments: check<Row[]>('fin_payments', paymentsRes).map(paymentFromRow),
  }
}

export interface InvoiceContext {
  invoice: Invoice
  issuer: Issuer
  /** The invoice this one replaces, or the one a credit note cancels. */
  related: Invoice | null
  /** A credit note: the invoice that replaced the one it cancels. */
  replacement: Invoice | null
  profile: BillingProfile | null
  /** The newest month its profile has a live invoice for: the invoice a
   *  profile's hold is holding (lib/finance/send.ts clears the hold only
   *  when that one is sent). */
  profileNewestPeriod: string | null
}

/** One invoice and everything its page and its email print. Null when there
 *  is no such invoice. Throws when the issuer row is missing: no invoice can
 *  be printed without who issues it. */
export async function loadInvoiceContext(admin: Admin, id: string): Promise<InvoiceContext | null> {
  const [invRes, issuerRes] = await Promise.all([
    admin.from('fin_invoices').select('*').eq('id', id).maybeSingle(),
    admin.from('fin_issuer').select('*').eq('id', true).maybeSingle(),
  ])
  const row = check<Row | null>('fin_invoices', invRes)
  if (!row) return null
  const invoice = invoiceFromRow(row)
  const issuer = issuerFromRow(check<Row | null>('fin_issuer', issuerRes))
  if (!issuer) throw new Error('finance: no issuer row (fin_issuer); run scripts/finance-backfill.ts')

  const [relatedRes, replacementRes, profileRes, newestRes] = await Promise.all([
    invoice.relatesTo ? admin.from('fin_invoices').select('*').eq('id', invoice.relatesTo).maybeSingle() : Promise.resolve(null),
    invoice.kind === 'credit_note' && invoice.relatesTo
      ? admin.from('fin_invoices').select('*').eq('relates_to', invoice.relatesTo).eq('kind', 'invoice').neq('status', 'void').limit(1).maybeSingle()
      : Promise.resolve(null),
    invoice.profileId ? admin.from('fin_billing_profiles').select('*').eq('id', invoice.profileId).maybeSingle() : Promise.resolve(null),
    invoice.profileId
      ? admin.from('fin_invoices').select('period_start').eq('profile_id', invoice.profileId).eq('kind', 'invoice')
        .not('period_start', 'is', null).not('status', 'in', '(credited,void)').order('period_start', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve(null),
  ])
  const rel = relatedRes ? check<Row | null>('fin_invoices', relatedRes) : null
  const rep = replacementRes ? check<Row | null>('fin_invoices', replacementRes) : null
  const prof = profileRes ? check<Row | null>('fin_billing_profiles', profileRes) : null
  const newest = newestRes ? check<Row | null>('fin_invoices', newestRes) : null
  return {
    invoice,
    issuer,
    related: rel ? invoiceFromRow(rel) : null,
    replacement: rep ? invoiceFromRow(rep) : null,
    profile: prof ? profileFromRow(prof) : null,
    profileNewestPeriod: newest?.period_start ? String(newest.period_start).slice(0, 10) : null,
  }
}
