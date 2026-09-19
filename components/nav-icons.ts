import { LayoutDashboard, Target, MessageCircle, Swords, Play, FileText, Layers, CalendarDays, Sparkles, Settings, LayoutTemplate, type LucideIcon } from "lucide-react"

import type { NavKey } from "@/lib/nav"

/**
 * THE SIDEBAR'S ICONS, IN A LEAF, so a renderer that is not the app can draw
 * the app's sidebar.
 *
 * They lived in `components/app-sidebar.tsx`, which is `"use client"` and is
 * wired to the router, `next/link` and a server action — so nothing outside a
 * browser could import it, and `scripts/wave2-shots.ts` (the side-by-side
 * fidelity shots the whole wave is reviewed against) drew its own static
 * sidebar with `<span style="width:16px;height:16px;background:var(--muted)">`
 * where each icon goes. Nine grey squares, in every shot, for the whole of
 * Block D: the app has never been missing an icon, and the harness has never
 * drawn one. A reviewer reading `side-by-side-overview.png` is being shown a
 * defect the product does not have, which is the same cost as missing one it
 * does.
 *
 * `lib/nav.ts` is the one table for the surfaces themselves — key, href, label,
 * group, order. This is the presentation half, kept out of it so `lib/nav`
 * stays free of a UI dependency and every consumer of the icons resolves them
 * through the same `NavKey`.
 */
export const NAV_ICON: Record<NavKey, LucideIcon> = {
  overview: LayoutDashboard,
  subjects: Layers,
  voice: MessageCircle,
  market: Target,
  competitive: Swords,
  week: CalendarDays,
  ask: Sparkles,
  reports: FileText,
  settings: Settings,
}

/** The parked pages keep the icons they had, so a reader recognises the page
 *  they are being moved off. Keyed by href, because a parked page is not one
 *  of the nine and has no `NavKey`. */
export const OLD_NAV_ICON: Record<string, LucideIcon> = {
  "/dashboard/market-intel": Target,
  "/dashboard/competitive-intel": Swords,
  "/dashboard/videos": Play,
}

/** What an old page gets when it is not in the map above. */
export const OLD_NAV_ICON_FALLBACK: LucideIcon = Play

/** The Studio is not one of the nine and is in no group list — it arrives
 *  through its own slot, for a session that may see it. */
export const STUDIO_ICON: LucideIcon = LayoutTemplate
