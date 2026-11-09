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
// the workspace being viewed, from outside. It is drawn with the client rows'
// own markup (`NavRow`): no label, and the active page a pill rather than the
// green bar the stripe ban took out. Since the audit design (7 Nov) it draws
// no hairline of its own. Since T1.8 (9 Nov) it sits last, under Settings (it
// sat just above the Studio from 1 Oct, page review §4), 4px under it as the
// rows are apart, so its late arrival on a hard load moves no other row.

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
    <SidebarMenu className="mt-1 gap-1">
      {OPS.map((item) => (
        <NavRow key={item.href} item={item} active={pathname === item.href} />
      ))}
    </SidebarMenu>
  )
}
