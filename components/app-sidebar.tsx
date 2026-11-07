"use client"

import {
  Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { NAV_ICON } from "@/components/nav-icons"
import { cn } from "@/lib/utils"
import { surfaceForPath, surfacesIn, type NavGroup } from "@/lib/nav"

// THE NAVIGATION OF THE AUDIT DESIGN (7 Nov; the sidebar of every board in
// ~/.claude/plans/verbatim-audit-design/boards, Market-After.dc.html the
// reference). Nine surfaces from lib/nav.ts, the one table the page bars and
// the redirects read too, drawn as the boards draw them:
//
//   Dashboard · Market · Voices · Your products · Content · Your moves · Agent
//   ──
//   (the operator's rows, operator only) · Studio · Settings
//
// One list of seven, the Agent an ordinary row (its filled yellow row is
// retired), ONE hairline, then the Studio and Settings right under it: no foot
// pinned to the bottom. The groups carry NO label (page review §4). Log out
// left the foot for Settings' bar (components/log-out-button.tsx), and the
// Studio is a row of its own now that clients see it (STUDIO_TENANT_VISIBLE).
// lib/nav.ts keeps its three groups; this file draws the first two as one.
//
// THE ICONS ARE `components/nav-icons.ts`, a leaf, so `scripts/wave2-shots.ts`
// can draw what ships.

type NavItem = { href: string; label: string; icon: LucideIcon }

// ONE ROW, AS THE BOARDS DRAW IT (`.nav`): 40px tall, 4px apart, 12px in, the
// icon 14px from the label, an 8px radius, 15px ink. The icon is 19px at a
// 1.8 stroke in the muted ink (the row's className overrides the shadcn
// button's `[&_svg]:size-4`; components/ui/sidebar.tsx is never edited). The
// current page is a pill of the pale yellow (`bg-accent`: a selected state)
// and semibold, its icon in the orange text at 1.9, the one place the orange
// text is left on a screen; a hover is the ink at 7%. NO LEFT BAR (the stripe
// ban; page review §4).
const ROW_CLASS =
  "h-10 gap-3.5 rounded-[8px] px-3 text-[15px] font-normal text-foreground [&_svg]:size-[19px] " +
  "hover:bg-sidebar-accent hover:text-foreground " +
  // `data-active` is on EVERY row ("true" or "false"), so the primitive's own
  // `data-active:` grey and medium weight would reach the inactive rows too.
  "data-[active=false]:bg-transparent data-[active=false]:font-normal data-[active=false]:hover:bg-sidebar-accent " +
  "data-[active=true]:bg-accent data-[active=true]:hover:bg-accent data-[active=true]:font-semibold data-[active=true]:text-foreground"

/** The one hairline: 1px of the track, 12px in from each side and 12px above
 *  and below (the boards' `margin: 12px 12px`). */
export function NavHairline() {
  return <div aria-hidden className="mx-3 my-3 h-px shrink-0 bg-track" />
}

/**
 * One row of the navigation, exported so the operator's group
 * (components/ops/ops-nav.tsx) renders exactly the same markup. `active` is a
 * PROP rather than a pathname comparison made in here: the one table
 * (lib/nav.ts `surfaceForPath`) decides which row is marked. setOpenMobile
 * closes the mobile drawer when a row is tapped.
 */
export function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} className={ROW_CLASS}>
        <Link href={item.href} aria-current={active ? "page" : undefined} onClick={() => setOpenMobile(false)}>
          <item.icon
            className={cn("size-[19px]", active ? "text-orange-text" : "text-muted-foreground")}
            strokeWidth={active ? 1.9 : 1.8}
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
  const group = (...groups: NavGroup[]) => (
    <SidebarMenu className="gap-1">
      {groups.flatMap((g) => surfacesIn(g)).map((s) => (
        <NavRow
          key={s.key}
          item={{ href: s.href, label: s.label, icon: NAV_ICON[s.key] }}
          active={active?.key === s.key}
        />
      ))}
    </SidebarMenu>
  )

  return (
    // The boards' frame: white with a 1px rule of the track on its right edge
    // and no shadow (the audit design; `--shadow-sidebar` stays defined, drift
    // guard (g)); 20px above the header, 12px either side, 16px below. The
    // width is the layout's `--sidebar-width`.
    <Sidebar variant="sidebar" collapsible="offcanvas" className="border-r border-track">
      {/* `header` arrives as a slot because this component is "use client" and
          the workspace switcher's loader is a server component: the client's
          own name beside the mark, or the operator's switcher. */}
      <SidebarHeader className="gap-0 px-3 pt-5 pb-0">
        {header}
      </SidebarHeader>

      <SidebarContent className="gap-0 px-3 pt-1.5 pb-4">
        {group("read", "agent")}
        <NavHairline />
        {/* The operator's rows (operator only, just above the Studio: page
            review §4) arrive as a slot: who is looking is async, and this
            component is "use client". Absent for every user who is not a
            platform admin, so a client's sidebar is exactly the boards'. */}
        {ops}
        {group("foot")}
      </SidebarContent>
    </Sidebar>
  )
}
