import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

import { SURFACES } from '@/lib/nav'
import { NAV_ICON, OLD_NAV_ICON, OLD_NAV_ICON_FALLBACK, STUDIO_ICON } from './nav-icons'

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

  it('draws the artboard’s glyph on each of the nine, not a near-enough one', () => {
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
    // circle cx9 cy7 r4 with a second figure behind — people, not a bubble.
    expect(draw('voice')).toContain('cx="9"')
    expect(draw('voice')).toContain('cy="7"')
    // M6 20v-5 / M12 20V8 / M18 20v-9 / M3 20h18 — three columns on an axis.
    expect(draw('competitive')).toContain('M13 17V5')
    expect(draw('competitive')).not.toContain('lucide-swords')
    // circle r9 + a question hook + M12 17h.01 — a question, not a sparkle.
    expect(draw('ask')).toContain('M12 17h.01')
    expect(draw('ask')).not.toContain('lucide-sparkles')
    // Three VERTICAL tracks crossed by horizontal handles. `SlidersHorizontal`
    // is the same glyph turned 90° and would pass a looser assertion, so the
    // one pinned here is a track the vertical form has and the horizontal
    // form does not.
    expect(draw('settings')).toContain('M12 21v-9')
    expect(draw('settings')).not.toContain('lucide-sliders-horizontal')

    // The four that already matched, so a future sweep cannot quietly move
    // them either.
    expect(draw('overview')).toContain('lucide-layout-dashboard')
    expect(draw('market')).toContain('lucide-target')
    expect(draw('week')).toContain('lucide-calendar-days')
    expect(draw('reports')).toContain('lucide-file-text')
  })

  it('keeps the parked pages and the Studio in the same map', () => {
    // They are not surfaces and have no `NavKey`, so they are keyed by href
    // with a fallback — but they are still sidebar icons and still have to be
    // reachable from outside a client component.
    expect(Object.keys(OLD_NAV_ICON).length).toBeGreaterThan(0)
    expect(OLD_NAV_ICON_FALLBACK).toBeTruthy()
    expect(STUDIO_ICON).toBeTruthy()
  })

  it('is the only map — neither consumer declares its own', () => {
    const sidebar = readFileSync('components/app-sidebar.tsx', 'utf8')
    const shots = readFileSync('scripts/wave2-shots.ts', 'utf8')
    expect(sidebar).toContain("from \"@/components/nav-icons\"")
    expect(sidebar).not.toMatch(/const (ICON|OLD_ICON)\s*[:=]/)
    expect(shots).toContain("from '../components/nav-icons'")
    // And the harness draws them rather than a placeholder box. This exact
    // span is what stood where nine icons belong.
    expect(shots).not.toContain('border-radius:3px;background:var(--muted)')
  })
})
