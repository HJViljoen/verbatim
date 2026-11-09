import { OpsNavGroup } from "@/components/ops/ops-nav"
import { sidebarHeaderRead } from "@/components/workspace-switcher-loader"

/**
 * The async half of the operator's sidebar group, streamed exactly as the
 * workspace switcher is (components/workspace-switcher-loader.tsx): the
 * dashboard layout must stay synchronous — an async layout sits above every
 * route's loading.tsx and would freeze the whole shell on a session round-trip.
 *
 * It awaits the header's own request-cached read (`sidebarHeaderRead`), so it
 * costs nothing beyond what the header already reads and lands in the same
 * paint as the switcher (T1.8). A tenant user is sent no markup at all — the
 * group is not hidden, it is never rendered.
 */
export async function OpsNavLoader() {
  const { operator } = await sidebarHeaderRead()
  if (!operator) return null
  return <OpsNavGroup />
}
