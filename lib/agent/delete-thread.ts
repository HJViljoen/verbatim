import type { SupabaseClient } from '@supabase/supabase-js'

import { canManageTenant, type Role } from '../roles'

// DELETING AN ASK THREAD (5 Nov). The thread's author may delete their own;
// the workspace's owners and admins may delete any of its threads (an operator
// viewing a tenant arrives as its owner, lib/auth.ts `applyOperatorView`).
//
// THE SERVICE ROLE, BEHIND THIS CHECK. `agent_threads` and `agent_messages`
// grant a tenant's session SELECT only (migration 20260918099500): writes go
// through the service role behind a route or an action that decides who may,
// as every other Ask write does. So the rule below IS the boundary, and the
// delete names the session's own workspace beside the id: a thread of another
// workspace, or an id that names nothing, is "no longer here" and nothing is
// deleted. The messages go with the thread (`on delete cascade`). A document
// thread's plan check is its own record and stays.
//
// THE MONTH'S QUESTIONS STILL COUNT. The monthly cap is counted on
// `agent_messages` rows (lib/ask/quota.ts), and they go with the thread, so a
// deleted thread's questions stop counting toward the month. Keeping them
// counted needs somewhere to keep them, which is a schema change, and this
// package makes none: said in the report, not hidden.

export const THREAD_DELETE_REFUSED = 'Only the person who asked it, or an owner or admin of this workspace, can delete this.'
export const THREAD_GONE = 'That thread is no longer here.'
export const THREAD_DELETE_FAILED = 'Could not delete it just now. Try again, and tell us if it keeps happening.'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** May this reader delete this thread? Its author, or the workspace's owners
 *  and admins. A thread with no recorded author is an owner's or an admin's
 *  to delete. Pure. */
export function mayDeleteThread(a: { role: Role; userId: string | null; createdBy: string | null }): boolean {
  if (canManageTenant(a.role)) return true
  return Boolean(a.userId && a.createdBy && a.createdBy === a.userId)
}

export type DeleteThreadResult = { ok: true } | { ok: false; message: string }

/**
 * Delete one thread of the session's workspace, where the reader may. `admin`
 * is the service-role client; `who` comes from the session, never the request.
 * Never throws.
 */
export async function deleteAgentThread(
  admin: SupabaseClient,
  who: { clientId: string; userId: string; role: Role },
  threadId: string,
): Promise<DeleteThreadResult> {
  if (!UUID.test(threadId)) return { ok: false, message: THREAD_GONE }
  const read = await admin.from('agent_threads').select('id, created_by').eq('id', threadId).eq('client_id', who.clientId).maybeSingle()
  if (read.error) {
    console.error(`[agent] thread delete read failed: ${read.error.message}`)
    return { ok: false, message: THREAD_DELETE_FAILED }
  }
  const row = read.data as { id: string; created_by: string | null } | null
  if (!row) return { ok: false, message: THREAD_GONE }
  if (!mayDeleteThread({ role: who.role, userId: who.userId, createdBy: row.created_by })) return { ok: false, message: THREAD_DELETE_REFUSED }
  const del = await admin.from('agent_threads').delete().eq('id', threadId).eq('client_id', who.clientId)
  if (del.error) {
    console.error(`[agent] thread delete failed: ${del.error.message}`)
    return { ok: false, message: THREAD_DELETE_FAILED }
  }
  return { ok: true }
}

/** Whether the thread page draws the delete control: an owner or an admin
 *  without a read, else one read of the thread's author on the session's
 *  client (its SELECT policy pins the workspace). Never throws; a failed read
 *  draws no control. */
export async function threadDeletable(
  supabase: SupabaseClient,
  who: { clientId: string; userId: string; role: Role },
  threadId: string,
): Promise<boolean> {
  if (canManageTenant(who.role)) return true
  const { data, error } = await supabase.from('agent_threads').select('created_by').eq('id', threadId).eq('client_id', who.clientId).maybeSingle()
  if (error || !data) return false
  return mayDeleteThread({ role: who.role, userId: who.userId, createdBy: (data as { created_by: string | null }).created_by })
}
