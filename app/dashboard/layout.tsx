import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      {/* min-w-0: without it this flex item refuses to shrink below the
          intrinsic width of wide children (the Content page's 9-column table),
          so the whole page overflows the phone viewport instead of the table
          scrolling inside its own overflow-x-auto container. */}
      <div className="relative flex flex-col flex-1 min-w-0 min-h-screen">
        <div className="crowd-bg" aria-hidden />
        <header className="relative z-10 flex items-center h-12 px-4 border-b border-border/60">
          <SidebarTrigger />
        </header>
        <main className="relative z-10 flex-1 p-6">
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}