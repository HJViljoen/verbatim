import { Suspense } from "react"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { AccessBannerLoader } from "@/components/access-banner-loader"
import { OpsNavLoader } from "@/components/ops/ops-nav-loader"
import { PhoneTopBar } from "@/components/shell/phone-bar"
import { PhoneWordmark, PhoneWordmarkLoader, SidebarWordmark, WorkspaceSwitcherLoader } from "@/components/workspace-switcher-loader"

// Deliberately synchronous: no session, no DB. This layout wraps every
// dashboard route, and an async layout sits ABOVE each route's loading.tsx
// boundary — while it awaited the session + the clients row, no skeleton
// could paint and every navigation showed the old page frozen for the
// duration. The proxy already gates anonymous users; the page resolves the
// session (request-cached) and the billing banner streams in behind Suspense.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Sidebar 281px, the width every `Page-*.dc.html` artboard RENDERS: it
  // declares 256px on a content-box column with 12px padding each side and a
  // 1px hairline, so its rows are 256px and the pane starts at 281
  // (integration, 1 Oct; it was 16rem, 25px narrower than drawn).
  return (
    <SidebarProvider style={{ '--sidebar-width': '281px' } as React.CSSProperties}>
      {/* The sidebar header streams: the shell paints the wordmark immediately
          and, when the session resolves, the client's own name (the audit
          design, decision 13) or, for a platform admin only, the tenant
          switcher replaces it in the same row. Same reason as the banner below:
          this layout must not await anything. */}
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
          13 Oct (depth v2, T9; E1-Dashboard-Phone): below 768 the phone's top
          bar stands in for the sidebar (the wordmark, the workspace's name and
          the menu button; components/shell/phone-bar.tsx), above <main> and
          outside its scroll, and <main> keeps the board's 16px gutters and
          18px above the title; the floating trigger is gone.
          1 Oct (the navigation build, every `Page-*.dc.html` artboard): the
          pane is the design's ground, Palette A `#F7F6F2`. Palette A is used
          locally: the app's own --background is still the old white, and the
          app-wide colour swap is a separate task.
          7 Nov (the audit design; Market-After.dc.html's main, `padding: 36px
          40px 48px`): <main> sits 36px from the top, 40px from either side and
          48px from the foot (it was 28/40/40). The crowd backdrop that sat on
          this ground from 2 Oct (CROWD) is retired from the app: the boards
          draw the plain ground. Its CSS stays in app/globals.css for the
          signed-out frame (components/auth/auth-card.tsx). <main> keeps
          `relative z-10`. A level page's crumb row reaches edge to edge of the
          column with negative margins equal to this padding
          (components/shell/crumbs.tsx `CrumbRow`): move both together. */}
      <div className="relative flex flex-col flex-1 min-w-0 h-dvh overflow-hidden bg-[#F7F6F2]">
        <PhoneTopBar
          brand={
            <Suspense fallback={<PhoneWordmark />}>
              <PhoneWordmarkLoader />
            </Suspense>
          }
        />
        <main className="relative z-10 flex-1 min-h-0 overflow-y-auto px-4 pt-[18px] pb-12 md:px-10 md:pt-9 md:pb-12">
          <Suspense fallback={null}>
            <AccessBannerLoader />
          </Suspense>
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}