import type { SupabaseClient } from '@supabase/supabase-js'

// DELETING AN ASK THREAD (5 Nov): FOR NOW, THE OPERATOR'S ALONE.
//
// WHY NOT THE TENANT'S. The monthly cap on questions (lib/ask/quota.ts) is
// counted on `agent_messages` rows with `role = 'user'`, and they go with the
// thread (`on delete cascade`), so a tenant who could delete a thread could
// reset its own spend limit. Migration 20260918099500 revoked DELETE on
// `agent_messages` from tenants for exactly that reason. Until a soft delete
// keeps the rows (a `deleted_at` on the thread, its own migration later), a
// thread is deleted by a platform operator only: a `platform_admins` row,
// read from the session (`SessionContext.operator`, lib/auth.ts, the check
// `mayBuildReports` makes), never from the request.
//
// THE SERVICE ROLE, BEHIND THIS CHECK. Tenant sessions hold SELECT only on
// both tables, so the rule below is the boundary, and the delete names the
// session's workspace beside the id: a thread of another workspace, or an id
// that names nothing, is "no longer here" and nothing is deleted. A document
// thread's plan check is its own record and stays.
//
// WHO DELETED WHAT. No table records it without a schema change: the one
// audit log that names a person (`config_changes`) is read by the reading
// layer as a change of ours to every view (lib/reading/comparability.ts
// `OUR_CHANGE_SURFACES` holds `other`), so a row there would cut charts. The
// delete is written to the server log instead, one structured line.

export const THREAD_DELETE_REFUSED = 'Only Verbatim can delete a thread for now.'
export const THREAD_GONE = 'That thread is no longer here.'
export const THREAD_DELETE_FAILED = 'Could not delete it just now. Try again, and tell us if it keeps happening.'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** May this session delete a thread? A platform operator's alone, for now.
 *  The page draws the control on this and the action decides again on it.
 *  Pure. */
export function mayDeleteThread(session: { operator: unknown }): boolean {
  return session.operator != null
}

export type DeleteThreadResult = { ok: true } | { ok: false; message: string }

/**
 * Delete one thread of the session's workspace, where the session may. `admin`
 * is the service-role client; `who` comes from the session, never the request.
 * Never throws.
 */
export async function deleteAgentThread(
  admin: SupabaseClient,
  who: { clientId: string; userId: string; operator: unknown },
  threadId: string,
): Promise<DeleteThreadResult> {
  if (!mayDeleteThread(who)) return { ok: false, message: THREAD_DELETE_REFUSED }
  if (!UUID.test(threadId)) return { ok: false, message: THREAD_GONE }
  const read = await admin.from('agent_threads').select('id, kind, created_at').eq('id', threadId).eq('client_id', who.clientId).maybeSingle()
  if (read.error) {
    console.error(`[agent] thread delete read failed: ${read.error.message}`)
    return { ok: false, message: THREAD_DELETE_FAILED }
  }
  const row = read.data as { id: string; kind: string; created_at: string } | null
  if (!row) return { ok: false, message: THREAD_GONE }
  const del = await admin.from('agent_threads').delete().eq('id', threadId).eq('client_id', who.clientId)
  if (del.error) {
    console.error(`[agent] thread delete failed: ${del.error.message}`)
    return { ok: false, message: THREAD_DELETE_FAILED }
  }
  console.info(`[agent] thread deleted ${JSON.stringify({ thread: row.id, kind: row.kind, createdAt: row.created_at, workspace: who.clientId, by: who.userId })}`)
  return { ok: true }
}
