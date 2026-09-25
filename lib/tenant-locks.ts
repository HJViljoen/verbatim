// The tenant lock (market-first decisions I and J, plan WP1.2).
//
// ONE PLACE, NO EXPIRY. During Sealand's trial nobody at Sealand can switch
// sending on (decision J: the app, the first brief and the September report,
// all sent by Heinrich; no weekly email) or change what we search, the rivals
// we file under or the communities we watch (decision I: every term and
// community has run unchanged since 20 Sep, which is what makes October against
// November the first pair read the same way). Heinrich lifts either half with a
// one-line change here and a deploy; nothing else reads a date to lift it.
//
// THE PLATFORM OPERATOR IS LET THROUGH. The lock is about the tenant's own
// users; an operator (a `platform_admins` row, which is what
// `SessionContext.operator` being non-null means, lib/auth.ts) is who makes
// these changes on the tenant's behalf, and every such write is still stamped
// as the operator's (`actorStamp`).
//
// EVERY WRITER CALLS IT. The server actions that write `report_schedules.active`
// or a tracking column call `assertTenantMay` before they write, and a sweep
// test (lib/tenant-locks.test.ts) lists every such action and fails if one does
// not, so a new action cannot quietly reopen what this closes.

export type TenantLockKind = 'sends' | 'tracking'

/** Sealand: `ac16988e-c4f3-4baf-b388-73895852a554` (research DR, the fixture
 *  ids used throughout the plan). */
export const TENANT_LOCKS: Readonly<Record<string, { sends: boolean; tracking: boolean }>> = {
  'ac16988e-c4f3-4baf-b388-73895852a554': { sends: true, tracking: true },
}

/** The refusal a locked tenant reads, in the plan's words. */
export const TENANT_LOCK_REFUSAL: Readonly<Record<TenantLockKind, string>> = {
  sends: 'Sending is switched on by Verbatim during your trial.',
  tracking: 'Searches are held still until January so October and November can be compared; tell us and we will note it for then.',
}

/** Whether this tenant is locked for this kind of change. */
export function tenantLocked(clientId: string, kind: TenantLockKind): boolean {
  return TENANT_LOCKS[clientId]?.[kind] === true
}

/** What a caller needs from a session: whether it is the platform operator. */
export interface LockSession {
  operator?: unknown | null
}

export type TenantMay = { ok: true } | { ok: false; message: string }

/**
 * May this session make this kind of change for this tenant? A tenant's own
 * user is refused where the tenant is locked; the platform operator never is.
 * The caller returns the message as its action state and writes nothing.
 */
export function assertTenantMay(ctx: LockSession, clientId: string, kind: TenantLockKind): TenantMay {
  if (ctx.operator != null) return { ok: true }
  if (!tenantLocked(clientId, kind)) return { ok: true }
  return { ok: false, message: TENANT_LOCK_REFUSAL[kind] }
}
