"use client"

import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { LayoutDashboard, Target, MessageCircle, Swords, Play, FileText, Layers, CalendarDays, Sparkles, Settings, LogOut } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "@/app/login/actions"
import { OLD_PAGES, oldPageFor, oldPagesGroupLabel, surfaceForPath, surfacesIn, type NavKey } from "@/lib/nav"

// The nine reading surfaces, in the mock's order, from lib/nav.ts — the one
// table the page bars and the parked pages' banners read too. Two groups, as
// every app artboard draws them: Intelligence, then Account.
//
// Studio, Team and Billing left this list in Phase 1 (WP9): Team and Billing
// are rail entries inside Settings (components/settings-frame.tsx) and reach
// their pages from there, and the Studio is reached from Reports. Nothing was
// orphaned by dropping them; WP16 rebuilds the Settings rail around them.

const ICON: Record<NavKey, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  subjects: Layers,
  voice: MessageCircle,
  market: Target,
  competitive: Swords,
  week: CalendarDays,
  ask: Sparkles,
  reports: FileText,
  settings: Settings,
}

// The parked pages keep the icons they had, so a reader recognises the page
// they are being moved off.
const OLD_ICON: Record<string, typeof LayoutDashboard> = {
  "/dashboard/market-intel": Target,
  "/dashboard/competitive-intel": Swords,
  "/dashboard/videos": Play,
}

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard }

// Active = weight + a 2px green bar on the left (rule 1: green marks the active
// page). No pill fill — the shadcn default paints bg-sidebar-accent on
// data-active, which is overridden here.
const ITEM_CLASS =
  "relative h-9 gap-2.5 rounded-md px-2.5 text-[14px] font-normal text-sidebar-foreground " +
  "hover:bg-sidebar-accent hover:text-foreground " +
  "data-[active=true]:bg-transparent data-[active=true]:font-semibold data-[active=true]:text-foreground " +
  "data-[active=true]:before:absolute data-[active=true]:before:-left-2 data-[active=true]:before:top-2 data-[active=true]:before:bottom-2 " +
  "data-[active=true]:before:w-0.5 data-[active=true]:before:rounded-full data-[active=true]:before:bg-primary data-[active=true]:before:content-['']"

export function AppSidebar({ showAgent = false, header, ops }: { showAgent?: boolean; header?: React.ReactNode; ops?: React.ReactNode }) {
  const pathname = usePathname()
  // Ask is one of the nine and still rides AGENT_ENABLED: decision B opens it
  // to client owners and admins in WP21, and until that lands SENDING is
  // platform-admin only (app/dashboard/agent/page.tsx). Showing a client an
  // item they cannot use is worse than showing them eight. One env var flips
  // it; WP21 removes the gate.
  const active = surfaceForPath(pathname)
  const item = (key: NavKey, href: string, label: string): NavItem => ({ href, label, icon: ICON[key] })
  const intelligence = surfacesIn("Intelligence")
    .filter((s) => s.key !== "ask" || showAgent)
    .map((s) => item(s.key, s.href, s.label))
  const account = surfacesIn("Account").map((s) => item(s.key, s.href, s.label))
  const oldPages: NavItem[] = OLD_PAGES.map((p) => ({ href: p.href, label: p.label, icon: OLD_ICON[p.href] ?? Play }))
  const parked = oldPageFor(pathname)

  // Close the mobile drawer when a nav item is tapped — otherwise it stays
  // open over the new page until the backdrop is tapped.
  const { setOpenMobile } = useSidebar()

  async function handleLogout() {
    await signOut()
  }

  const renderGroup = (label: string, items: NavItem[], isActive: (href: string) => boolean) => (
    <SidebarGroup className="px-1.5">
      <SidebarGroupLabel className="h-7 px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {items.map((navItem) => (
            <SidebarMenuItem key={navItem.href}>
              <SidebarMenuButton asChild isActive={isActive(navItem.href)} className={ITEM_CLASS}>
                <Link href={navItem.href} onClick={() => setOpenMobile(false)}>
                  <navItem.icon className="size-4 text-muted-foreground group-data-[active=true]/menu-button:text-foreground" aria-hidden />
                  <span>{navItem.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )

  return (
    <Sidebar variant="sidebar" collapsible="offcanvas">
      {/* `header` arrives as a slot rather than being rendered here because
          this component is "use client" and the workspace switcher's loader is
          a server component: it has to be composed above, in the layout, and
          passed down. Without it — every user who is not a platform admin —
          this is the wordmark, unchanged. */}
      <SidebarHeader>
        {header ?? (
          <div className="flex items-baseline gap-2 px-4 pt-5 pb-1">
            <span className="text-[17px] font-bold tracking-[-0.02em] text-foreground">Verbatim</span>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-1 pt-1">
        {renderGroup("Intelligence", intelligence, (href) => active?.href === href)}
        {renderGroup("Account", account, (href) => active?.href === href)}
        {/* The pages Phase 1 replaces, in their own group with the date on the
            label (decision C). They are listed rather than hidden because the
            reading on them is the reading people have been using for months,
            and a page that disappears without a date is a page someone emails
            about. Each one carries a banner naming its replacement. */}
        {renderGroup(oldPagesGroupLabel(), oldPages, (href) => parked?.href === href)}
        {/* The operator's group arrives as a slot for the same reason the
            header does: resolving who is looking is async, and this component
            is "use client". Absent — every user who is not a platform admin —
            the sidebar is exactly the three groups above. */}
        {ops}
      </SidebarContent>

      <SidebarFooter className="px-2 pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} className={ITEM_CLASS}>
              <LogOut className="size-4 text-muted-foreground" aria-hidden />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
