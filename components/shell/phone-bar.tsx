"use client"

import { Menu } from "lucide-react"
import type { ReactNode } from "react"
import { useSidebar } from "@/components/ui/sidebar"

/**
 * THE PHONE'S TOP BAR (depth v2, T9; board E1-Dashboard-Phone's `.ptop`).
 *
 * Below 768 the sidebar is a drawer (`components/ui/sidebar.tsx` renders it
 * as a Sheet under `useIsMobile`), and this bar stands where it stood: white,
 * a hairline under it, the wordmark and the workspace's name on the left and
 * the menu button on the right, 14px by 16px of padding round a 40px button.
 * It sits above `<main>` in the pane, outside the scroll, so it stays put while
 * the page scrolls under it. From 768 up it is not drawn and the sidebar is.
 *
 * The rows the menu opens are the sidebar's own (`AppSidebar`, from
 * lib/nav.ts), so the phone and the desk navigate by one table. The brand
 * arrives as a slot because the wordmark's face is loaded by next/font in a
 * server module and the workspace's name streams in after the session
 * (`PhoneWordmarkLoader`, components/workspace-switcher-loader.tsx).
 *
 * It replaces the round floating trigger of 28 Aug (MASTER rule 8), which sat
 * over the page's title and cost every phone page 56px of clearance.
 */
export function PhoneTopBar({ brand }: { brand: ReactNode }) {
  const { openMobile, setOpenMobile } = useSidebar()
  return (
    <header
      data-phone-bar=""
      className="relative z-20 flex shrink-0 items-center justify-between gap-3 border-b border-[#E4E2DC] bg-white px-4 py-3.5 md:hidden print:hidden"
    >
      <div className="min-w-0">{brand}</div>
      <button
        type="button"
        aria-label="Open navigation"
        aria-expanded={openMobile}
        onClick={() => setOpenMobile(true)}
        className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[#F7F6F2] text-foreground transition-colors hover:bg-track focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Menu className="size-[18px]" strokeWidth={2} aria-hidden />
      </button>
    </header>
  )
}
