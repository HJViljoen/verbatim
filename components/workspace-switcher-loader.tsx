import { Bricolage_Grotesque } from "next/font/google"
import { getSessionContext } from "@/lib/auth"
import { viewedClientRow } from "@/lib/shell/viewed-client"
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

/**
 * THE PHONE TOP BAR'S BRAND (depth v2, T9; E1-Dashboard-Phone): the sidebar's
 * wordmark, the same mark, face and sizes, and the workspace's name beside it
 * in the muted ink, cut with an ellipsis where it would crowd the menu button.
 * Without a name (the fallback while the session resolves, or a row that
 * could not be read) it is the wordmark alone, so the bar never shifts by more
 * than the name.
 */
export function PhoneWordmark({ name }: { name?: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-[7px]">
      <VerbatimMark size={20} className="shrink-0 text-brand" />
      <span className={`${wordmarkFace.className} shrink-0 text-[18px] leading-[normal] font-bold tracking-[-0.02em] text-foreground`}>Verbatim</span>
      {name ? <span className="ml-1 min-w-0 truncate text-[13px] text-muted-foreground">{name}</span> : null}
    </div>
  )
}

/**
 * The async half of the phone bar's brand, streamed like the sidebar header:
 * the operator's viewed workspace (what the switcher names), else the
 * workspace's own `company_name` from the row the billing banner reads in the
 * same request (`viewedClientRow`, request-cached: no second query).
 */
export async function PhoneWordmarkLoader() {
  const { operator } = await getSessionContext()
  if (operator) return <PhoneWordmark name={operator.viewingName} />
  const row = await viewedClientRow()
  return <PhoneWordmark name={typeof row?.company_name === "string" ? row.company_name : null} />
}
