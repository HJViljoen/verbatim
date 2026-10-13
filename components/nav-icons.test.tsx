import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

import { SURFACES } from '@/lib/nav'
import { NAV_ICON } from './nav-icons'

// ONE ICON MAP, READ BY THE APP AND BY THE SHOT HARNESS.
//
// The sidebar's icons lived inside `components/app-sidebar.tsx`, which is
// `"use client"` and wired to the router, `next/link` and a server action — so
// `scripts/wave2-shots.ts`, which photographs every ported page beside its
// artboard, could not import them and drew nine 16px grey squares instead.
// Every Block D side-by-side showed a sidebar with no icons; the app has had
// them since it had a sidebar. A shot that shows a defect the product does not
// have costs a reviewer exactly what one that hides a real defect costs.
//
// So the map is a leaf, and this file is the gate on it: a NEW SURFACE gets an
// icon or this fails, and neither consumer may grow a second map. It is a
// source assertion, the way `lib/reading/own-posts.test.ts` pins its one copy
// of a constant — because "both read the same map" is not a claim a render can
// make.

describe('the sidebar’s icons', () => {
  it('has one for every surface in the nav table', () => {
    for (const s of SURFACES) expect(NAV_ICON[s.key], s.key).toBeTruthy()
    expect(Object.keys(NAV_ICON).sort()).toEqual(SURFACES.map((s) => s.key).sort())
  })

  it('renders an SVG the browser can draw, at the app’s own 16px', () => {
    // `size-4` in the app; 16 × 16 in `Main.dc.html`. The harness passes the
    // number because it has no Tailwind class to hand a static string.
    const markup = renderToStaticMarkup(createElement(NAV_ICON.market, { width: 16, height: 16 }))
    expect(markup).toContain('<svg')
    expect(markup).toContain('width="16"')
    expect(markup).toContain('height="16"')
  })

  it('draws the boards’ glyph on each of the nine, not a near-enough one (Design v2)', () => {
    // A name in a map is not a shape, so each line below is a fragment of the
    // path the component actually emits, chosen to be unique to that glyph:
    // swap the component back and the fragment goes. The boards' own paths
    // are every `E*.dc.html` sidebar's.
    const draw = (key: keyof typeof NAV_ICON) =>
      renderToStaticMarkup(createElement(NAV_ICON[key], { width: 16, height: 16 }))

    // Market is the conversation: the speech square with two lines of text
    // that Conversation wore (`M21 15a2 2 … z · M13 8H7 · M17 12H7`).
    expect(draw('market')).toContain('lucide-message-square-text')
    expect(draw('market')).toContain('M13 8H7')
    expect(draw('market')).not.toContain('lucide-globe')
    // Voices: two people (`circle cx9 cy7 r4` and a second figure behind).
    expect(draw('voices')).toContain('lucide-users')
    expect(draw('voices')).toContain('cx="9" cy="7" r="4"')
    // Your products: a box (Lucide Package).
    expect(draw('products')).toContain('lucide-package')
    expect(draw('products')).toContain('M12 22V12')
    // Content: a play button in a square.
    expect(draw('content')).toContain('lucide-square-play')
    expect(draw('content')).toContain('<rect x="3" y="3" width="18" height="18" rx="2"')
    // Your moves keeps the target it always had (three rings).
    expect(draw('moves')).toContain('lucide-target')
    expect(draw('moves').match(/<circle/g)).toHaveLength(3)

    // The four Design v2 keeps, so a future sweep cannot quietly move them.
    // The Agent is the original Lucide Sparkles (Heinrich, 30 Sep).
    expect(draw('ask')).toContain('lucide-sparkles')
    expect(draw('ask')).not.toContain('M12 17h.01')
    // The Dashboard (1 Oct): Lucide's LayoutDashboard, four tiles.
    expect(draw('home')).toContain('lucide-layout-dashboard')
    // The Studio keeps the template it always had.
    expect(draw('studio')).toContain('lucide-layout-template')
    // Three VERTICAL tracks crossed by horizontal handles. `SlidersHorizontal`
    // is the same glyph turned 90° and would pass a looser assertion, so the
    // one pinned here is a track the vertical form has and the horizontal
    // form does not.
    expect(draw('settings')).toContain('M12 21v-9')
    expect(draw('settings')).not.toContain('lucide-sliders-horizontal')
  })

  it('draws three glyphs with the artboards\' exact paths, not the installed Lucide\'s newer ones', () => {
    // components/design-icons.ts, copied from `sidebar2.py` (integration, 1 Oct).
    const draw = (key: keyof typeof NAV_ICON) => renderToStaticMarkup(createElement(NAV_ICON[key], { width: 16, height: 16 }))
    // The Agent: a small "+" at the lower left (M4 17v2 / M5 18H3), not the newer ring.
    expect(draw('ask')).toContain('M4 17v2')
    expect(draw('ask')).not.toMatch(/<circle/)
    // Market: two lines of text in the square, not the installed three.
    expect(draw('market')).toContain('M13 8H7')
    expect(draw('market')).toContain('M17 12H7')
    // Settings: the handles at 14, 8 and 16.
    expect(draw('settings')).toContain('M2 14h4')
    expect(draw('settings')).toContain('M18 16h4')
  })

  it('is the only map — neither consumer declares its own', () => {
    const sidebar = readFileSync('components/app-sidebar.tsx', 'utf8')
    const shots = readFileSync('scripts/wave2-shots.ts', 'utf8')
    expect(sidebar).toContain("from \"@/components/nav-icons\"")
    expect(sidebar).not.toMatch(/const (ICON|OLD_ICON)\s*[:=]/)
    // The "Old pages (retiring …)" group was taken out on 2026-09-24; the
    // parked pages answer by link and banner only.
    expect(sidebar).not.toMatch(/OLD_PAGES|oldPagesGroupLabel|Old pages/)
    expect(shots).toContain("from '../components/nav-icons'")
    // And the harness draws them rather than a placeholder box. This exact
    // span is what stood where nine icons belong.
    expect(shots).not.toContain('border-radius:3px;background:var(--muted)')
  })
})
