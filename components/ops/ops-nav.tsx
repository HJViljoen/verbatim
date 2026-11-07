"use client"

import { usePathname } from "next/navigation"
import { Gauge, HandCoins, Receipt } from "lucide-react"

import { SidebarMenu } from "@/components/ui/sidebar"
import { NavRow } from "@/components/app-sidebar"

// The operator's own group in the sidebar (Phase 0 WP10). Rendered only for a
// platform admin, by OpsNavLoader, which resolves the session; nothing here is
// hidden with CSS, the markup is never sent to anyone else.
//
// It is a group of its own because it is not the client's account: it is about
// the workspace being viewed, from outside. Since the navigation of 1 Oct it
// sits just above the Studio (page review §4), drawn with the client rows' own
// markup (`NavRow`): no label, and the active page a pill rather than the
// green bar the stripe ban took out. Since the audit design (7 Nov) the
// sidebar's one hairline sits above it, and it draws none of its own.

const OPS = [
  { href: "/dashboard/ops/readiness", label: "Readiness", icon: Gauge },
  // What Verbatim costs to run (9 Oct 2026). The page 404s for anyone else.
  { href: "/dashboard/ops/costs", label: "Costs", icon: Receipt },
  // What the operator owes Dad, and what has been paid back (18 Oct 2026). The page 404s for anyone else.
  { href: "/dashboard/ops/loan", label: "Dad", icon: HandCoins },
]

export function OpsNavGroup() {
  const pathname = usePathname()
  return (
    <SidebarMenu className="mb-1 gap-1">
      {OPS.map((item) => (
        <NavRow key={item.href} item={item} active={pathname === item.href} />
      ))}
    </SidebarMenu>
  )
}
