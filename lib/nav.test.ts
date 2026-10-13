import { describe, expect, it } from 'vitest'
import {
  OLD_PAGES, PARKED_INITIATIVES, RETIRED_ADDRESSES, RETIRED_PAGE_NAMES, SURFACES, TENANT_RETIRED, frontRedirect, hasHorizon,
  oldPageBanner, pageKeyName, retireDate, retiredTo, surface, surfaceForPath, surfacesIn, tenantAway, withQuery, type NavKey,
} from './nav'
import { OLD_PAGES_RETIRE_ON } from './config'
import { SETTINGS_ADDRESSES } from './settings/rail'
import { PAGE_KEYS } from './renderables/types'

describe('the nine surfaces (Design v2)', () => {
  it('are in the sidebar\'s order (every E*.dc.html board; decision 6 of the depth plan)', () => {
    expect(SURFACES.map((s) => s.key)).toEqual([
      'home', 'market', 'voices', 'products', 'content', 'moves', 'ask', 'studio', 'settings',
    ])
  })

  it('carry the boards\' labels, which are the page titles too', () => {
    expect(SURFACES.map((s) => s.label)).toEqual([
      'Dashboard', 'Market', 'Voices', 'Your products', 'Content', 'Your moves', 'Agent', 'Studio', 'Settings',
    ])
    for (const gone of ['Your market', 'This week', 'Conversation', 'Competitive', 'Subjects', 'Brands', 'Ask', 'Reports']) {
      expect(SURFACES.map((s) => s.label)).not.toContain(gone)
    }
  })

  it('sit at the boards\' addresses: Market takes /dashboard/market, Your moves moves to /dashboard/moves', () => {
    expect(SURFACES.map((s) => s.href)).toEqual([
      '/dashboard', '/dashboard/market', '/dashboard/voices', '/dashboard/products', '/dashboard/content', '/dashboard/moves',
      '/dashboard/agent', '/dashboard/studio', '/dashboard/settings',
    ])
  })

  it('ask the boards\' questions', () => {
    expect(Object.fromEntries(SURFACES.map((s) => [s.key, s.question]))).toEqual({
      home: 'What matters this week, across everything?',
      market: 'What is the market talking about?',
      voices: 'Who is saying it, and who matters?',
      products: 'What is being said about what you sell?',
      content: 'What should we post, and what works?',
      moves: 'What should we do as a business, and is it working?',
      ask: 'What does the conversation say about this?',
      studio: 'Which reports go to whom, and where are the past issues?',
      settings: null,
    })
  })

  it('keeps every page key where it was: Market stores as Your market, Voices as Conversation, Your moves as `market`', () => {
    // A page key is a stored contract (snapshots, reports, share links); only
    // the addresses moved. Your products is new and stores under nothing.
    expect(Object.fromEntries(SURFACES.map((s) => [s.key, s.page ?? null]))).toEqual({
      home: null, market: 'overview', voices: 'voice', products: null, content: 'content', moves: 'market',
      ask: 'agent', studio: null, settings: 'settings',
    })
  })

  it('gives the Dashboard /dashboard and no page key', () => {
    // Page key `dashboard` is a stored contract naming the legacy module; the
    // Dashboard must never store under it (page review §5.2).
    expect(surface('home').href).toBe('/dashboard')
    expect(surface('home').page).toBeUndefined()
    expect(SURFACES.map((s) => s.page)).not.toContain('dashboard')
  })

  it('every address is unique and under /dashboard', () => {
    const hrefs = SURFACES.map((s) => s.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    for (const h of hrefs) expect(h.startsWith('/dashboard')).toBe(true)
  })

  it('every page key a surface names is a real page key, named once', () => {
    const pages = SURFACES.flatMap((s) => (s.page ? [s.page] : []))
    for (const p of pages) expect(PAGE_KEYS).toContain(p)
    expect(new Set(pages).size).toBe(pages.length)
  })

  it('asks its one question everywhere but Settings', () => {
    for (const s of SURFACES) {
      if (s.key === 'settings') expect(s.question).toBeNull()
      else expect(typeof s.question).toBe('string')
    }
  })

  it('offers a horizon on no page: each reading page switches its own period', () => {
    expect(SURFACES.filter(hasHorizon).map((s) => s.key)).toEqual([])
  })

  it('gives the bar\'s reading line to the reading pages, the week\'s to Content, and the title alone to the rest', () => {
    expect(SURFACES.filter((s) => s.bar === 'reading').map((s) => s.key)).toEqual(['market', 'voices', 'products', 'moves'])
    expect(SURFACES.filter((s) => s.bar === 'week').map((s) => s.key)).toEqual(['content'])
    expect(SURFACES.filter((s) => s.bar === 'title').map((s) => s.key)).toEqual(['home', 'ask', 'studio', 'settings'])
  })

  it('splits into the boards\' three groups: the six pages, the Agent, the foot', () => {
    expect(surfacesIn('read').map((s) => s.key)).toEqual(['home', 'market', 'voices', 'products', 'content', 'moves'])
    expect(surfacesIn('agent').map((s) => s.key)).toEqual(['ask'])
    expect(surfacesIn('foot').map((s) => s.key)).toEqual(['studio', 'settings'])
  })

  it('looks one up by key and refuses an unknown one, the 1 Oct keys included', () => {
    expect(surface('voices').label).toBe('Voices')
    expect(surface('moves')).toMatchObject({ href: '/dashboard/moves', label: 'Your moves', page: 'market' })
    // @ts-expect-error not a nav key
    expect(() => surface('reports')).toThrow()
    for (const old of ['overview', 'week', 'voice', 'competitive', 'subjects']) {
      expect(() => surface(old as NavKey)).toThrow()
    }
  })
})

describe('a reader\'s name for every page key', () => {
  it('is its surface\'s label where a surface stores under it, and the retired page\'s name otherwise', () => {
    expect(Object.fromEntries(PAGE_KEYS.map((k) => [k, pageKeyName(k)]))).toEqual({
      overview: 'Market',
      subjects: 'Subjects',
      voice: 'Voices',
      market: 'Your moves',
      competitive: 'Competitive',
      week: 'This week',
      agent: 'Agent',
      settings: 'Settings',
      dashboard: 'Dashboard',
      content: 'Content',
      profile: 'Consumer Profile',
    })
  })

  it('names no key a surface already names, so the two never disagree', () => {
    for (const s of SURFACES) if (s.page) expect(RETIRED_PAGE_NAMES[s.page]).toBeUndefined()
  })
})

describe('surfaceForPath', () => {
  it('matches /dashboard exactly, so every page does not light the Dashboard', () => {
    expect(surfaceForPath('/dashboard')?.key).toBe('home')
    expect(surfaceForPath('/dashboard/market')?.key).toBe('market')
    expect(surfaceForPath('/dashboard/voices')?.key).toBe('voices')
    expect(surfaceForPath('/dashboard/products')?.key).toBe('products')
    expect(surfaceForPath('/dashboard/content')?.key).toBe('content')
    expect(surfaceForPath('/dashboard/moves')?.key).toBe('moves')
  })

  it('lights nothing on an old address for the moment its redirect takes, and never a page by prefix', () => {
    // `/dashboard/voice` is not a prefix of `/dashboard/voices`' match: the
    // rule is the address or the address and a slash.
    for (const old of ['/dashboard/overview', '/dashboard/week', '/dashboard/voice', '/dashboard/competitive', '/dashboard/subjects']) {
      expect(surfaceForPath(old)).toBeNull()
    }
    expect(surfaceForPath('/dashboard/market-intel')).toBeNull()
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

  it('withQuery keeps a fragment at the end, after the query', () => {
    expect(withQuery('/dashboard/voices#cast', { month: '2026-09' })).toBe('/dashboard/voices?month=2026-09#cast')
    expect(withQuery('/dashboard/voices#cast')).toBe('/dashboard/voices#cast')
  })

  it('sends /dashboard?month= to Market\'s month view with its whole query, and leaves the Dashboard alone otherwise (page review §5.1)', () => {
    expect(frontRedirect({ month: '2026-09' })).toBe('/dashboard/market?period=month&month=2026-09')
    expect(frontRedirect({ month: '2026-09', theme: 't1' })).toBe('/dashboard/market?period=month&month=2026-09&theme=t1')
    expect(frontRedirect({})).toBeNull()
    expect(frontRedirect({ ask: 'x' })).toBeNull()
    expect(frontRedirect({ month: '' })).toBeNull()
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
    expect(TENANT_RETIRED[PARKED_INITIATIVES.href]).toBe(surface('moves').href)
    // Design v2: Market Intelligence and Initiatives land on Your moves at its
    // new address, Competitive Intelligence on Voices, the old Content on Content.
    expect(TENANT_RETIRED['/dashboard/market-intel']).toBe('/dashboard/moves')
    expect(TENANT_RETIRED['/dashboard/competitive-intel']).toBe('/dashboard/voices')
    expect(TENANT_RETIRED['/dashboard/videos']).toBe('/dashboard/content')
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
    expect(() => tenantAway(tenant, '/dashboard/content')).toThrow()
  })
})

describe('the old pages', () => {
  it('are the three the plan parks, each naming a live replacement', () => {
    expect(OLD_PAGES.map((p) => p.href)).toEqual(['/dashboard/market-intel', '/dashboard/competitive-intel', '/dashboard/videos'])
    for (const p of OLD_PAGES) expect(surface(p.replacedBy).href).toMatch(/^\/dashboard/)
  })

  it('parks Settings › Initiatives apart from the three, with the same banner', () => {
    const b = oldPageBanner(PARKED_INITIATIVES)
    // The replacement by its CURRENT label and address (Your moves, at
    // /dashboard/moves since Design v2).
    expect(b.title).toBe('Initiatives is being replaced by Your moves')
    expect(b.body).toBe('This page stays available until 30 Nov 2026. Renaming, finishing and stopping one happens here until Your moves can do it.')
    expect(b.href).toBe('/dashboard/moves')
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
    expect(market.href).toBe('/dashboard/moves')

    expect(oldPageBanner(OLD_PAGES[1])).toMatchObject({ title: 'Competitive Intelligence is being replaced by Voices', href: '/dashboard/voices' })

    // Content's label went to the page that replaces it, so the parked one is
    // "Old Content": "Content is being replaced by Content" says nothing.
    const content = oldPageBanner(OLD_PAGES[2])
    expect(content.title).toBe('Old Content is being replaced by Content')
    expect(content.cta).toBe('Go to Content')
    expect(content.href).toBe('/dashboard/content')
    // What worked and the comments worth a reply are Content's, so nothing stays behind.
    expect(content.body).toBe('This page stays available until 30 Nov 2026.')
  })
})

describe('the addresses that lose their page', () => {
  it('are Phase 1\'s orphans, Reports, and the five reading pages Design v2 moved, each landing on a live surface', () => {
    // Settings › Initiatives is not one: it retires for tenants only
    // (TENANT_RETIRED) and the operator keeps it. Reports folded into the
    // Studio on 1 Oct, and its page carries the query across.
    expect(Object.keys(RETIRED_ADDRESSES).sort()).toEqual([
      '/dashboard/competitive', '/dashboard/guide', '/dashboard/overview', '/dashboard/profile', '/dashboard/reports',
      '/dashboard/settings/connections', '/dashboard/subjects', '/dashboard/voice', '/dashboard/week',
    ])
    expect(RETIRED_ADDRESSES['/dashboard/reports']).toBe('/dashboard/studio')
    // How to read is cut for clients, so the Guide lands on Settings.
    expect(RETIRED_ADDRESSES['/dashboard/guide']).toBe('/dashboard/settings')
    // Consumer Profile's personas are Voices' groups (they were Conversation's cast).
    expect(RETIRED_ADDRESSES['/dashboard/profile']).toBe('/dashboard/voices')
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

  it('gives each retired address its landing, and refuses one that is not retired', () => {
    for (const from of Object.keys(RETIRED_ADDRESSES)) expect(retiredTo(from).startsWith(RETIRED_ADDRESSES[from].split('#')[0])).toBe(true)
    expect(() => retiredTo('/dashboard/market')).toThrow()
    expect(() => retiredTo('/dashboard/moves')).toThrow()
  })
})
