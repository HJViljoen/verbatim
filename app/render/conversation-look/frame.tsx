import type { ReactNode } from 'react'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { SidebarWordmark } from '@/components/workspace-switcher-loader'
import { HarnessSidebar } from './shell'

// DEVELOPMENT ONLY (see ./page.tsx): the shipped sidebar and the dashboard
// layout's pane, its classes copied from app/dashboard/layout.tsx, with no
// session, no access banner and no operator rows.
export function HarnessFrame({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider style={{ '--sidebar-width': '281px' } as React.CSSProperties}>
      <HarnessSidebar header={<SidebarWordmark />} />
      <div className="relative flex flex-col flex-1 min-w-0 h-dvh overflow-hidden bg-[#F7F6F2]">
        <div className="crowd-bg crowd-bg--shell" aria-hidden />
        <SidebarTrigger
          aria-label="Open navigation"
          className="absolute left-3 top-3 z-20 size-9 rounded-full bg-tile text-foreground shadow-tile md:hidden"
        />
        <main className="relative z-10 flex-1 min-h-0 overflow-y-auto p-6 pt-14 md:px-10 md:pt-7 md:pb-10">
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}
