import { describe, expect, it } from 'vitest'
import { pickableCatalogue, studioCatalogue } from './catalogue'
import { ALL_SECTION_PAGES, SECTION_PAGES, isPickablePage } from './types'

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

  it('skips a page key that has no module yet', () => {
    // `overview`, `subjects` and `week` are keys WP11/WP12/WP15 register.
    const pages = studioCatalogue().map((c) => c.page)
    expect(pages).not.toContain('overview')
  })

  it('gives the dashboard section its tiles back', () => {
    const dash = studioCatalogue().find((c) => c.page === 'dashboard')
    expect(dash?.tiles.length).toBeGreaterThan(0)
    for (const t of dash!.tiles) expect(t.key.startsWith('dashboard.')).toBe(true)
  })
})

// ONE RULE FOR "WHAT MAY BE ADDED TODAY" (Block D wave 2). The editor's picker
// and the Studio card on the Reports page both advertise the catalogue, and a
// card offering a page the picker does not is a promise the next screen
// breaks. The predicate lives in `./types` — which imports a type and nothing
// else — because the picker is a CLIENT component and this module imports the
// page registry.
describe('pickableCatalogue', () => {
  it('offers no page a new section may not name', () => {
    for (const c of pickableCatalogue()) {
      expect(isPickablePage(c.page)).toBe(true)
      expect(SECTION_PAGES).toContain(c.page)
    }
  })

  it('offers nothing retired, and never the agent page', () => {
    const pages = pickableCatalogue().map((c) => c.page)
    expect(pages).not.toContain('dashboard')
    expect(pages).not.toContain('agent')
  })

  // A page with no module cannot be rendered into a report, so the list is the
  // registry narrowed by the rule and not the rule on its own.
  it('is the registry narrowed by the rule, not the rule alone', () => {
    expect(pickableCatalogue().length).toBeLessThan(SECTION_PAGES.length)
    expect(pickableCatalogue().length).toBeGreaterThan(0)
  })
})
