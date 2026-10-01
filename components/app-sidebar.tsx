"use client"

import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { NAV_ICON } from "@/components/nav-icons"
import { cn } from "@/lib/utils"
import { surfaceForPath, surfacesIn, type NavGroup } from "@/lib/nav"

// THE NAVIGATION OF 1 OCT (`sidebar2.py`; the sidebar of every `Page-*.dc.html`
// artboard). Ten surfaces from lib/nav.ts, the one table the page bars and the
// redirects read too, in four groups:
//
//   Dashboard · Your market · This week · Conversation · Competitive
//   ──
//   Subjects · Your moves
//   ──
//   Agent                      (a filled yellow row)
//
//   Studio · Settings          (at the foot)
//
// The groups are separated by space and a hairline and carry NO label (page
// review §4: "Intelligence" and "Account" said nothing a reader needs). Log out
// left the foot for Settings' bar (components/log-out-button.tsx), and the
// Studio is a row of its own now that clients see it (STUDIO_TENANT_VISIBLE).
//
// THE ICONS ARE `components/nav-icons.ts`, a leaf, so `scripts/wave2-shots.ts`
// can draw what ships.

type NavItem = { href: string; label: string; icon: LucideIcon }

// Palette A (pages build brief rule 8), used locally: the design's hairline,
// the Agent's yellow, and the inactive icon grey `sidebar2.py` names. The
// sidebar's own tokens are still the old brand's; the app-wide colour swap is
// a separate task.
const HAIR = "bg-[#E4E2DC]"

// ONE ROW, AS THE DESIGN DRAWS IT: 40px tall, 4px apart, 12px in, the icon 12px
// from the label, a 6px radius, 14px ink. The active page is a pill of the ink
// at 7% (`rgba(38,41,44,0.07)`) and semibold, its icon in ink; every other icon
// is `#6E7378`. NO LEFT BAR: the 3px green bar at the pill's edge is gone under
// the stripe ban (pages build brief rule 7; page review §4).
const ROW_CLASS =
  "h-10 gap-3 rounded-[6px] px-3 text-[14px] font-normal text-foreground " +
  "hover:bg-sidebar-accent hover:text-foreground " +
  // `data-active` is on EVERY row ("true" or "false"), so the primitive's own
  // `data-active:` grey and medium weight would reach the inactive rows too.
  "data-[active=false]:bg-transparent data-[active=false]:font-normal data-[active=false]:hover:bg-sidebar-accent " +
  "data-[active=true]:bg-foreground/[0.07] data-[active=true]:font-semibold data-[active=true]:text-foreground"

// THE AGENT'S ROW (Heinrich, 30 Sep: "stands out"): filled yellow `#FFD43B`,
// semibold ink, the Lucide `Sparkles` in ink. The design draws it the same on
// every page, its own included, so the active pill does not apply to it; the
// page it opens is still marked for assistive tech by `aria-current`.
const AGENT_CLASS =
  "h-10 gap-3 rounded-[6px] px-3 text-[14px] font-semibold text-foreground " +
  "bg-[#FFD43B] hover:bg-[#FFD43B] hover:text-foreground " +
  "data-[active=false]:bg-[#FFD43B] data-[active=false]:font-semibold data-[active=false]:hover:bg-[#FFD43B] " +
  "data-[active=true]:bg-[#FFD43B] data-[active=true]:font-semibold data-[active=true]:text-foreground"

/** The hairline between two groups: 1px, 12px in from each side, 8px above and
 *  below (the design's `margin: 8px 12px`). */
export function NavHairline() {
  return <div aria-hidden className={cn("mx-3 my-2 h-px shrink-0", HAIR)} />
}

/**
 * One row of the navigation, exported so the operator's group
 * (components/ops/ops-nav.tsx) renders exactly the same markup. `active` is a
 * PROP rather than a pathname comparison made in here: the one table
 * (lib/nav.ts `surfaceForPath`) decides which row is marked. setOpenMobile
 * closes the mobile drawer when a row is tapped.
 */
export function NavRow({ item, active, agent = false }: { item: NavItem; active: boolean; agent?: boolean }) {
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} className={agent ? AGENT_CLASS : ROW_CLASS}>
        <Link href={item.href} aria-current={active ? "page" : undefined} onClick={() => setOpenMobile(false)}>
          <item.icon
            className={cn("size-4", agent || active ? "text-foreground" : "text-[#6E7378]")}
            strokeWidth={2}
            aria-hidden
          />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar({ header, ops }: { header?: React.ReactNode; ops?: React.ReactNode }) {
  const pathname = usePathname()
  const active = surfaceForPath(pathname)
  const group = (g: NavGroup) => (
    <SidebarMenu className="gap-1">
      {surfacesIn(g).map((s) => (
        <NavRow
          key={s.key}
          item={{ href: s.href, label: s.label, icon: NAV_ICON[s.key] }}
          active={active?.key === s.key}
          agent={g === "agent"}
        />
      ))}
    </SidebarMenu>
  )

  return (
    // The design's frame: 256px of white with a 1px hairline on its right edge
    // and no shadow; 18px above the wordmark, 12px either side, 16px below the
    // foot. The width is the layout's `--sidebar-width`.
    <Sidebar variant="sidebar" collapsible="offcanvas" className="border-r-[#E4E2DC]">
      {/* `header` arrives as a slot because this component is "use client" and
          the workspace switcher's loader is a server component. Without it,
          every user who is not a platform admin, it is the wordmark. */}
      <SidebarHeader className="gap-0 px-3 pt-[18px] pb-0">
        {header}
      </SidebarHeader>

      <SidebarContent className="gap-1 px-3 pt-1">
        {group("read")}
        <NavHairline />
        {group("steer")}
        <NavHairline />
        {group("agent")}
      </SidebarContent>

      <SidebarFooter className="gap-1 px-3 pt-2 pb-4">
        {/* The operator's group (operator only, above the Studio: page review
            §4) arrives as a slot: who is looking is async, and this component
            is "use client". Absent for every user who is not a platform
            admin, so a client's sidebar is exactly the design's. */}
        {ops}
        {group("foot")}
      </SidebarFooter>
    </Sidebar>
  )
}
