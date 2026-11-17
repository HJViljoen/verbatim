import { sendAlertEmail } from '@/lib/email'
import { appBaseUrl } from '@/lib/site'
import type { createAdminClient } from '@/lib/supabase-admin'
import { noticeEmail, type Notice } from './daily'
import { issueDue, type Issued } from './issue'
import { check } from './load'
import { invoiceFromRow, paymentFromRow, profileFromRow } from './rows'
import type { BillingProfile, Invoice, Payment } from './types'
import { fetchApifyUsage } from './vendors/apify'
import { fetchUsdZar } from './vendors/fx'

// The daily job's reads and writes (inngest/functions/finance-daily.ts). I/O
// glue: the decisions are lib/finance/daily.ts and the modules it names.

type Admin = ReturnType<typeof createAdminClient>
type Row = Record<string, unknown>

export const COSTS_PATH = '/dashboard/ops/costs'

export async function activeProfiles(admin: Admin): Promise<BillingProfile[]> {
  return check<Row[]>('fin_billing_profiles', await admin.from('fin_billing_profiles').select('*').eq('active', true)).map(profileFromRow)
}

export async function allProfiles(admin: Admin): Promise<BillingProfile[]> {
  return check<Row[]>('fin_billing_profiles', await admin.from('fin_billing_profiles').select('*')).map(profileFromRow)
}

/** Each active profile's month, if today is its day. One profile's failure
 *  does not stop the others; it is returned for the operator's alert. */
export async function issueAll(admin: Admin, today: string): Promise<{ issued: Issued[]; failed: { profileId: string; error: string }[] }> {
  const issued: Issued[] = []
  const failed: { profileId: string; error: string }[] = []
  for (const p of await activeProfiles(admin)) {
    try {
      const r = await issueDue(admin, p, today)
      if (r) issued.push(r)
    } catch (e) {
      failed.push({ profileId: p.id, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return { issued, failed }
}

/** Invoices the job still has work on: printing, sending, holding. */
export async function unfinishedInvoices(admin: Admin): Promise<Invoice[]> {
  return check<Row[]>('fin_invoices', await admin
    .from('fin_invoices')
    .select('*')
    .in('status', ['draft', 'ready', 'sending'])
    .not('profile_id', 'is', null)
    .order('number')
    .limit(1000)).map(invoiceFromRow)
}

/** Every invoice and payment, for the nudges' ledger. */
export async function ledgerRows(admin: Admin): Promise<{ invoices: Invoice[]; payments: Payment[] }> {
  const [inv, pay] = await Promise.all([
    admin.from('fin_invoices').select('*').limit(1000),
    admin.from('fin_payments').select('*').limit(1000),
  ])
  return { invoices: check<Row[]>('fin_invoices', inv).map(invoiceFromRow), payments: check<Row[]>('fin_payments', pay).map(paymentFromRow) }
}

/** Claim each notice (insert, a duplicate ignored); the claimed ones come back. */
export async function claimNotices(admin: Admin, notices: readonly Notice[]): Promise<Notice[]> {
  if (notices.length === 0) return []
  const rows = check<Row[]>('fin_notices', await admin
    .from('fin_notices')
    .upsert(notices.map((n) => ({ invoice_id: n.invoiceId, kind: n.kind, on_day: n.onDay })), { onConflict: 'invoice_id,kind,on_day', ignoreDuplicates: true })
    .select('invoice_id, kind, on_day'))
  const won = new Set(rows.map((r) => `${r.invoice_id}|${r.kind}|${String(r.on_day).slice(0, 10)}`))
  return notices.filter((n) => won.has(`${n.invoiceId}|${n.kind}|${n.onDay}`))
}

async function unclaim(admin: Admin, notices: readonly Notice[]): Promise<void> {
  for (const n of notices) {
    await admin.from('fin_notices').delete().eq('invoice_id', n.invoiceId).eq('kind', n.kind).eq('on_day', n.onDay)
  }
}

/** Claim, then email the operator; an email that did not go gives the claims
 *  back, so tomorrow's run tries again. */
export async function tellOperator(admin: Admin, kind: 'hold' | 'nudge', notices: readonly Notice[]): Promise<{ told: number; sent: boolean }> {
  const claimed = await claimNotices(admin, notices)
  if (claimed.length === 0) return { told: 0, sent: false }
  const mail = noticeEmail(kind, claimed, `${appBaseUrl()}${COSTS_PATH}`)
  const { sent } = await sendAlertEmail(mail.subject, mail.text)
  if (!sent) await unclaim(admin, claimed)
  return { told: claimed.length, sent }
}

/** POST one of the finance admin routes with the ops key, as a step does.
 *  Never throws: a failure is an answer the run reports, and the next day's
 *  run tries again (a thrown step would stop every step after it). */
export async function callAdmin<T extends object>(path: string, body: unknown = {}): Promise<{ ok: boolean; status: number; json: Partial<T> & { error?: string } }> {
  try {
    const r = await fetch(`${appBaseUrl()}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': process.env.ADMIN_API_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '' },
      body: JSON.stringify(body),
    })
    const json = (await r.json().catch(() => ({}))) as Partial<T> & { error?: string }
    return { ok: r.ok, status: r.status, json }
  } catch (e) {
    return { ok: false, status: 0, json: { error: e instanceof Error ? e.message : String(e) } as Partial<T> & { error?: string } }
  }
}

/** The dollar's rate on the cost side, refreshed while cost_settings.fx_auto
 *  is on (the page's switch). Invoices keep their profile's fixed rate. */
export async function refreshFx(admin: Admin): Promise<{ skipped?: string; rate?: number; on?: string; error?: string }> {
  try {
    const s = check<Row | null>('cost_settings', await admin.from('cost_settings').select('fx_auto').eq('id', true).maybeSingle())
    if (s && s.fx_auto === false) return { skipped: 'set by hand' }
    const fx = await fetchUsdZar()
    const { error } = await admin.from('cost_settings')
      .upsert({ id: true, usd_zar: fx.rate, fx_on: fx.on, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) throw new Error(error.message)
    return { rate: fx.rate, on: fx.on }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/** Apify's own figure for this billing cycle (fin_vendor_usage). */
export async function syncApify(admin: Admin): Promise<{ skipped?: string; periodStart?: string; usd?: number; error?: string }> {
  const token = process.env.APIFY_TOKEN
  if (!token) return { skipped: 'no APIFY_TOKEN' }
  try {
    const u = await fetchApifyUsage(token)
    const { error } = await admin.from('fin_vendor_usage').upsert(
      { vendor: 'apify', period_start: u.periodStart, period_end: u.periodEnd, usd: u.usd, fetched_at: new Date().toISOString() },
      { onConflict: 'vendor,period_start' },
    )
    if (error) throw new Error(error.message)
    return { periodStart: u.periodStart, usd: u.usd }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
