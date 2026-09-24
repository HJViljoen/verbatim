import { Suspense } from "react"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { AccessBannerLoader } from "@/components/access-banner-loader"
import { OpsNavLoader } from "@/components/ops/ops-nav-loader"
import { StudioNavLoader } from "@/components/studio-nav-loader"
import { SidebarWordmark, WorkspaceSwitcherLoader } from "@/components/workspace-switcher-loader"
import { SidebarTenantLoader } from "@/components/sidebar-tenant-loader"

// Deliberately synchronous: no session, no DB. This layout wraps every
// dashboard route, and an async layout sits ABOVE each route's loading.tsx
// boundary — while it awaited the session + the clients row, no skeleton
// could paint and every navigation showed the old page frozen for the
// duration. The proxy already gates anonymous users; the page resolves the
// session (request-cached) and the billing banner streams in behind Suspense.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Sidebar 14rem, not shadcn's 16rem: labels sit closer to the edge and the
  // page gets the width back (Heinrich, 2026-08-28 walk-through).
  return (
    <SidebarProvider style={{ '--sidebar-width': '14rem' } as React.CSSProperties}>
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
        studio={
          <Suspense fallback={null}>
            <StudioNavLoader />
          </Suspense>
        }
        tenant={
          <Suspense fallback={null}>
            <SidebarTenantLoader />
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
          2026-09-24 (MASTER.md rule 6, Heinrich's call): the crowd backdrop is
          BACK on every dashboard page, reversing its 2026-08-28 removal. It is
          absolute inside this pane, not inside <main>: the pane does not
          scroll, so the crowd stays put while <main> scrolls over it, adds no
          scroll height, and follows the sidebar because the pane is the space
          right of it. <main> is `relative z-10`, so every tile paints on top. */}
      <div className="relative flex flex-col flex-1 min-w-0 h-dvh overflow-hidden">
        <div className="crowd-bg" aria-hidden />
        <SidebarTrigger
          aria-label="Open navigation"
          className="absolute left-3 top-3 z-20 size-9 rounded-full bg-tile text-foreground shadow-tile md:hidden"
        />
        <main className="relative z-10 flex-1 min-h-0 overflow-y-auto p-6 pt-14 md:pt-6">
          <Suspense fallback={null}>
            <AccessBannerLoader />
          </Suspense>
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}