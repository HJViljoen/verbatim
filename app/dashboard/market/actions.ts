'use server'

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
  if (!(REC_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, message: 'Unknown status.' }
  }
  const { supabase, clientId } = await getSessionContext()

  // client_id is re-asserted here as well as by RLS: belt and braces on the one
  // table where a tenant can write at all.
  const { error } = await supabase
    .from('recommendations')
    .update({ status: status as RecStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('client_id', clientId)

  if (error) return { ok: false, message: `Could not save: ${error.message}` }

  // Both surfaces show it: the agenda list and the dashboard's top-
  // recommendation tile.
  revalidatePath('/dashboard/market')
  revalidatePath('/dashboard')
  return { ok: true, message: '' }
}
