import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from './supabase-server'
import { createAdminClient } from './supabase-admin'
import { isPlatformAdmin } from './agent/access'
import { WORKSPACE_COOKIE, parseWorkspaceCookie } from './workspaces'
import type { User } from '@supabase/supabase-js'

export type Role = 'owner' | 'admin' | 'member'

// Most-privileged first. Used for select options and validation.
export const ROLES: readonly Role[] = ['owner', 'admin', 'member'] as const

// What a platform admin is currently looking at. Null for every other user —
// the field's presence is also what the UI keys the switcher off, so a normal
// tenant user can't so much as see that this exists.
export interface OperatorView {
  /** The operator's OWN tenant, from their users row (Össur for Heinrich). */
  homeClientId: string
  /** The tenant this request acts on — equal to SessionContext.clientId. */
  viewingClientId: string
  /** clients.company_name of the viewed tenant, for the switcher label. */
  viewingName: string
  /** Viewing their own tenant, i.e. no override in effect. */
  isHome: boolean
}

export interface SessionContext {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>> | ReturnType<typeof createAdminClient>
  userId: string
  email?: string
  clientId: string
  role: Role
  operator: OperatorView | null
}

// Who is this request, verified — WITHOUT a round-trip to the Auth server.
// The project signs JWTs with an asymmetric key (ES256), so getClaims()
// verifies the cookie's access token locally against the JWKS (a module-level
// cache, 10-min TTL; the discovery endpoint is edge-cached for cold
// instances). getUser() by contrast is a network call to /auth/v1/user on
// EVERY invocation — and the layout, the page and the proxy each made one,
// serially, on every navigation. Only the session-refresh path touches the
// network now (and it must: that is what rotates the cookie).
//
// React cache(): the dashboard layout and every page both resolve the session,
// in the same request — without this each resolved it independently (two JWT
// checks, two `users` lookups). Cached per server request; server actions and
// route handlers get their own scope.
const resolveIdentity = cache(async () => {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) return { supabase, userId: null as string | null, email: undefined as string | undefined }
  return { supabase, userId: data.claims.sub as string, email: data.claims.email as string | undefined }
})

// The tenant membership for a verified user — one `users` lookup per request
// (this is the query every page used to repeat, and it is the first DB hit of
// a cold request, so it is also the one that pays the pool wake-up).
const resolveMembership = cache(async (userId: string) => {
  const { supabase } = await resolveIdentity()
  const { data: profile } = await supabase
    .from('users').select('client_id, role').eq('id', userId).maybeSingle()
  return profile as { client_id: string; role: Role } | null
})

// The operator override, resolved once per request.
//
// This supersedes the note further down that platform superadmins "are
// intentionally not folded in here": they now are, but only through this one
// door. Two facts have to line up before anything changes — the user is a row
// in `platform_admins`, AND a `vb_workspace` cookie names a client that
// exists. isPlatformAdmin fails closed, so a forged cookie on any other
// account resolves to null and the session is exactly what it was before.
//
// The membership lookup runs on every authenticated request (one indexed hit
// on a one-row table) rather than only when the cookie is present, because the
// switcher has to render for the operator BEFORE they have ever switched.
const resolveOperatorView = cache(async (
  userId: string,
  homeClientId: string,
): Promise<OperatorView | null> => {
  if (!(await isPlatformAdmin(userId))) return null

  const cookieStore = await cookies()
  const requested = parseWorkspaceCookie(cookieStore.get(WORKSPACE_COOKIE)?.value)

  // Service role: RLS scopes `clients` to the caller's own tenant, so the
  // session client cannot read the row the operator wants to move to.
  const admin = createAdminClient()
  const lookup = async (id: string) => {
    const { data } = await admin
      .from('clients').select('id, company_name').eq('id', id).maybeSingle()
    return data as { id: string; company_name: string } | null
  }

  // A cookie naming a client that no longer exists (deleted tenant, hand-typed
  // value) falls back to the operator's own workspace rather than erroring —
  // the failure mode of a stale cookie should be "you're home", not a 500.
  const viewing = (requested && requested !== homeClientId ? await lookup(requested) : null)
    ?? await lookup(homeClientId)
  if (!viewing) return null

  return {
    homeClientId,
    viewingClientId: viewing.id,
    viewingName: viewing.company_name,
    isHome: viewing.id === homeClientId,
  }
})

// Just the signed-in auth identity — no tenant membership required. Used by the
// onboarding flow, which runs *before* a user has a workspace (so it can't use
// getSessionContext, which would bounce a membership-less user back to it).
// Redirects to /login when unauthenticated.
export async function requireUser(): Promise<{
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
  user: User
}> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return { supabase, user }
}

// Folds the operator override into a resolved session. Shared by
// getSessionContext and getRouteSession so a page and the route handler it
// calls can never disagree about which tenant the request is acting on.
//
// While viewing someone else's tenant the client swaps to the service role and
// the role becomes 'owner'. Both are deliberate (plan 2026-09-09): RLS keys
// every tenant-data policy on the caller's own users.client_id, so the session
// client would read nothing at all over there, and anything below owner would
// hide controls the operator is there to use. Identity — userId, email — stays
// the real person's, so writes are still attributed to them.
async function applyOperatorView(args: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
  userId: string
  email?: string
  profile: { client_id: string; role: Role }
}): Promise<SessionContext> {
  const { supabase, userId, email, profile } = args
  const operator = await resolveOperatorView(userId, profile.client_id)
  const viewingElsewhere = operator !== null && !operator.isHome
  return {
    supabase: viewingElsewhere ? createAdminClient() : supabase,
    userId,
    email,
    clientId: viewingElsewhere ? operator.viewingClientId : profile.client_id,
    role: viewingElsewhere ? 'owner' : profile.role,
    operator,
  }
}

// Single source of truth for "who is this request, and which tenant/role".
// Resolves the signed-in user + their tenant membership in one place so pages
// and server actions don't each re-implement the auth + profile lookup. The
// returned `supabase` is the user's session client — every read through it is
// RLS-enforced.
//
// Redirects to /login when unauthenticated, or to /onboarding when the account
// is signed in but has no membership row yet (freshly signed-up, or an invite
// that was abandoned mid-accept). Onboarding provisions the workspace + owner
// membership, after which this resolves normally.
export async function getSessionContext(): Promise<SessionContext> {
  const { supabase, userId, email } = await resolveIdentity()
  if (!userId) redirect('/login')

  const profile = await resolveMembership(userId)
  if (!profile) redirect('/onboarding')

  return applyOperatorView({ supabase, userId, email, profile })
}

/** The same resolution as getSessionContext, but for ROUTE HANDLERS.
 *
 *  getSessionContext calls redirect(), which in a route handler produces a 307
 *  to /login rather than a JSON error — a fetch() caller sees an opaque
 *  redirect instead of "you are signed out". This returns null instead so the
 *  handler can answer with a status the client can act on.
 *
 *  Auth is still enforced upstream by proxy.ts for /api/* paths; this resolves
 *  WHICH tenant the authenticated request belongs to, which is the part that
 *  must never be taken from the request body. */
export async function getRouteSession(): Promise<SessionContext | null> {
  const { supabase, userId, email } = await resolveIdentity()
  if (!userId) return null

  const profile = await resolveMembership(userId)
  if (!profile) return null

  return applyOperatorView({ supabase, userId, email, profile })
}

// Tenant-level write/admin gate (settings, schedule, member management).
// Platform superadmins used to be excluded here on the grounds that they
// provision tenants through the service role rather than the tenant UI. The
// workspace switcher changed that: an operator viewing another tenant arrives
// with role 'owner' (see applyOperatorView), so they pass this gate the same
// way a real owner does, and nothing downstream needs a second concept.
export function canManageTenant(role: Role): boolean {
  return role === 'owner' || role === 'admin'
}
