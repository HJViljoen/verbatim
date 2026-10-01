import { Suspense } from "react"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { AccessBannerLoader } from "@/components/access-banner-loader"
import { OpsNavLoader } from "@/components/ops/ops-nav-loader"
import { SidebarWordmark, WorkspaceSwitcherLoader } from "@/components/workspace-switcher-loader"

// Deliberately synchronous: no session, no DB. This layout wraps every
// dashboard route, and an async layout sits ABOVE each route's loading.tsx
// boundary — while it awaited the session + the clients row, no skeleton
// could paint and every navigation showed the old page frozen for the
// duration. The proxy already gates anonymous users; the page resolves the
// session (request-cached) and the billing banner streams in behind Suspense.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Sidebar 256px (16rem), the width every `Page-*.dc.html` artboard draws
  // (the navigation of 1 Oct). It was 14rem from the 2026-08-28 walk-through.
  return (
    <SidebarProvider style={{ '--sidebar-width': '16rem' } as React.CSSProperties}>
      {/* The sidebar header streams: the shell paints the wordmark immediately
          and, for a platform admin only, the tenant switcher replaces it when
          the session resolves. Same reason as the banner below — this layout
          must not await anything. */}
      <AppSidebar
        header={
          <Suspense fallback={<SidebarWordmark />}>
            <WorkspaceSwitcherLoader />
          </Suspense>
        }
        ops={
          <Suspense fallback={null}>
            <OpsNavLoader />
          </Suspense>
        }
      />
      {/* min-w-0: without it this flex item refuses to shrink below the
          intrinsic width of wide children (the Content page's 9-column table),
          so the whole page overflows the phone viewport instead of the table
          scrolling inside its own overflow-x-auto container.
          h-dvh + inner-scrolling <main>: the app scrolls inside its own pane
          instead of the document, so the sidebar stays put while content
          scrolls (this also stopped the mobile browser toolbar from animating,
          which used to shift the old window-fixed crowd backdrop).
          2026-08-28 (MASTER.md rule 8): the 48px header — which only ever held
          the mobile sidebar trigger — is gone; on phones the trigger floats in
          the top-left corner.
          1 Oct (the navigation build, every `Page-*.dc.html` artboard): the
          pane is the design's ground, Palette A `#F7F6F2`, with no crowd
          backdrop behind it (it came back on 2026-09-24 and the approved
          designs draw none), and <main> sits 28px from the top and 40px from
          the other three edges. Palette A is used locally: the app's own
          --background is still the old white, and the app-wide colour swap is
          a separate task. */}
      <div className="relative flex flex-col flex-1 min-w-0 h-dvh overflow-hidden bg-[#F7F6F2]">
        <SidebarTrigger
          aria-label="Open navigation"
          className="absolute left-3 top-3 z-20 size-9 rounded-full bg-tile text-foreground shadow-tile md:hidden"
        />
        <main className="relative z-10 flex-1 min-h-0 overflow-y-auto p-6 pt-14 md:px-10 md:pt-7 md:pb-10">
          <Suspense fallback={null}>
            <AccessBannerLoader />
          </Suspense>
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}