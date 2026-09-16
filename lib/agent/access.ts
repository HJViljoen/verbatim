import { createAdminClient } from '../supabase-admin'
import { canManageTenant } from '../auth'
import type { Role } from '../auth'

// Who may SEND to the Verbatim Agent.
//
// Deliberate asymmetry, and the first time this product has one: every member
// of a tenant can SEE the agent and every stored thread (that falls out of the
// ordinary RLS select policy), but only a platform admin may ask a question.
// Heinrich, 2026-08-22: "make it so that only I can use the agent, show it to
// the rest, but don't let them send anything."
//
// Why the gate lives in the route handler and not in RLS: RLS governs reads,
// and this is a rule about writes that also spends money on a model call. A
// select policy is the wrong instrument, and writes already go through the
// service role, which RLS does not constrain at all.
//
// `platform_admins` and `is_superadmin()` have existed in the schema since the
// RBAC work but NOTHING in the application has ever read them — lib/auth.ts
// says superadmins operate through the service role rather than the tenant UI.
// This is the first app-level use, so it reads the table directly rather than
// calling is_superadmin(), which resolves auth.uid() from the request JWT and
// would be evaluated as the service role here.

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  if (!userId) return false
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  // Fail CLOSED. An unreadable admin table must not hand out send rights; the
  // worst case is that the operator is told to try again, not that a tenant
  // starts spending on model calls.
  if (error) return false
  return Boolean(data)
}

// ── Decision B (Phase 1 WP21): Ask opens to client owners and admins ────────
//
// The asymmetry above stays — a member reads every thread and sends nothing —
// but the line moved. From 2026-08-22 to now exactly ONE human could ask across
// both tenants (the platform admin, who is also Össur's owner); opening to
// `canManageTenant` adds Össur's admin and Sealand's owner and leaves Össur's
// three members read-only. `canManageTenant` is already the gate on Settings,
// Team, the Studio and the schedule send route, so this is the product's
// existing answer to "who may act for this workspace", not a new one.
//
// `canManageTenant` is imported from lib/auth.ts, which imports `isPlatformAdmin`
// from here — a cycle, and a deliberate one: both bindings are function
// declarations, so each module sees the other's before either finishes
// evaluating, and duplicating the role test would be the worse trade (the gate
// on Settings and this one must never disagree about what an admin is).
//
// The ROLE is checked first and the table only after, which is not only an
// ordering: an owner or an admin never pays for the `platform_admins` read at
// all. The fallback is there for a platform admin who is a member of their own
// tenant — nobody is today, and an operator viewing another tenant arrives
// with role 'owner' anyway (lib/auth.ts applyOperatorView) — because losing
// operator access to the one surface that spends money would be found in
// production rather than here.
//
// The MONEY is still gated per tenant, not per person: the monthly cap counts
// a workspace's questions (lib/ask/quota.ts), so three people sharing 40 is the
// same budget as one person spending it.

export async function canAsk(role: Role, userId: string): Promise<boolean> {
  if (canManageTenant(role)) return true
  return isPlatformAdmin(userId)
}

/** What a member is told. Not "switched off" — it is on, and it is not theirs
 *  to spend. The sentence says who can, so the reader knows who to ask. */
export const ASK_NOT_YOURS =
  'Asking is for owners and admins on this workspace. You can read every answer here.'
