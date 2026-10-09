'use server'

import { revalidatePath } from 'next/cache'
import { costsAdmin } from '@/lib/costs/access'
import { anchorDayOf, advanceDate, todayJhb } from '@/lib/costs/dates'
import { parseAmount } from '@/lib/costs/money'
import { parseBillForm, parsePlanForm, parseSettingsForm } from '@/lib/costs/forms'
import { billToRow, planToRow, settingsToRow } from '@/lib/costs/rows'
import { BILL_CADENCES, BILL_STATUSES, type BillCadence, type BillStatus } from '@/lib/costs/types'
import { createAdminClient } from '@/lib/supabase-admin'

// The Costs page's writes (operator only). Every action asks costsAdmin()
// first, because a server action is POST-reachable from any page whatever the
// page itself checked; a refusal says only "Not found.", as the page does.
// Writes go through the service role: the tables refuse every other session
// (supabase/migrations/20261108090000_costs.sql).

export interface CostsActionState {
  ok: boolean
  message: string
}

const PATH = '/dashboard/ops/costs'
const NOT_FOUND: CostsActionState = { ok: false, message: 'Not found.' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const idOf = (f: FormData, k = 'id'): string | null => {
  const v = String(f.get(k) ?? '').trim()
  return UUID.test(v) ? v : null
}

function failed(what: string, error: { message?: string } | null): CostsActionState {
  console.error(`costs: ${what}:`, error?.message)
  return { ok: false, message: `Could not ${what}. Try again.` }
}

const now = () => new Date().toISOString()

// ---- Bills -----------------------------------------------------------------------

/** Adds a bill (no id posted) or saves one (its id posted). */
export async function saveBill(_prev: CostsActionState, f: FormData): Promise<CostsActionState> {
  if (!(await costsAdmin())) return NOT_FOUND
  const parsed = parseBillForm(f)
  if (!parsed.ok) return parsed
  const id = idOf(f)
  const admin = createAdminClient()
  const row = { ...billToRow(parsed.value), updated_at: now() }
  const { error } = id
    ? await admin.from('cost_bills').update(row).eq('id', id)
    : await admin.from('cost_bills').insert(row)
  if (error) return failed('save the bill', error)
  revalidatePath(PATH)
  return { ok: true, message: id ? 'Saved.' : 'Bill added.' }
}

export async function deleteBill(_prev: CostsActionState, f: FormData): Promise<CostsActionState> {
  if (!(await costsAdmin())) return NOT_FOUND
  const id = idOf(f)
  if (!id) return { ok: false, message: 'No such bill.' }
  const { error } = await createAdminClient().from('cost_bills').delete().eq('id', id)
  if (error) return failed('delete the bill', error)
  revalidatePath(PATH)
  return { ok: true, message: 'Deleted.' }
}

/**
 * Marks the next charge paid: the date moves one cycle on, on the bill's
 * anchor day (31 Oct, 30 Nov, 31 Dec). The page posts the date, cadence and
 * anchor it showed, and the update only lands while the row still holds them,
 * so a double click or a second tab moves the date once. What a failed charge
 * left owing is not touched: that is settleOverdue.
 */
export async function markBillPaid(_prev: CostsActionState, f: FormData): Promise<CostsActionState> {
  if (!(await costsAdmin())) return NOT_FOUND
  const id = idOf(f)
  const from = String(f.get('from') ?? '')
  const cadence = String(f.get('cadence') ?? '') as BillCadence
  const rawAnchor = String(f.get('anchor') ?? '').trim()
  const shownAnchor = rawAnchor === '' ? null : Number(rawAnchor)
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !BILL_CADENCES.includes(cadence)
      || (shownAnchor !== null && !(Number.isInteger(shownAnchor) && shownAnchor >= 1 && shownAnchor <= 31))) {
    return { ok: false, message: 'Nothing to mark paid.' }
  }
  const anchor = anchorDayOf(from, shownAnchor)
  const next = advanceDate(from, cadence, anchor)
  const query = createAdminClient()
    .from('cost_bills')
    .update({ next_charge_on: next, anchor_day: anchor, last_paid_on: todayJhb(new Date()), updated_at: now() })
    .eq('id', id)
    .eq('next_charge_on', from)
    .eq('cadence', cadence)
  const { data, error } = await (shownAnchor === null ? query.is('anchor_day', null) : query.eq('anchor_day', shownAnchor)).select('id')
  if (error) return failed('mark it paid', error)
  revalidatePath(PATH)
  if (!data || data.length === 0) return { ok: false, message: 'Already moved on. Reload to see it.' }
  return { ok: true, message: `Paid. Next charge ${next}.` }
}

/**
 * Settles what a failed charge left owing: the overdue amount goes to 0 and a
 * failing bill is active again. The next charge date stays where it is (Mark
 * paid moves that). A bill on watch, paused or ended keeps its status, so
 * settling an ended bill's last debt does not put it back in the forecast.
 * The page posts the status it showed, and the update only lands while the
 * row still holds it and still owes, so a double click settles once.
 */
export async function settleOverdue(_prev: CostsActionState, f: FormData): Promise<CostsActionState> {
  if (!(await costsAdmin())) return NOT_FOUND
  const id = idOf(f)
  const status = String(f.get('status') ?? '') as BillStatus
  if (!id || !BILL_STATUSES.includes(status)) return { ok: false, message: 'Nothing to settle.' }
  const { data, error } = await createAdminClient()
    .from('cost_bills')
    .update({ overdue_amount: 0, status: status === 'failing' ? 'active' : status, updated_at: now() })
    .eq('id', id)
    .eq('status', status)
    .gt('overdue_amount', 0)
    .select('id')
  if (error) return failed('settle it', error)
  revalidatePath(PATH)
  if (!data || data.length === 0) return { ok: false, message: 'Already settled. Reload to see it.' }
  return { ok: true, message: 'Settled.' }
}

// ---- Clients and prospects -------------------------------------------------------

/**
 * Saves a client's plan or a prospect. A client's row is keyed on the client,
 * so the first save creates it and later ones update it; a prospect is
 * created with no id and updated by its id.
 */
export async function savePlan(_prev: CostsActionState, f: FormData): Promise<CostsActionState> {
  if (!(await costsAdmin())) return NOT_FOUND
  const prospect = f.get('kind') === 'prospect'
  const parsed = parsePlanForm(f, { prospect })
  if (!parsed.ok) return parsed
  const admin = createAdminClient()
  const row = { ...planToRow(parsed.value), updated_at: now() }
  if (prospect) {
    const id = idOf(f)
    const { error } = id
      ? await admin.from('cost_client_plans').update(row).eq('id', id).is('client_id', null)
      : await admin.from('cost_client_plans').insert({ ...row, client_id: null })
    if (error) return failed('save the prospect', error)
  } else {
    const clientId = idOf(f, 'clientId')
    if (!clientId) return { ok: false, message: 'No such client.' }
    const { error } = await admin
      .from('cost_client_plans')
      .upsert({ ...row, client_id: clientId, name: null }, { onConflict: 'client_id' })
    if (error) return failed('save the plan', error)
  }
  revalidatePath(PATH)
  return { ok: true, message: 'Saved.' }
}

/** Removes a prospect, or a client's plan (the client then plans from what the
 *  app knows: no price until one is set). */
export async function deletePlan(_prev: CostsActionState, f: FormData): Promise<CostsActionState> {
  if (!(await costsAdmin())) return NOT_FOUND
  const id = idOf(f)
  if (!id) return { ok: false, message: 'Nothing to remove.' }
  const { error } = await createAdminClient().from('cost_client_plans').delete().eq('id', id)
  if (error) return failed('remove it', error)
  revalidatePath(PATH)
  return { ok: true, message: 'Removed.' }
}

// ---- Assumptions -----------------------------------------------------------------

export async function saveSettings(_prev: CostsActionState, f: FormData): Promise<CostsActionState> {
  if (!(await costsAdmin())) return NOT_FOUND
  const parsed = parseSettingsForm(f)
  if (!parsed.ok) return parsed
  const { error } = await createAdminClient()
    .from('cost_settings')
    .upsert({ id: true, ...settingsToRow(parsed.value), updated_at: now() }, { onConflict: 'id' })
  if (error) return failed('save the assumptions', error)
  revalidatePath(PATH)
  return { ok: true, message: 'Saved.' }
}

/** The OpenAI balance as read on platform.openai.com, and the day. */
export async function saveOpenaiBalance(_prev: CostsActionState, f: FormData): Promise<CostsActionState> {
  if (!(await costsAdmin())) return NOT_FOUND
  const balance = parseAmount(f.get('openaiBalanceUsd'))
  const on = String(f.get('openaiBalanceOn') ?? '').trim()
  if (balance === null || Number.isNaN(balance) || balance > 100_000) return { ok: false, message: 'Enter the balance in dollars, like 12.40.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || Number.isNaN(Date.parse(`${on}T00:00:00Z`))) return { ok: false, message: 'Enter the day you read it.' }
  const { error } = await createAdminClient()
    .from('cost_settings')
    .upsert({ id: true, openai_balance_usd: Math.round(balance * 100) / 100, openai_balance_on: on, updated_at: now() }, { onConflict: 'id' })
  if (error) return failed('save the balance', error)
  revalidatePath(PATH)
  return { ok: true, message: 'Saved.' }
}

const TOGGLES = { countShared: 'count_shared', countProspects: 'count_prospects' } as const

/** Flips one of the forecast's two switches. */
export async function setToggle(_prev: CostsActionState, f: FormData): Promise<CostsActionState> {
  if (!(await costsAdmin())) return NOT_FOUND
  const key = String(f.get('key') ?? '') as keyof typeof TOGGLES
  if (!(key in TOGGLES)) return { ok: false, message: 'No such switch.' }
  const { error } = await createAdminClient()
    .from('cost_settings')
    .upsert({ id: true, [TOGGLES[key]]: f.get('value') === 'true', updated_at: now() }, { onConflict: 'id' })
  if (error) return failed('change it', error)
  revalidatePath(PATH)
  return { ok: true, message: '' }
}
