"use client"

import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { LayoutDashboard, Target, MessageCircle, Swords, Play, FileText, LayoutTemplate, Users, UserRound, Sparkles, CreditCard, Settings, LogOut, BookOpen } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "@/app/login/actions"
import { VerbatimMark } from "@/components/brand/mark"
import { STUDIO_HREF } from "@/lib/studio-visibility"

// Two groups (component-map §1, MASTER rule 1): the intelligence pages a client
// reads, then the account pages. Trends was dissolved into the pages it served
// (2026-08-22): share over time lives on Competitive, theme movers on Voice,
// movement since the first update on the Dashboard, your accounts on Content.
const INTELLIGENCE = [
  { href: "/dashboard",             label: "Dashboard",           icon: LayoutDashboard },
  { href: "/dashboard/market",      label: "Market Intelligence", icon: Target },
  { href: "/dashboard/voice",       label: "Voice of Customer",   icon: MessageCircle },
  { href: "/dashboard/profile",     label: "Consumer Profile",    icon: UserRound },
  { href: "/dashboard/competitive", label: "Competitive Intel",   icon: Swords },
  { href: "/dashboard/videos",      label: "Content",             icon: Play },
]
// The Studio is NOT in this list (2026-09-17). It arrives through the `studio`
// slot instead, for the reason the operator group does: whether this session
// may see it depends on the session, and resolving that is async. See
// lib/studio-visibility.ts and components/studio-nav-loader.tsx.
const ACCOUNT = [
  { href: "/dashboard/reports",  label: "Reports",  icon: FileText },
  { href: "/dashboard/team",     label: "Team",     icon: Users },
  { href: "/dashboard/billing",  label: "Billing",  icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/guide",    label: "Guide",    icon: BookOpen },
]

// The agent rides its OWN flag, not the Ask one: lighting up the agent must
// not light up Pass E and the weekly re-evaluation inside a pipeline run.
const AGENT_ITEM = { href: "/dashboard/agent", label: "Verbatim Agent", icon: Sparkles }

const STUDIO_ITEM = { href: STUDIO_HREF, label: "Studio", icon: LayoutTemplate }

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

// One row of the navigation, module-level so the streamed Studio item below
// renders exactly the same markup the static groups do. setOpenMobile closes
// the mobile drawer when a row is tapped — otherwise it stays open over the
// new page until the backdrop is tapped.
function NavRow({ item }: { item: NavItem }) {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"))
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} className={ITEM_CLASS}>
        <Link href={item.href} onClick={() => setOpenMobile(false)}>
          <item.icon className="size-4 text-muted-foreground group-data-[active=true]/menu-button:text-foreground" aria-hidden />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/** The Studio's row, rendered by `StudioNavLoader` only for a session that may
 *  see it. A client component with no props, so a server component can render
 *  it across the boundary. */
export function StudioNavItem() {
  return <NavRow item={STUDIO_ITEM} />
}

export function AppSidebar({ showAgent = false, header, ops, studio }: { showAgent?: boolean; header?: React.ReactNode; ops?: React.ReactNode; studio?: React.ReactNode }) {
  // The agent sits directly under the profile it reads from.
  const intelligence: NavItem[] = showAgent
    ? INTELLIGENCE.flatMap((item) => (item.href === "/dashboard/profile" ? [item, AGENT_ITEM] : [item]))
    : INTELLIGENCE

  async function handleLogout() {
    await signOut()
  }

  const renderGroup = (label: string, items: NavItem[], lead?: React.ReactNode) => (
    <SidebarGroup className="px-1.5">
      <SidebarGroupLabel className="h-7 px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {lead}
          {items.map((item) => <NavRow key={item.href} item={item} />)}
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
          <div className="flex items-center gap-2 px-4 pt-5 pb-1">
            <VerbatimMark size={20} className="shrink-0 text-primary" />
            <span className="text-[17px] font-bold tracking-[-0.02em] text-foreground">Verbatim</span>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-1 pt-1">
        {renderGroup("Intelligence", intelligence)}
        {/* The Studio leads the Account group when this session may see it,
            and is absent — not hidden, never rendered — when it may not. */}
        {renderGroup("Account", ACCOUNT, studio)}
        {/* The operator's group arrives as a slot for the same reason the
            header does: resolving who is looking is async, and this component
            is "use client". Absent — every user who is not a platform admin —
            the sidebar is exactly the two groups above. */}
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
