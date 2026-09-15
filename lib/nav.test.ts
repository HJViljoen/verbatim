import { describe, expect, it } from 'vitest'
import {
  OLD_PAGES, RETIRED_ADDRESSES, SURFACES, hasHorizon, oldPageBanner, oldPageFor,
  oldPagesGroupLabel, retireDate, surface, surfaceForPath, surfacesIn,
} from './nav'
import { OLD_PAGES_RETIRE_ON } from './config'
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
    expect(SURFACES.filter(hasHorizon).map((s) => s.key)).toEqual(['overview', 'subjects', 'voice', 'market', 'competitive'])
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

  it('lights nothing on a page outside the nine', () => {
    expect(surfaceForPath('/dashboard/billing')).toBeNull()
    expect(surfaceForPath('/dashboard/team')).toBeNull()
  })
})

describe('the old pages', () => {
  it('are the three the plan parks, each naming a live replacement', () => {
    expect(OLD_PAGES.map((p) => p.href)).toEqual(['/dashboard/market-intel', '/dashboard/competitive-intel', '/dashboard/videos'])
    for (const p of OLD_PAGES) expect(surface(p.replacedBy).href).toMatch(/^\/dashboard/)
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
  it('are the four nothing stored points at, and land on a live surface', () => {
    expect(Object.keys(RETIRED_ADDRESSES).sort()).toEqual([
      '/dashboard/guide', '/dashboard/profile', '/dashboard/settings/connections', '/dashboard/settings/initiatives',
    ])
    for (const to of Object.values(RETIRED_ADDRESSES)) {
      const path = to.split('#')[0]
      expect(SURFACES.some((s) => path === s.href || path.startsWith(`${s.href}/`))).toBe(true)
    }
  })

  it('never redirects an address one of the nine is serving', () => {
    for (const from of Object.keys(RETIRED_ADDRESSES)) {
      expect(SURFACES.some((s) => s.href === from)).toBe(false)
    }
  })
})
