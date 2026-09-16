// Tenant roles, as a LEAF module.
//
// WHY THIS FILE EXISTS. `canManageTenant` lived in lib/auth.ts, which is not a
// leaf: it reads cookies, builds Supabase clients and resolves a membership. So
// lib/agent/access.ts — the gate on who may spend money on Ask — had to import
// the role test from there, while lib/auth.ts imports `isPlatformAdmin` back
// from lib/agent/access.ts to build an operator view. A cycle across the auth
// boundary, and one that worked (both bindings are function declarations, so
// each module sees the other's before either finishes evaluating) right up
// until a third module or a module-level constant joined it.
//
// The predicate is one pure line over a role and it needs none of what auth.ts
// does. Moving it here keeps the SINGLE DEFINITION — which is the thing that
// matters, because the gate on Settings and the gate on spend must never
// disagree about what an admin is — and removes the cycle. lib/auth.ts
// re-exports all three names, so every existing importer is untouched.

export type Role = 'owner' | 'admin' | 'member'

// Most-privileged first. Used for select options and validation.
export const ROLES: readonly Role[] = ['owner', 'admin', 'member'] as const

// Tenant-level write/admin gate (settings, schedule, member management, and
// since Phase 1 WP21 the Ask page's send).
//
// Platform superadmins used to be excluded here on the grounds that they
// provision tenants through the service role rather than the tenant UI. The
// workspace switcher changed that: an operator viewing another tenant arrives
// with role 'owner' (see applyOperatorView in lib/auth.ts), so they pass this
// gate the same way a real owner does, and nothing downstream needs a second
// concept.
export function canManageTenant(role: Role): boolean {
  return role === 'owner' || role === 'admin'
}
