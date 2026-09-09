import { createAdminClient } from './supabase-admin'

// The operator "currently viewing" cookie. httpOnly, set only by the switch
// server action, and read only in lib/auth.ts — where it is honoured ONLY for
// users in `platform_admins`. For everybody else the cookie is inert: a forged
// value changes nothing, because the check that consults it fails closed
// (lib/agent/access.ts isPlatformAdmin) before the value is ever looked at.
export const WORKSPACE_COOKIE = 'vb_workspace'

export type WorkspaceRow = {
  id: string
  company_name: string
  plan: string
  is_active: boolean
}

// Canonical 8-4-4-4-12 hex. Deliberately strict: the cookie is attacker-
// controlled input that ends up in a PostgREST filter, and a value that is not
// a uuid can never name a client, so it is cheaper to reject it here than to
// ask the database about it. Case-insensitive because Postgres compares uuids
// by value, not by spelling; the result is normalised to lower case so the
// "is this the one I'm viewing?" comparison in the UI is a plain string test.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseWorkspaceCookie(v: string | undefined): string | null {
  if (!v) return null
  const trimmed = v.trim()
  return UUID.test(trimmed) ? trimmed.toLowerCase() : null
}

// Every tenant, for the operator switcher. Service role by necessity: RLS keys
// every clients policy on the caller's own users.client_id, so the session
// client can only ever see one row — the one the operator is trying to leave.
// The only caller path is gated on platform_admins.
export async function listWorkspaces(): Promise<WorkspaceRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clients')
    .select('id, company_name, plan, is_active')
    .order('company_name')
  // Fail closed, like isPlatformAdmin: an unreadable clients table yields an
  // empty switcher, not a broken page.
  if (error) return []
  return (data ?? []) as WorkspaceRow[]
}
