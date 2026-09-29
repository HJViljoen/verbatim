import type { SessionContext } from './auth'

// Who may see a way into the Studio.
//
// Owner's call, 2026-09-17: "I'm not happy with how it looks, just remove the
// button from the live site." The Studio is not presentable yet, so no tenant
// user is shown a door into it — no sidebar item, no CTA, no link, and no copy
// naming a page they cannot find. The platform operator keeps it exactly as it
// was, including while viewing a tenant through the workspace switcher, because
// building and sending a client's reports is how the work gets done today.
//
// AND THE ROUTE IS GUARDED (finish-list item 16, 29 Sep 2026). Until then
// `/dashboard/studio` answered anyone who typed it, with Build, Delete and
// Start sending live on a page the client was told nothing about. Every Studio
// page now asks `studioRedirect` first and sends a tenant user to Reports; an
// operator, including one viewing a tenant, keeps it. Nothing has ever been
// sent from production, so no link in an inbox points into the Studio.
//
// To bring the Studio back for clients, flip this one constant to true. Every
// surface reads `canSeeStudio`, so that is the whole change.
export const STUDIO_TENANT_VISIBLE = false

/** The Studio's route. One spelling, so hiding it stays one search. */
export const STUDIO_HREF = '/dashboard/studio'

/**
 * True when this session should be shown a way into the Studio.
 *
 * Operator-ness is asked exactly the way the rest of the app asks it —
 * `getSessionContext().operator !== null`, the same field `OpsNavLoader` and
 * the workspace switcher key off (lib/auth.ts `resolveOperatorView`: a
 * `platform_admins` row AND a workspace cookie that resolves). There is no
 * second way of asking.
 *
 * `tenantVisible` is an argument rather than a straight read of the constant
 * so both answers stay tested while the gate is off (AGENTS.md: gated pure
 * functions take the flag as an argument). Call sites pass nothing.
 */
export function canSeeStudio(
  session: Pick<SessionContext, 'operator'>,
  tenantVisible: boolean = STUDIO_TENANT_VISIBLE,
): boolean {
  return tenantVisible || session.operator !== null
}

/** Where a session that may not see the Studio lands instead: Reports. */
export const STUDIO_AWAY_HREF = '/dashboard/reports'

/**
 * The Studio pages' route guard (finish-list item 16): null for a session that
 * may see the Studio, else where to send it. Pure, so both answers are tested;
 * each page calls it before it reads anything, and redirects on a non-null.
 */
export function studioRedirect(
  session: Pick<SessionContext, 'operator'>,
  tenantVisible: boolean = STUDIO_TENANT_VISIBLE,
): string | null {
  return canSeeStudio(session, tenantVisible) ? null : STUDIO_AWAY_HREF
}
