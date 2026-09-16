import { describe, expect, it } from 'vitest'
import {
  OLD_PAGES, PARKED_INITIATIVES, RETIRED_ADDRESSES, SURFACES, hasHorizon, hasRecord, oldPageBanner, oldPageFor,
  oldPagesGroupLabel, retireDate, surface, surfaceForPath, surfacesIn,
} from './nav'
import { OLD_PAGES_RETIRE_ON } from './config'
import { SETTINGS_ADDRESSES } from './settings/rail'
import { PAGE_KEYS } from './renderables/types'

describe('the nine surfaces', () => {
  it('are in the mock’s order', () => {
    expect(SURFACES.map((s) => s.key)).toEqual([
      'overview', 'subjects', 'voice', 'market', 'competitive', 'week', 'ask', 'reports', 'settings',
    ])
  })

  it('every address is unique and under /dashboard', () => {
    const hrefs = SURFACES.map((s) => s.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    for (const h of hrefs) expect(h.startsWith('/dashboard')).toBe(true)
  })

  it('every page key a surface names is a real page key', () => {
    for (const s of SURFACES) if (s.page) expect(PAGE_KEYS).toContain(s.page)
  })

  it('asks its one question everywhere a reading is made, and nowhere else', () => {
    for (const s of SURFACES) {
      if (s.bar === 'title' && s.key === 'settings') expect(s.question).toBeNull()
      else expect(typeof s.question).toBe('string')
    }
  })

  it('offers a horizon only on a reading of months', () => {
    // Market is a reading and NOT a reading of a window: its conclusions are
    // the latest update's, its ledger is all-time by design. The control used
    // to be drawn there and a press of it returned a byte-identical page.
    expect(SURFACES.filter(hasHorizon).map((s) => s.key)).toEqual(['overview', 'subjects', 'voice', 'competitive'])
    expect(SURFACES.filter(hasRecord).map((s) => s.key)).toContain('market')
  })

  it('states a basis on every reading and on nothing else', () => {
    expect(SURFACES.filter(hasRecord).map((s) => s.key)).toEqual(['overview', 'subjects', 'voice', 'market', 'competitive', 'week'])
  })

  it('splits into the two groups the artboards draw', () => {
    expect(surfacesIn('Intelligence').map((s) => s.key)).toEqual(['overview', 'subjects', 'voice', 'market', 'competitive', 'week', 'ask', 'reports'])
    expect(surfacesIn('Account').map((s) => s.key)).toEqual(['settings'])
  })

  it('looks one up by key and refuses an unknown one', () => {
    expect(surface('voice').label).toBe('Voice')
    // @ts-expect-error not a nav key
    expect(() => surface('videos')).toThrow()
  })
})

describe('surfaceForPath', () => {
  it('matches /dashboard exactly, so every page does not light Overview', () => {
    expect(surfaceForPath('/dashboard')?.key).toBe('overview')
    expect(surfaceForPath('/dashboard/voice')?.key).toBe('voice')
    expect(surfaceForPath('/dashboard/market')?.key).toBe('market')
  })

  it('lights the surface a sub-path belongs to', () => {
    expect(surfaceForPath('/dashboard/settings/tracking')?.key).toBe('settings')
    expect(surfaceForPath('/dashboard/agent/abc-123')?.key).toBe('ask')
  })

  it('does not let a parked page light the page that replaced it', () => {
    expect(surfaceForPath('/dashboard/market-intel')).toBeNull()
    expect(surfaceForPath('/dashboard/competitive-intel')).toBeNull()
    expect(surfaceForPath('/dashboard/videos')).toBeNull()
  })

  it('lights the surface a live page outside the nine belongs to', () => {
    // Three live pages sat outside the rule and a reader inside them saw no
    // mark anywhere. Team and billing are reached from the Settings rail; the
    // Studio is where a report is edited.
    expect(surfaceForPath('/dashboard/billing')?.key).toBe('settings')
    expect(surfaceForPath('/dashboard/team')?.key).toBe('settings')
    expect(surfaceForPath('/dashboard/studio')?.key).toBe('reports')
    expect(surfaceForPath('/dashboard/studio/edit/abc')?.key).toBe('reports')
  })

  it('still lights nothing on a page that belongs to none', () => {
    expect(surfaceForPath('/dashboard/ops/readiness')).toBeNull()
    expect(surfaceForPath('/login')).toBeNull()
  })
})

describe('the old pages', () => {
  it('are the three the plan parks, each naming a live replacement', () => {
    expect(OLD_PAGES.map((p) => p.href)).toEqual(['/dashboard/market-intel', '/dashboard/competitive-intel', '/dashboard/videos'])
    for (const p of OLD_PAGES) expect(surface(p.replacedBy).href).toMatch(/^\/dashboard/)
  })

  it('parks Settings › Initiatives outside the sidebar group, with the same banner', () => {
    const b = oldPageBanner(PARKED_INITIATIVES)
    expect(b.title).toBe('Initiatives is being replaced by Market')
    expect(b.body).toBe('This page stays available until 30 Nov 2026. Renaming, finishing and stopping one happens here until Market can do it.')
    expect(b.href).toBe('/dashboard/market')
    // It is a Settings sub-page, not one of the three the sidebar lists.
    expect(OLD_PAGES.map((p) => p.href)).not.toContain(PARKED_INITIATIVES.href)
    // And it is not redirected any more.
    expect(RETIRED_ADDRESSES[PARKED_INITIATIVES.href]).toBeUndefined()
  })

  it('finds the page a parked path belongs to', () => {
    expect(oldPageFor('/dashboard/market-intel')?.label).toBe('Market Intelligence')
    expect(oldPageFor('/dashboard/videos')?.label).toBe('Content')
    expect(oldPageFor('/dashboard/market')).toBeNull()
  })

  it('dates the group label and the banner off the one constant', () => {
    expect(retireDate()).toBe('30 Nov 2026')
    expect(oldPagesGroupLabel()).toBe('Old pages (retiring 30 Nov 2026)')
    expect(oldPagesGroupLabel()).toContain(retireDate())
    // The constant is what moves the date, not the clock.
    expect(OLD_PAGES_RETIRE_ON).toBe('2026-11-30')
  })

  it('names the replacement and the date in the banner, and says what did not move', () => {
    const market = oldPageBanner(OLD_PAGES[0])
    expect(market.title).toBe('Market Intelligence is being replaced by Market')
    expect(market.body).toBe('This page stays available until 30 Nov 2026.')
    expect(market.cta).toBe('Go to Market')
    expect(market.href).toBe('/dashboard/market')

    const content = oldPageBanner(OLD_PAGES[2])
    expect(content.title).toBe('Content is being replaced by This week')
    expect(content.body).toBe('This page stays available until 30 Nov 2026. Comments worth a reply stay here for now.')
  })
})

describe('the addresses that lose their page', () => {
  it('are the three nothing stored points at AND nothing is lost by, and land on a live surface', () => {
    // Settings › Initiatives was a fourth and is parked instead: it is the only
    // place to rename, finish or stop an initiative, and the panel that takes
    // that job is WP14. A redirect there dropped a capability silently.
    expect(Object.keys(RETIRED_ADDRESSES).sort()).toEqual([
      '/dashboard/guide', '/dashboard/profile', '/dashboard/settings/connections',
    ])
    // An address something actually SERVES, not a sub-path of one that happens
    // to prefix-match: the looser rule once passed for
    // `/dashboard/settings/how-to-read` while no such route existed, and a
    // redirect to a route that does not exist is a bare Next 404 — this app
    // has no `app/not-found.tsx`. The legal targets are the nine's own
    // addresses plus the settings area's seven, which WP16 built.
    const served = [...SURFACES.map((s) => s.href), ...SETTINGS_ADDRESSES]
    for (const to of Object.values(RETIRED_ADDRESSES)) {
      const path = to.split('#')[0]
      expect(served).toContain(path)
    }
  })

  it('never redirects an address one of the nine is serving', () => {
    for (const from of Object.keys(RETIRED_ADDRESSES)) {
      expect(SURFACES.some((s) => s.href === from)).toBe(false)
    }
  })
})
