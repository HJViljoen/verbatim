'use server'

import { revalidatePath } from 'next/cache'
import { todayJhb } from '@/lib/costs/dates'
import { loanAdmin } from '@/lib/family-loan/access'
import { parseEntryForm } from '@/lib/family-loan/forms'
import { entryToRow } from '@/lib/family-loan/rows'
import { createAdminClient } from '@/lib/supabase-admin'

// The loan page's writes (operator only). Every action asks loanAdmin() first,
// because a server action is POST-reachable from any page whatever the page
// itself checked; a refusal says only "Not found.", as the page does. Writes
// go through the service role: the table refuses every other session
// (supabase/migrations/20261111090000_family_loan.sql).

export interface LoanActionState {
  ok: boolean
  message: string
}

const PATH = '/dashboard/ops/loan'
const TABLE = 'family_loan_entries'
const NOT_FOUND: LoanActionState = { ok: false, message: 'Not found.' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const idOf = (f: FormData): string | null => {
  const v = String(f.get('id') ?? '').trim()
  return UUID.test(v) ? v : null
}

function failed(what: string, error: { message?: string } | null): LoanActionState {
  console.error(`family loan: ${what}:`, error?.message)
  return { ok: false, message: `Could not ${what}. Try again.` }
}

/** Adds an entry (no id posted) or saves one (its id posted). An edit names
 *  the row it changes and says so when the row has gone. */
export async function saveEntry(_prev: LoanActionState, f: FormData): Promise<LoanActionState> {
  if (!(await loanAdmin())) return NOT_FOUND
  const parsed = parseEntryForm(f, todayJhb(new Date()))
  if (!parsed.ok) return parsed
  const editing = f.has('id')
  const id = idOf(f)
  if (editing && !id) return { ok: false, message: 'No such entry.' }
  const admin = createAdminClient()
  const row = entryToRow(parsed.value)
  if (!id) {
    const { error } = await admin.from(TABLE).insert(row)
    if (error) return failed('add the entry', error)
    revalidatePath(PATH)
    return { ok: true, message: 'Added.' }
  }
  const { data, error } = await admin.from(TABLE).update(row).eq('id', id).select('id')
  if (error) return failed('save the entry', error)
  revalidatePath(PATH)
  if (!data || data.length === 0) return { ok: false, message: 'That entry has gone. Reload to see the list.' }
  return { ok: true, message: 'Saved.' }
}

export async function deleteEntry(_prev: LoanActionState, f: FormData): Promise<LoanActionState> {
  if (!(await loanAdmin())) return NOT_FOUND
  const id = idOf(f)
  if (!id) return { ok: false, message: 'No such entry.' }
  const { error } = await createAdminClient().from(TABLE).delete().eq('id', id)
  if (error) return failed('delete the entry', error)
  revalidatePath(PATH)
  return { ok: true, message: 'Deleted.' }
}
