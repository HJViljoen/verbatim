import { getSessionContext } from "@/lib/auth"
import { OpsNavGroup } from "@/components/ops/ops-nav"

/**
 * The async half of the operator's sidebar group, streamed exactly as the
 * workspace switcher is (components/workspace-switcher-loader.tsx): the
 * dashboard layout must stay synchronous — an async layout sits above every
 * route's loading.tsx and would freeze the whole shell on a session round-trip.
 *
 * getSessionContext() is request-cached, so for a tenant user this costs
 * nothing beyond what the page already resolved, and they are sent no markup
 * at all — the group is not hidden, it is never rendered.
 */
export async function OpsNavLoader() {
  const { operator } = await getSessionContext()
  if (!operator) return null
  return <OpsNavGroup />
}
