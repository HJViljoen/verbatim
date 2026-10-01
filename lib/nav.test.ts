import { describe, expect, it } from 'vitest'
import {
  OLD_PAGES, PARKED_INITIATIVES, RETIRED_ADDRESSES, SURFACES, TENANT_RETIRED, frontRedirect, hasHorizon, oldPageBanner,
  retireDate, surface, surfaceForPath, surfacesIn, tenantAway, withQuery,
} from './nav'
import { OLD_PAGES_RETIRE_ON } from './config'
import { SETTINGS_ADDRESSES } from './settings/rail'
import { PAGE_KEYS } from './renderables/types'

describe('the ten surfaces', () => {
  it('are in the sidebar\'s order (the navigation of 1 Oct, page review §4)', () => {
    expect(SURFACES.map((s) => s.key)).toEqual([
      'home', 'overview', 'week', 'voice', 'competitive', 'subjects', 'market', 'ask', 'studio', 'settings',
    ])
  })

  it('carry the design\'s labels: Competitive again, Agent for Ask, and no Reports', () => {
    expect(SURFACES.map((s) => s.label)).toEqual([
      'Dashboard', 'Your market', 'This week', 'Conversation', 'Competitive', 'Subjects', 'Your moves', 'Agent', 'Studio', 'Settings',
    ])
    // Labels only: the keys, the addresses and the page keys stay, so no
    // stored link or report breaks.
    expect(surface('competitive')).toMatchObject({ href: '/dashboard/competitive', page: 'competitive' })
    expect(surface('ask')).toMatchObject({ href: '/dashboard/agent', page: 'agent' })
    expect(SURFACES.map((s) => s.label)).not.toContain('Brands')
    expect(SURFACES.map((s) => s.label)).not.toContain('Ask')
    expect(SURFACES.map((s) => s.label)).not.toContain('Reports')
    expect(surface('competitive').question).toBe('Which brands come up in your market, and what is said around them?')
    expect(surface('voice').question).toBe('Everything your market talked about, in full')
  })

  it('gives the Dashboard /dashboard and no page key, and moves Your market to /dashboard/overview', () => {
    // Page key `dashboard` is a stored contract naming the legacy module; the
    // Dashboard must never store under it (page review §5.2).
    expect(surface('home').href).toBe('/dashboard')
    expect(surface('home').page).toBeUndefined()
    expect(SURFACES.map((s) => s.page)).not.toContain('dashboard')
    expect(surface('overview')).toMatchObject({ href: '/dashboard/overview', page: 'overview', label: 'Your market' })
  })

  it('every address is unique and under /dashboard', () => {
    const hrefs = SURFACES.map((s) => s.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    for (const h of hrefs) expect(h.startsWith('/dashboard')).toBe(true)
  })

  it('every page key a surface names is a real page key', () => {
    for (const s of SURFACES) if (s.page) expect(PAGE_KEYS).toContain(s.page)
  })

  it('asks its one question everywhere but Settings', () => {
    for (const s of SURFACES) {
      if (s.key === 'settings') expect(s.question).toBeNull()
      else expect(typeof s.question).toBe('string')
    }
  })

  it('offers a horizon on no page today', () => {
    // Every reading page reads its month in every block, so the four pills
    // would return a byte-identical page.
    expect(SURFACES.filter(hasHorizon).map((s) => s.key)).toEqual([])
    expect(SURFACES.find((s) => s.key === 'market')?.bar).toBe('reading')
  })

  it('gives the bar\'s one line to every reading and to This week, and to nothing else (25 Sep rulings)', () => {
    expect(SURFACES.filter((s) => s.bar === 'reading').map((s) => s.key)).toEqual(['overview', 'voice', 'competitive', 'subjects', 'market'])
    expect(SURFACES.filter((s) => s.bar === 'week').map((s) => s.key)).toEqual(['week'])
    expect(SURFACES.filter((s) => s.bar === 'title').map((s) => s.key)).toEqual(['home', 'ask', 'studio', 'settings'])
  })

  it('splits into the design\'s four groups: the market, what you steer, the Agent, the foot', () => {
    expect(surfacesIn('read').map((s) => s.key)).toEqual(['home', 'overview', 'week', 'voice', 'competitive'])
    expect(surfacesIn('steer').map((s) => s.key)).toEqual(['subjects', 'market'])
    expect(surfacesIn('agent').map((s) => s.key)).toEqual(['ask'])
    expect(surfacesIn('foot').map((s) => s.key)).toEqual(['studio', 'settings'])
  })

  it('looks one up by key and refuses an unknown one', () => {
    expect(surface('voice').label).toBe('Conversation')
    // @ts-expect-error not a nav key
    expect(() => surface('reports')).toThrow()
  })
})

describe('surfaceForPath', () => {
  it('matches /dashboard exactly, so every page does not light the Dashboard', () => {
    expect(surfaceForPath('/dashboard')?.key).toBe('home')
    expect(surfaceForPath('/dashboard/overview')?.key).toBe('overview')
    expect(surfaceForPath('/dashboard/voice')?.key).toBe('voice')
    expect(surfaceForPath('/dashboard/market')?.key).toBe('market')
  })

  it('lights the surface a sub-path belongs to', () => {
    expect(surfaceForPath('/dashboard/settings/tracking')?.key).toBe('settings')
    expect(surfaceForPath('/dashboard/agent/abc-123')?.key).toBe('ask')
    expect(surfaceForPath('/dashboard/studio')?.key).toBe('studio')
    expect(surfaceForPath('/dashboard/studio/edit/abc')?.key).toBe('studio')
  })

  it('does not let a parked page light the page that replaced it', () => {
    expect(surfaceForPath('/dashboard/market-intel')).toBeNull()
    expect(surfaceForPath('/dashboard/competitive-intel')).toBeNull()
    expect(surfaceForPath('/dashboard/videos')).toBeNull()
  })

  it('lights the surface a live address outside the ten belongs to', () => {
    // Team and billing are reached from the Settings rail; Reports only
    // redirects into the Studio now (the inverse of the old mapping).
    expect(surfaceForPath('/dashboard/billing')?.key).toBe('settings')
    expect(surfaceForPath('/dashboard/team')?.key).toBe('settings')
    expect(surfaceForPath('/dashboard/reports')?.key).toBe('studio')
    expect(surfaceForPath('/dashboard/reports/abc')?.key).toBe('studio')
  })

  it('still lights nothing on a page that belongs to none', () => {
    expect(surfaceForPath('/dashboard/ops/readiness')).toBeNull()
    expect(surfaceForPath('/login')).toBeNull()
  })
})

describe('the redirects that keep a query', () => {
  it('withQuery keeps every value, repeated keys too, and adds nothing when there are none', () => {
    expect(withQuery('/dashboard/studio')).toBe('/dashboard/studio')
    expect(withQuery('/dashboard/studio', { group: 'sent', item: 'a b', skip: undefined })).toBe('/dashboard/studio?group=sent&item=a+b')
    expect(withQuery('/x', { k: ['1', '2'] })).toBe('/x?k=1&k=2')
  })

  it('sends /dashboard?month= to Your market with its whole query, and leaves the Dashboard alone otherwise (page review §5.1)', () => {
    expect(frontRedirect({ month: '2026-09' })).toBe('/dashboard/overview?month=2026-09')
    expect(frontRedirect({ month: '2026-09', theme: 't1' })).toBe('/dashboard/overview?month=2026-09&theme=t1')
    expect(frontRedirect({})).toBeNull()
    expect(frontRedirect({ ask: 'x' })).toBeNull()
  })
})

describe('the addresses a tenant no longer reaches (U12, U7)', () => {
  const tenant = { operator: null }
  const operator = { operator: { homeClientId: 'c1', viewingClientId: 'c2', viewingName: 'Sealand', isHome: false } }

  it('are the three parked pages, Initiatives, and the three Settings pages cut for clients', () => {
    expect(Object.keys(TENANT_RETIRED).sort()).toEqual([
      '/dashboard/competitive-intel', '/dashboard/market-intel',
      '/dashboard/settings/how-to-read', '/dashboard/settings/initiatives', '/dashboard/settings/readiness', '/dashboard/settings/record',
      '/dashboard/videos',
    ])
    for (const p of OLD_PAGES) expect(TENANT_RETIRED[p.href]).toBe(surface(p.replacedBy).href)
    expect(TENANT_RETIRED[PARKED_INITIATIVES.href]).toBe(surface('market').href)
  })

  it('land a tenant on an address something serves, and let the operator stay', () => {
    const served = [...SURFACES.map((s) => s.href), ...SETTINGS_ADDRESSES]
    for (const [from, to] of Object.entries(TENANT_RETIRED)) {
      expect(served).toContain(to)
      expect(tenantAway(tenant, from)).toBe(to)
      expect(tenantAway(operator, from)).toBeNull()
    }
  })

  it('refuses an address that is not retired: a page asking for its way out must have one', () => {
    expect(() => tenantAway(tenant, '/dashboard/week')).toThrow()
  })
})

describe('the old pages', () => {
  it('are the three the plan parks, each naming a live replacement', () => {
    expect(OLD_PAGES.map((p) => p.href)).toEqual(['/dashboard/market-intel', '/dashboard/competitive-intel', '/dashboard/videos'])
    for (const p of OLD_PAGES) expect(surface(p.replacedBy).href).toMatch(/^\/dashboard/)
  })

  it('parks Settings › Initiatives apart from the three, with the same banner', () => {
    const b = oldPageBanner(PARKED_INITIATIVES)
    // The replacement by its CURRENT label (deploy 2 renames Market "Your moves").
    expect(b.title).toBe('Initiatives is being replaced by Your moves')
    expect(b.body).toBe('This page stays available until 30 Nov 2026. Renaming, finishing and stopping one happens here until Your moves can do it.')
    expect(b.href).toBe('/dashboard/market')
    // It is a Settings sub-page, not one of the three parked reading pages.
    expect(OLD_PAGES.map((p) => p.href)).not.toContain(PARKED_INITIATIVES.href)
    // And it is not redirected any more.
    expect(RETIRED_ADDRESSES[PARKED_INITIATIVES.href]).toBeUndefined()
  })

  it('dates the banner off the one constant', () => {
    expect(retireDate()).toBe('30 Nov 2026')
    // The constant is what moves the date, not the clock.
    expect(OLD_PAGES_RETIRE_ON).toBe('2026-11-30')
  })

  it('names the replacement and the date in the banner, and says what did not move', () => {
    const market = oldPageBanner(OLD_PAGES[0])
    expect(market.title).toBe('Market Intelligence is being replaced by Your moves')
    expect(market.body).toBe('This page stays available until 30 Nov 2026.')
    expect(market.cta).toBe('Go to Your moves')
    expect(market.href).toBe('/dashboard/market')

    const content = oldPageBanner(OLD_PAGES[2])
    expect(content.title).toBe('Content is being replaced by This week')
    // Comments worth a reply are on This week now, so nothing stays behind.
    expect(content.body).toBe('This page stays available until 30 Nov 2026.')
  })
})

describe('the addresses that lose their page', () => {
  it('are the three nothing stored points at AND nothing is lost by, plus Reports, and land on a live surface', () => {
    // Settings › Initiatives is not one: it retires for tenants only
    // (TENANT_RETIRED) and the operator keeps it. Reports folded into the
    // Studio on 1 Oct, and its page carries the query across.
    expect(Object.keys(RETIRED_ADDRESSES).sort()).toEqual([
      '/dashboard/guide', '/dashboard/profile', '/dashboard/reports', '/dashboard/settings/connections',
    ])
    expect(RETIRED_ADDRESSES['/dashboard/reports']).toBe('/dashboard/studio')
    // How to read is cut for clients, so the Guide lands on Settings.
    expect(RETIRED_ADDRESSES['/dashboard/guide']).toBe('/dashboard/settings')
    // An address something actually SERVES, not a sub-path of one that happens
    // to prefix-match: the looser rule once passed for
    // `/dashboard/settings/how-to-read` while no such route existed, and a
    // redirect to a route that does not exist is a bare Next 404 — this app
    // has no `app/not-found.tsx`. The legal targets are the ten's own
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
