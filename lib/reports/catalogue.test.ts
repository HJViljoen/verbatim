import { describe, expect, it } from 'vitest'
import { studioCatalogue } from './catalogue'
import { ALL_SECTION_PAGES, SECTION_PAGES } from './types'

// The catalogue is what the Studio's outline looks a STORED section up in. A
// section whose page is missing from it loses its title, its tile checkboxes
// and its tile count while still saving — an editor that silently cannot edit.

describe('studioCatalogue', () => {
  it('carries the retired keys a stored report may still name', () => {
    const pages = studioCatalogue().map((c) => c.page)
    // Three production `reports` rows name `dashboard`, one of them the active
    // weekly schedule's own report. It is out of the picker and must stay in
    // the catalogue.
    expect(pages).toContain('dashboard')
    expect(SECTION_PAGES).not.toContain('dashboard')
  })

  it('offers only pages the registry can actually render', () => {
    for (const c of studioCatalogue()) {
      expect(ALL_SECTION_PAGES).toContain(c.page)
      expect(c.title.length).toBeGreaterThan(0)
    }
  })

  it('skips a page key that has no module yet, and offers one that has', () => {
    // `overview`, `subjects` and `week` were all keys with no module behind
    // them — `PAGE_KEYS` carries the contract and the registry says which still
    // render. Block D wave 2 registers `overview`
    // (components/pages/overview/page.tsx) and `subjects`
    // (components/pages/subjects), so the Studio can offer both; `week` is
    // still a key alone and must stay skipped until its own module lands.
    const pages = studioCatalogue().map((c) => c.page)
    expect(pages).toContain('overview')
    expect(pages).toContain('subjects')
    expect(pages).not.toContain('week')
  })

  it('gives the dashboard section its tiles back', () => {
    const dash = studioCatalogue().find((c) => c.page === 'dashboard')
    expect(dash?.tiles.length).toBeGreaterThan(0)
    for (const t of dash!.tiles) expect(t.key.startsWith('dashboard.')).toBe(true)
  })
})
