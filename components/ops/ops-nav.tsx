"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Gauge } from "lucide-react"

import {
  SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar"

// The operator's own group in the sidebar (Phase 0 WP10). Rendered only for a
// platform admin — by OpsNavLoader, which resolves the session; nothing here
// is hidden with CSS, the markup is never sent to anyone else.
//
// It is a group of its own rather than an item in Account because it is not
// the client's account: it is about the workspace being viewed, from outside.

const OPS = [{ href: "/dashboard/ops/readiness", label: "Readiness", icon: Gauge }]

// Same geometry as the two client groups (components/app-sidebar.tsx): active
// is weight plus a 2px green bar, never a pill fill.
const ITEM_CLASS =
  "relative h-9 gap-2.5 rounded-md px-2.5 text-[14px] font-normal text-sidebar-foreground " +
  "hover:bg-sidebar-accent hover:text-foreground " +
  "data-[active=true]:bg-transparent data-[active=true]:font-semibold data-[active=true]:text-foreground " +
  "data-[active=true]:before:absolute data-[active=true]:before:-left-2 data-[active=true]:before:top-2 data-[active=true]:before:bottom-2 " +
  "data-[active=true]:before:w-0.5 data-[active=true]:before:rounded-full data-[active=true]:before:bg-primary data-[active=true]:before:content-['']"

export function OpsNavGroup() {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarGroup className="px-1.5">
      <SidebarGroupLabel className="h-7 px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80">
        Operator
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {OPS.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={pathname === item.href} className={ITEM_CLASS}>
                <Link href={item.href} onClick={() => setOpenMobile(false)}>
                  <item.icon className="size-4 text-muted-foreground group-data-[active=true]/menu-button:text-foreground" aria-hidden />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
