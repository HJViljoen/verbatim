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
// Every Block D side-by-side shows a sidebar with no icons; the app has had
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
    const markup = renderToStaticMarkup(createElement(NAV_ICON.overview, { width: 16, height: 16 }))
    expect(markup).toContain('<svg')
    expect(markup).toContain('width="16"')
    expect(markup).toContain('height="16"')
  })

  it('draws the artboard’s glyph on each of the ten, not a near-enough one', () => {
    // THE MOCK IS THE SPEC (the lead's ruling, 2026-09-19), and five of these
    // nine were something else until 2026-09-24 — Layers, MessageCircle,
    // Swords, Sparkles and a gear. A name in a map is not a shape, so each
    // line below is a fragment of the path lucide actually emits, chosen to be
    // unique to that glyph: swap the component back and the fragment goes.
    //
    // The artboard's own paths are quoted beside each, read off
    // `mock-sealand/artboards/Main.dc.html`, where the sidebar is static HTML.
    // Lucide's coordinates differ by a pixel or two from the mock's redrawn
    // ones — the test pins the GLYPH, which is what a reader sees, not a
    // byte-match the mock never promised.
    const draw = (key: keyof typeof NAV_ICON) =>
      renderToStaticMarkup(createElement(NAV_ICON[key], { width: 16, height: 16 }))

    // M8 6h13 / M8 12h13 / M8 18h13 + three dots — a list, not stacked planes.
    expect(draw('subjects')).toContain('M8 12h13')
    expect(draw('subjects')).not.toContain('lucide-layers')
    // The market-first preview (design-mf2): talk, a speech square with lines
    // of text in it, not two people.
    expect(draw('voice')).toContain('lucide-message-square-text')
    expect(draw('voice')).not.toContain('lucide-users')
    // Brands (design-mf2): a tag, `M12.6 2.6A2 2 0 0 0 11.2 2H4 … z` with a
    // dot, not three columns on an axis (deploy 5).
    expect(draw('competitive')).toContain('lucide-tag')
    expect(draw('competitive')).not.toContain('M13 17V5')
    expect(draw('competitive')).not.toContain('lucide-swords')
    // The Agent is the original Lucide Sparkles again (Heinrich, 30 Sep; the
    // navigation of 1 Oct), no longer the question mark it wore as Ask.
    expect(draw('ask')).toContain('lucide-sparkles')
    expect(draw('ask')).not.toContain('M12 17h.01')
    // The Dashboard (1 Oct): Lucide's LayoutDashboard, four tiles.
    expect(draw('home')).toContain('lucide-layout-dashboard')
    // The Studio, one of the ten since 1 Oct, keeps the template it always had.
    expect(draw('studio')).toContain('lucide-layout-template')
    // Three VERTICAL tracks crossed by horizontal handles. `SlidersHorizontal`
    // is the same glyph turned 90° and would pass a looser assertion, so the
    // one pinned here is a track the vertical form has and the horizontal
    // form does not.
    expect(draw('settings')).toContain('M12 21v-9')
    expect(draw('settings')).not.toContain('lucide-sliders-horizontal')

    // The four that already matched, so a future sweep cannot quietly move
    // them either.
    // Your market is the market (design-mf2): a globe, not a dashboard grid.
    expect(draw('overview')).toContain('lucide-globe')
    expect(draw('market')).toContain('lucide-target')
    expect(draw('week')).toContain('lucide-calendar-days')
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
