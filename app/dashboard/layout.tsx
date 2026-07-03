import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      {/* min-w-0: without it this flex item refuses to shrink below the
          intrinsic width of wide children (the Content page's 9-column table),
          so the whole page overflows the phone viewport instead of the table
          scrolling inside its own overflow-x-auto container.
          h-dvh + inner-scrolling <main>: the app scrolls inside its own pane
          instead of the document. On mobile the browser toolbar therefore
          never collapses — which was the only way to stop the toolbar
          animation visibly shifting the (previously window-fixed) crowd
          backdrop; the browser moves everything glued to the window edge
          while the bar animates, and no CSS on the layer can prevent that. */}
      <div className="relative flex flex-col flex-1 min-w-0 h-dvh overflow-hidden">
        <div className="crowd-bg" aria-hidden />
        <header className="relative z-10 flex shrink-0 items-center h-12 px-4 border-b border-border/60">
          <SidebarTrigger />
        </header>
        <main className="relative z-10 flex-1 min-h-0 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}