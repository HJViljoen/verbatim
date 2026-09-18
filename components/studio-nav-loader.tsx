import { getSessionContext } from "@/lib/auth"
import { canSeeStudio } from "@/lib/studio-visibility"
import { StudioNavItem } from "@/components/app-sidebar"

/**
 * The Studio's sidebar row, streamed exactly as the operator group is
 * (components/ops/ops-nav-loader.tsx): the dashboard layout must stay
 * synchronous, and whether this session may see the Studio depends on the
 * session. Hence a slot rather than a boolean prop.
 *
 * getSessionContext() is request-cached, so this costs nothing beyond what the
 * page already resolved, and a tenant user is sent no markup at all — the item
 * is not hidden with CSS, it is never rendered.
 */
export async function StudioNavLoader() {
  const session = await getSessionContext()
  if (!canSeeStudio(session)) return null
  return <StudioNavItem />
}
