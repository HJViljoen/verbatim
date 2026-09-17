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
// Nothing is guarded at the route: `/dashboard/studio` still answers for anyone
// who types it, which is deliberate. The owner asked for the button, not a
// wall, and the links already sitting in sent emails have to keep working.
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
