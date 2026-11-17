'use server'

import { revalidatePath } from 'next/cache'
import { costsAdmin } from '@/lib/costs/access'
import { todayJhb } from '@/lib/costs/dates'
import { callAdmin } from '@/lib/finance/daily-io'
import { parseExpectedForm, parsePaymentForm, parseProfileForm } from '@/lib/finance/forms'
import { profileToRow } from '@/lib/finance/rows'
import { sendInvoice, supabaseSendPort } from '@/lib/finance/send'
import { createAdminClient } from '@/lib/supabase-admin'
import type { CostsActionState } from './actions'

// The Money in writes (operator only). Every action asks costsAdmin() first,
// because a server action is POST-reachable from any page whatever the page
// itself checked; a refusal says only "Not found.", as the page does. Writes
// go through the service role: the finance tables refuse every other session
// (supabase/migrations/20261115090000_finance.sql).
//
// Printing goes through the render route (Chromium runs there, with its
// tracing entry), fetched with the ops key; sending runs here, because it
// only reads the printed PDF back from storage.

const PATH = '/dashboard/ops/costs'
const NOT_FOUND: CostsActionState = { ok: false, message: 'Not found.' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const idOf = (f: FormData, k = 'id'): string | null => {
  const v = String(f.get(k) ?? '').trim()
  return UUID.test(v) ? v : null
}

function failed(what: string, error: { message?: string } | null): CostsActionState {
  console.error(`finance: ${what}:`, error?.message)
  return { ok: false, message: `Could not ${what}. Try again.` }
}

const now = () => new Date().toISOString()

// ---- Payments ----------------------------------------------------------------

export async function recordPayment(_prev: CostsActionState, f: FormData): Promise<CostsActionState> {
  if (!(await costsAdmin())) return NOT_FOUND
  const parsed = parsePaymentForm(f, todayJhb(new Date()))
  if (!parsed.ok) return parsed
  const p = parsed.value
  const { error } = await createAdminClient().from('fin_payments').insert({
    client_id: p.clientId, received_on: p.receivedOn, amount: p.amount, currency: p.currency, reference: p.reference, note: p.note,
  })
  if (error) return failed('record the payment', error)
  revalidatePath(PATH)
  return { ok: true, message: 'Recorded. It is applied to the oldest invoice first.' }
}

export async function deletePayment(_prev: CostsActionState, f: FormData): Promise<CostsActionState> {
  if (!(await costsAdmin())) return NOT_FOUND
  const id = idOf(f)
  if (!id) return { ok: false, message: 'No such payment.' }
  const { error } = await createAdminClient().from('fin_payments').delete().eq('id', id)
  if (error) return failed('delete the payment', error)
  revalidatePath(PATH)
  return { ok: true, message: 'Deleted.' }
}

// ---- Invoices ----------------------------------------------------------------

/** The day the client said it will pay (blank clears it). */
export async function setExpected(_prev: CostsActionState, f: FormData): Promise<CostsActionState> {
  if (!(await costsAdmin())) return NOT_FOUND
  const id = idOf(f)
  if (!id) return { ok: false, message: 'No such invoice.' }
  const parsed = parseExpectedForm(f)
  if (!parsed.ok) return parsed
  const { error } = await createAdminClient()
    .from('fin_invoices')
    .update({ expected_on: parsed.value.expectedOn, updated_at: now() })
    .eq('id', id)
    .eq('kind', 'invoice')
  if (error) return failed('save the date', error)
  revalidatePath(PATH)
  return { ok: true, message: parsed.value.expectedOn ? 'Saved.' : 'Cleared.' }
}

/** Print (or print again) a draft or ready invoice's PDF. */
export async function printInvoice(_prev: CostsActionState, f: FormData): Promise<CostsActionState> {
  if (!(await costsAdmin())) return NOT_FOUND
  const id = idOf(f)
  if (!id) return { ok: false, message: 'No such invoice.' }
  const r = await callAdmin<{ pages?: number }>(`/api/admin/finance/invoices/${id}/render`)
  revalidatePath(PATH)
  return r.ok ? { ok: true, message: 'Printed.' } : { ok: false, message: r.json.error ?? `Could not print it (${r.status}).` }
}

/** Send it to the client (the page's Send, after it asked). An invoice that
 *  may already have gone is sent again only when the form says the operator
 *  checked the Bcc copy and confirmed (`confirmUnsure`). */
export async function sendInvoiceNow(_prev: CostsActionState, f: FormData): Promise<CostsActionState> {
  if (!(await costsAdmin())) return NOT_FOUND
  const id = idOf(f)
  if (!id) return { ok: false, message: 'No such invoice.' }
  const r = await sendInvoice(supabaseSendPort(createAdminClient()), id, { confirmUnsure: f.get('confirmUnsure') === '1' })
  revalidatePath(PATH)
  return { ok: r.ok, message: r.message }
}

/** The same email and PDF to ALERT_EMAIL alone. Changes nothing. */
export async function sendInvoiceTest(_prev: CostsActionState, f: FormData): Promise<CostsActionState> {
  if (!(await costsAdmin())) return NOT_FOUND
  const id = idOf(f)
  if (!id) return { ok: false, message: 'No such invoice.' }
  const r = await sendInvoice(supabaseSendPort(createAdminClient()), id, { test: true })
  return { ok: r.ok, message: r.message }
}

// ---- Billing profiles --------------------------------------------------------

export async function saveProfile(_prev: CostsActionState, f: FormData): Promise<CostsActionState> {
  if (!(await costsAdmin())) return NOT_FOUND
  const id = idOf(f)
  if (!id) return { ok: false, message: 'No such billing profile.' }
  const parsed = parseProfileForm(f)
  if (!parsed.ok) return parsed
  const { error } = await createAdminClient()
    .from('fin_billing_profiles')
    .update({ ...profileToRow(parsed.value), updated_at: now() })
    .eq('id', id)
  if (error) return failed('save the billing profile', error)
  revalidatePath(PATH)
  return { ok: true, message: 'Saved.' }
}

/** Hold the next invoice for a tap, or let it send itself. */
export async function setHold(_prev: CostsActionState, f: FormData): Promise<CostsActionState> {
  if (!(await costsAdmin())) return NOT_FOUND
  const id = idOf(f)
  if (!id) return { ok: false, message: 'No such billing profile.' }
  const { error } = await createAdminClient()
    .from('fin_billing_profiles')
    .update({ hold_next: f.get('value') === 'true', updated_at: now() })
    .eq('id', id)
  if (error) return failed('change it', error)
  revalidatePath(PATH)
  return { ok: true, message: '' }
}
