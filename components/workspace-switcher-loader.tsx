import { getSessionContext } from "@/lib/auth"
import { listWorkspaces } from "@/lib/workspaces"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"

/**
 * The wordmark as it has always been — and, for everyone who is not a platform
 * admin, as it stays. Also the Suspense fallback, so the header never shifts:
 * the operator's company name simply replaces it in place when it arrives.
 */
export function SidebarWordmark() {
  return (
    <div className="flex items-baseline gap-2 px-4 pt-5 pb-1">
      <span className="text-[17px] font-bold tracking-[-0.02em] text-foreground">Verbatim</span>
    </div>
  )
}

/**
 * The async half of the sidebar header, streamed like AccessBannerLoader so the
 * dashboard layout can stay synchronous (an async layout sits above every
 * route's loading.tsx and would freeze the whole shell on a session round-trip).
 *
 * getSessionContext() is request-cached, so for a normal tenant user this costs
 * nothing beyond what the page already resolved, and it renders exactly the
 * wordmark they see today — the switcher is not hidden with CSS, it is never
 * sent.
 */
export async function WorkspaceSwitcherLoader() {
  const { operator } = await getSessionContext()
  if (!operator) return <SidebarWordmark />
  return <WorkspaceSwitcher operator={operator} workspaces={await listWorkspaces()} />
}
