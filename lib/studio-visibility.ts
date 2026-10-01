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
//
// FLIPPED 1 OCT (the navigation build, page review §4): the Studio is shown to
// clients, Reports folds into it, and it is a sidebar row of its own. What a
// client may DO there is the Studio page's split (build, templates, review and
// Send stay operator-only), and who reviews a build is a separate constant,
// STUDIO_TENANT_REVIEWS below, so opening the page did not hand a held build
// or its review email to the members.
export const STUDIO_TENANT_VISIBLE = true

/**
 * WHETHER A TENANT'S MEMBERS REVIEW A BUILD before it goes out. False: the
 * review controls and Send are operator-only in the Studio (1 Oct), so the
 * review email goes to the operator and a held build is readable by the
 * operator alone (`reviewAudience`, lib/schedules/members.ts; `mayReadHeld`,
 * lib/reports/held.ts). It used to ride STUDIO_TENANT_VISIBLE, which was right
 * while "may see the Studio" and "may review in it" were the same question.
 */
export const STUDIO_TENANT_REVIEWS = false

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

/** Where a session that may not see the Studio lands instead: the Dashboard.
 *  It was Reports, which redirects INTO the Studio since 1 Oct, so with the
 *  flag off the two would have sent a tenant round in a loop. */
export const STUDIO_AWAY_HREF = '/dashboard'

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
