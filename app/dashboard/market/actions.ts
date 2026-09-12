'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth'
import { REC_STATUSES, type RecStatus } from '@/lib/calibration'

// Moving a recommendation through its lifecycle — the write the `status`
// column has been granted for since 2026-08-18 and never received.
//
// No role check, deliberately. Settings writes are owner/admin because they
// move cost and quality knobs; this is a member saying "we did this one", which
// is the whole point of the 2026-08-18 grant ("a tenant member may only move a
// recommendation through its lifecycle"). The session client + RLS + the
// column-level grant are the gate: even a crafted POST reaches exactly one
// column on exactly one tenant's rows.

export interface RecStatusState {
  ok: boolean
  message: string
}

export async function setRecommendationStatus(id: string, status: string): Promise<RecStatusState> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: 'Unknown recommendation.' }
  if (!(REC_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, message: 'Unknown status.' }
  }
  const { supabase, clientId } = await getSessionContext()

  // `status` and nothing else. `updated_at` is on the table, but the grant that
  // has existed since 2026-08-18 covers `status` alone — writing both 403s on
  // today's database, and this action has to work on the schema that is
  // deployed, not the one the migration will bring.
  //
  // client_id is re-asserted as well as enforced by RLS: belt and braces on the
  // one table where a tenant can write at all.
  const { data, error } = await supabase
    .from('recommendations')
    .update({ status: status as RecStatus })
    .eq('id', id)
    .eq('client_id', clientId)
    .select('id')

  if (error) {
    // 'in_progress' joins the CHECK with 20260911140000_initiatives.sql. Until
    // that lands the database refuses it, and the reader deserves a sentence
    // rather than a constraint name.
    if (status === 'in_progress' && (error as { code?: string }).code === '23514') {
      return { ok: false, message: '“Working on it” isn’t available yet — mark it Acknowledged for now.' }
    }
    return { ok: false, message: `Could not save: ${error.message}` }
  }
  // An update that matched nothing is not a save. (A foreign or deleted id
  // reaches here as success with zero rows — RLS filters, it does not error.)
  if ((data ?? []).length === 0) return { ok: false, message: 'That recommendation is no longer here.' }

  // Both surfaces show it: the agenda list and the dashboard's top-
  // recommendation tile.
  revalidatePath('/dashboard/market')
  revalidatePath('/dashboard')
  return { ok: true, message: '' }
}
