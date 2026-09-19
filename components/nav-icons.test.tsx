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
