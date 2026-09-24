import { LayoutDashboard, Target, Users, Swords, ChartColumn, Play, FileText, List, CalendarDays, CircleHelp, SlidersVertical, LayoutTemplate, type LucideIcon } from "lucide-react"

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
 *
 * THE GLYPHS ARE THE ARTBOARD'S, and five of the nine were not (the lead's
 * ruling, 2026-09-19: "sidebar glyphs → the artboard's five … the mock is the
 * spec"). Read off `mock-sealand/artboards/Main.dc.html`, where the sidebar is
 * static HTML and therefore carries the paths verbatim:
 *
 *   surface      artboard path (Main.dc.html)                  was          now
 *   subjects     M8 6h13 / M8 12h13 / M8 18h13 + three dots    Layers       List
 *   voice        circle cx9 cy7 r4 + a second figure behind    MessageCircle Users
 *   competitive  M6 20v-5 / M12 20V8 / M18 20v-9 / M3 20h18    Swords       ChartColumn
 *   ask          circle r9 + question hook + M12 17h.01        Sparkles     CircleHelp
 *   settings     three VERTICAL tracks, horizontal handles     Settings     SlidersVertical
 *
 * THEY STAY LUCIDE COMPONENTS, which is what the design system asks for —
 * MASTER.md §Anti-patterns says "Emojis as icons (use Lucide SVGs)" and the
 * mock's §0 rule 10 repeats it; the sidebar spec adds `16px`, `stroke-width:2`,
 * `#6E7378` → `#26292C` when active, which is exactly what `app-sidebar.tsx`
 * and `scripts/wave2-shots.ts` draw them at. A lucide component IS an inline
 * `<svg>` in the output, so nothing here is a sprite or an image file; the
 * artboard's hand-written paths are a consequence of it being a static HTML
 * file, not a rule to copy. The one place the repo hand-inlines paths is
 * `components/charts/platform-icon.tsx`, for platform marks lucide has no
 * glyph for — and the five below all have one.
 *
 * SETTINGS IS `SlidersVertical`, AND THE RULING SAID `SlidersHorizontal`.
 * The artboard draws `M4 21v-6 / M4 11V3 / M12 21v-9 / M12 8V3 / M20 21v-4 /
 * M20 13V3` with handles `M1 15h6 / M9 8h6 / M17 17h6` — three VERTICAL tracks
 * crossed by HORIZONTAL handles, which is lucide `SlidersVertical`.
 * `SlidersHorizontal` is that glyph turned 90°. The ruling's own sentence says
 * the mock is the spec, so the mock decides and the name in the note is the
 * thing that was loose. One word to reverse if the name was meant literally.
 *
 * The parked pages below keep `Swords` deliberately — see their own note.
 */
export const NAV_ICON: Record<NavKey, LucideIcon> = {
  overview: LayoutDashboard,
  subjects: List,
  voice: Users,
  market: Target,
  competitive: ChartColumn,
  week: CalendarDays,
  ask: CircleHelp,
  reports: FileText,
  settings: SlidersVertical,
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
