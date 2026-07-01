"use client"

import {
  Sidebar, SidebarContent, SidebarFooter,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar"
import { LayoutDashboard, Target, MessageCircle, Swords, Play, TrendingUp, FileText, Users, CreditCard, Settings, LogOut } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"

const navItems = [
  { href: "/dashboard",           label: "Dashboard",          icon: LayoutDashboard },
  { href: "/dashboard/market",    label: "Market Intelligence",icon: Target },
  { href: "/dashboard/voice",     label: "Voice of Customer",  icon: MessageCircle },
  { href: "/dashboard/competitive",label: "Competitive Intel", icon: Swords },
  { href: "/dashboard/videos",    label: "Content",            icon: Play },
  { href: "/dashboard/trends",    label: "Trends",             icon: TrendingUp },
  { href: "/dashboard/reports",   label: "Reports",            icon: FileText },
  { href: "/dashboard/team",      label: "Team",               icon: Users },
  { href: "/dashboard/billing",   label: "Billing",            icon: CreditCard },
  { href: "/dashboard/settings",  label: "Settings",           icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <Sidebar variant="floating">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-3 pt-4 pb-2">
          <span className="h-7 w-7 rounded-lg bg-primary" aria-hidden />
          <span className="text-lg font-bold tracking-tight text-[#14291F]">Verbatim</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarMenu className="gap-1.5">
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.href}
                className="h-11 gap-3 rounded-xl px-3 font-medium"
              >
                <Link href={item.href}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="px-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} className="h-11 gap-3 rounded-xl px-3 font-medium">
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}