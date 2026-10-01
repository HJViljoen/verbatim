"use client"

import { usePathname } from "next/navigation"
import { Gauge } from "lucide-react"

import { SidebarMenu } from "@/components/ui/sidebar"
import { NavHairline, NavRow } from "@/components/app-sidebar"

// The operator's own group in the sidebar (Phase 0 WP10). Rendered only for a
// platform admin, by OpsNavLoader, which resolves the session; nothing here is
// hidden with CSS, the markup is never sent to anyone else.
//
// It is a group of its own because it is not the client's account: it is about
// the workspace being viewed, from outside. Since the navigation of 1 Oct it
// sits above the Studio at the foot (page review §4), drawn with the client
// rows' own markup (`NavRow`): a hairline above it, no label, and the active
// page a pill rather than the green bar the stripe ban took out.

const OPS = [{ href: "/dashboard/ops/readiness", label: "Readiness", icon: Gauge }]

export function OpsNavGroup() {
  const pathname = usePathname()
  return (
    <>
      <SidebarMenu className="gap-1">
        {OPS.map((item) => (
          <NavRow key={item.href} item={item} active={pathname === item.href} />
        ))}
      </SidebarMenu>
      <NavHairline />
    </>
  )
}
