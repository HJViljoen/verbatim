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
//
// AND THE DATABASE, FROM THE R12 FILE (the deploy-1 review's R12). Until it,
// `authenticated` holds column UPDATE on `tracking_configs` (competitor_names,
// report_period, report_day: migration 20260820120000; exclude_terms:
// 20260911140000; subreddits: 20260919090000) under its own-row policy, so a
// Sealand user holding their session token could PATCH those columns through
// PostgREST and never meet `assertTenantMay` (the audit trigger would still
// record it). The three settings writes that used them (`updateTrackingConfig`,
// `updateSearchTerms`' exclusions, `updateCommunity`) go out on the admin
// client after their role and lock checks, from deploy 2; then
// 20260928091000_market_first_r12_grants.sql revokes the grants. It is its own
// file, applied only once deploy 2 is live, because deploy 1's code still saves
// through them (MF1 on 30 Sep leaves them alone). `report_schedules` has a
// select-only policy for `authenticated`, so sending was never open to a
// PATCH. Until the R12 file is applied, watch `config_changes` for tenant-actor
// rows on those surfaces.

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
