"use client"

import {
  Sidebar, SidebarContent, SidebarFooter,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar"
import { LayoutDashboard, Target, MessageCircle, Swords, Play, TrendingUp, FileText, Users, Settings, LogOut } from "lucide-react"
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
    <Sidebar>
      <SidebarHeader>
        <div className="px-4 py-4">
          <span className="text-xl font-bold tracking-tight">SocialLens</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={pathname === item.href}>
                <Link href={item.href}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}