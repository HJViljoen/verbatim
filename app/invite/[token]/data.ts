import { createAdminClient } from '@/lib/supabase-admin'

// Server-only helper (no 'use server' — not a client-callable action). Shared by
// the invite page and the accept action.

export interface Invitation {
  id: string
  client_id: string
  email: string
  role: 'owner' | 'admin' | 'member'
  status: string
  expires_at: string
}

// Loads a pending, unexpired invitation by token using the service role (the
// invitations table is not anon/cross-tenant readable via RLS). Returns null +
// a reason string for any invalid state.
export async function loadInvite(
  token: string,
): Promise<{ invite: Invitation | null; reason: string }> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('invitations')
    .select('id, client_id, email, role, status, expires_at')
    .eq('token', token)
    .maybeSingle()

  const invite = data as Invitation | null
  if (!invite) return { invite: null, reason: 'This invite link is invalid.' }
  if (invite.status === 'accepted') return { invite: null, reason: 'This invite has already been used.' }
  if (invite.status === 'revoked') return { invite: null, reason: 'This invite has been revoked.' }
  if (new Date(invite.expires_at) < new Date()) return { invite: null, reason: 'This invite has expired.' }
  return { invite, reason: '' }
}
