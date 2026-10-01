import { Bricolage_Grotesque } from "next/font/google"
import { getSessionContext } from "@/lib/auth"
import { listWorkspaces } from "@/lib/workspaces"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
import { VerbatimMark } from "@/components/brand/mark"

// THE WORDMARK'S FACE (the navigation of 1 Oct: every `Page-*.dc.html` sidebar
// sets "Verbatim" in Bricolage Grotesque 700). The bold cut alone, latin only,
// for one word; everything else in the app stays Plex. A class on the word
// itself rather than a variable on the layout, so the phone drawer, which is
// portalled outside the layout's tree, draws it too.
const wordmarkFace = Bricolage_Grotesque({ subsets: ["latin"], weight: "700", display: "swap" })

/**
 * The wordmark, for everyone who is not a platform admin. Also the Suspense
 * fallback, so the header never shifts: the operator's company name simply
 * replaces it in place when it arrives.
 *
 * As the design draws it (`sidebar2.py`): 4px above, 12px either side and 18px
 * below, inside the sidebar's own 12px; the mark at 20px and the word at 18px,
 * 7px apart. The mark is the brand yellow (Heinrich, 1 Oct: "at the top left,
 * I want the logo to be yellow"); the word stays ink, because yellow text on
 * the white sidebar does not read (1.3:1).
 */
export function SidebarWordmark() {
  return (
    <div className="px-3 pt-1 pb-[18px]">
      <div className="flex items-center gap-[7px]">
        <VerbatimMark size={20} className="shrink-0 text-brand" />
        <span className={`${wordmarkFace.className} text-[18px] leading-[normal] font-bold tracking-[-0.02em] text-foreground`}>Verbatim</span>
      </div>
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
