import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from './supabase-server'

export type Role = 'owner' | 'admin' | 'member'

export interface SessionContext {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
  userId: string
  email?: string
  clientId: string
  role: Role
}

// Single source of truth for "who is this request, and which tenant/role".
// Resolves the signed-in user + their tenant membership in one place so pages
// and server actions don't each re-implement the auth + profile lookup. The
// returned `supabase` is the user's session client — every read through it is
// RLS-enforced.
//
// Redirects to /login when unauthenticated or when the account has no
// membership row yet. A dedicated no-workspace/onboarding flow lands in Phase 5;
// until then this can't trigger (the only accounts that exist have memberships).
export async function getSessionContext(): Promise<SessionContext> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('client_id, role').eq('id', user.id).single()
  if (!profile) redirect('/login')

  return {
    supabase,
    userId: user.id,
    email: user.email,
    clientId: profile.client_id as string,
    role: profile.role as Role,
  }
}

// Tenant-level write/admin gate (settings, schedule, member management).
// Platform superadmins provision/manage tenants via the service role rather
// than the tenant UI, so they're intentionally not folded in here.
export function canManageTenant(role: Role): boolean {
  return role === 'owner' || role === 'admin'
}
