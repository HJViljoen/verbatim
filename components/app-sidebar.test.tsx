import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'
import { render, renderText } from '@/lib/test/render'
import { AppSidebar } from './app-sidebar'
import { LogOutButton } from './log-out-button'
import { OpsNavGroup } from './ops/ops-nav'
import { SidebarClientName, SidebarNamePending } from './sidebar-client-name'

// THE SIDEBAR OF THE AUDIT DESIGN, AS IT PRINTS (the sidebar of every board,
// Market-After.dc.html the reference). What a static render can pin: the nine
// rows in the boards' order, no group label, the one hairline, the Agent an
// ordinary row, the active pill with no left bar, and Log out gone from the
// foot.

const path = vi.hoisted(() => ({ current: '/dashboard/voices' }))
vi.mock('next/navigation', () => ({ usePathname: () => path.current }))
vi.mock('@/app/login/actions', () => ({ signOut: async () => {} }))

const sidebar = (at: string, ops?: React.ReactNode) => {
  path.current = at
  return render(<SidebarProvider><AppSidebar ops={ops} /></SidebarProvider>)
}
const rows = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>.*?<span>([^<]+)<\/span><\/a>/g)].map((m) => [m[2], m[1]])

describe('the sidebar', () => {
  it('draws the nine in the design\'s order, at their addresses', () => {
    expect(rows(sidebar('/dashboard/voices'))).toEqual([
      ['Dashboard', '/dashboard'],
      ['Market', '/dashboard/market'],
      ['Voices', '/dashboard/voices'],
      ['Your products', '/dashboard/products'],
      ['Content', '/dashboard/content'],
      ['Your moves', '/dashboard/moves'],
      ['Agent', '/dashboard/agent'],
      ['Studio', '/dashboard/studio'],
      ['Settings', '/dashboard/settings'],
    ])
  })

  it('draws each row with its board glyph', () => {
    const html = sidebar('/dashboard')
    const glyph = (label: string) => {
      const end = html.indexOf(`<span>${label}</span>`)
      return html.slice(html.lastIndexOf('<a ', end), end)
    }
    expect(glyph('Market')).toContain('lucide-message-square-text')
    expect(glyph('Voices')).toContain('lucide-users')
    expect(glyph('Your products')).toContain('lucide-box')
    expect(glyph('Content')).toContain('lucide-square-play')
    expect(glyph('Your moves')).toContain('lucide-target')
  })

  it('carries no group label, no Logout, no Reports and none of the old labels', () => {
    const text = renderText(<SidebarProvider><AppSidebar /></SidebarProvider>)
    for (const gone of ['Intelligence', 'Account', 'Logout', 'Log out', 'Reports', 'Brands', 'Ask', 'Conversation', 'Competitive', 'Subjects']) {
      expect(text.split(' '), gone).not.toContain(gone)
    }
    for (const gone of ['Your market', 'This week']) expect(text, gone).not.toContain(gone)
  })

  it('draws one hairline of the track, 12px in and 12px above and below: after the Agent, with the Studio and Settings right under it (the audit design)', () => {
    const html = sidebar('/dashboard')
    const hairlines = html.match(/<div aria-hidden="true" class="mx-3 my-3 h-px shrink-0 bg-track"><\/div>/g) ?? []
    expect(hairlines).toHaveLength(1)
    expect(html.match(/h-px/g)).toHaveLength(1)
    // In order: … Your moves · Agent · hairline · Studio · Settings.
    const at = (s: string) => html.indexOf(s)
    expect(at('>Your moves<')).toBeLessThan(at('>Agent<'))
    expect(at('>Agent<')).toBeLessThan(html.indexOf('h-px'))
    expect(html.indexOf('h-px')).toBeLessThan(at('>Studio<'))
    // No foot pinned to the bottom: the Studio and Settings sit in the content.
    expect(html).not.toContain('data-slot="sidebar-footer"')
  })

  it('draws the boards\' rows: 40px, 15px, an 8px radius, the icon 19px at a 1.8 stroke in the muted ink', () => {
    const html = sidebar('/dashboard/voices')
    const start = html.lastIndexOf('<a ', html.indexOf('>Market<'))
    const row = html.slice(start, html.indexOf('</a>', start))
    expect(row).toContain('h-10 gap-3.5 rounded-[8px] px-3 text-[15px]')
    expect(row).toContain('[&amp;_svg]:size-[19px]')
    expect(row).not.toContain('[&amp;_svg]:size-4')
    expect(row).toMatch(/<svg [^>]*stroke-width="1.8"[^>]*class="[^"]*size-\[19px\] text-muted-foreground"/)
    const lit = html.slice(html.lastIndexOf('<a ', html.indexOf('aria-current="page"')), html.indexOf('</a>', html.indexOf('aria-current="page"')))
    expect(lit).toMatch(/<svg [^>]*stroke-width="1.9"[^>]*class="[^"]*size-\[19px\] text-orange-text"/)
  })

  it('marks the active page with the pale-yellow pill (a selected state), weight and an orange-text icon, and no left bar (the stripe ban)', () => {
    const html = sidebar('/dashboard/voices')
    expect(html).toContain('aria-current="page"')
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    const active = html.slice(html.lastIndexOf('<a ', html.indexOf('aria-current="page"')), html.indexOf('</a>', html.indexOf('aria-current="page"')))
    expect(active).toContain('data-active="true"')
    expect(active).toContain('>Voices<')
    expect(active).toContain('data-[active=true]:bg-accent')
    expect(active).toContain('data-[active=true]:font-semibold')
    expect(active).toContain('text-orange-text')
    // No bar at the pill's edge, on any row.
    expect(html).not.toMatch(/before:w-\[3px\]|before:w-0\.5|before:bg-primary|border-l-/)
  })

  it('draws the Agent as an ordinary row with the Sparkles icon, lit only on its own page (the audit design)', () => {
    for (const at of ['/dashboard', '/dashboard/agent']) {
      const html = sidebar(at)
      const start = html.lastIndexOf('<a ', html.indexOf('>Agent<'))
      const agent = html.slice(start, html.indexOf('</a>', start))
      expect(agent).not.toContain('bg-[#FFD43B]')
      expect(agent).not.toContain('bg-brand')
      expect(agent).toContain('h-10 gap-3.5 rounded-[8px] px-3 text-[15px]')
      expect(agent).toContain('lucide-sparkles')
      expect(agent).toContain(at === '/dashboard/agent' ? 'data-active="true"' : 'data-active="false"')
    }
  })

  it('lights the Dashboard on /dashboard alone, each page on its own address, and the Studio from Reports\' redirect', () => {
    expect(sidebar('/dashboard')).toMatch(/aria-current="page"[^>]*>.*?<span>Dashboard<\/span>/)
    expect(sidebar('/dashboard/market')).toMatch(/aria-current="page"[^>]*>.*?<span>Market<\/span>/)
    expect(sidebar('/dashboard/products')).toMatch(/aria-current="page"[^>]*>.*?<span>Your products<\/span>/)
    expect(sidebar('/dashboard/content')).toMatch(/aria-current="page"[^>]*>.*?<span>Content<\/span>/)
    expect(sidebar('/dashboard/moves')).toMatch(/aria-current="page"[^>]*>.*?<span>Your moves<\/span>/)
    expect(sidebar('/dashboard/reports')).toMatch(/aria-current="page"[^>]*>.*?<span>Studio<\/span>/)
  })

  it('puts the operator\'s group last, under Settings, drawn with the same rows, so its late arrival on a hard load moves none of the nine (T1.8)', () => {
    const html = sidebar('/dashboard/ops/readiness', <OpsNavGroup />)
    expect(html.indexOf('>Readiness<')).toBeGreaterThan(html.indexOf('>Settings<'))
    expect(html.indexOf('h-px')).toBeLessThan(html.indexOf('>Studio<'))
    expect(html.match(/h-px/g)).toHaveLength(1)
    // The nine keep their order and come first; the group is 4px under Settings.
    expect(rows(html).map(([label]) => label)).toEqual(['Dashboard', 'Market', 'Voices', 'Your products', 'Content', 'Your moves', 'Agent', 'Studio', 'Settings', 'Readiness', 'Costs', 'Dad'])
    expect(render(<SidebarProvider><OpsNavGroup /></SidebarProvider>)).toMatch(/<ul data-slot="sidebar-menu"[^>]*class="[^"]*flex-col mt-1 gap-1"/)
    expect(html).toMatch(/aria-current="page"[^>]*>.*?<span>Readiness<\/span>/)
    expect(renderText(<SidebarProvider><OpsNavGroup /></SidebarProvider>)).not.toContain('Operator')
  })

  it('gives the operator Costs after Readiness, lit on its own page', () => {
    const html = sidebar('/dashboard/ops/costs', <OpsNavGroup />)
    expect(html).toContain('href="/dashboard/ops/costs"')
    expect(html.indexOf('>Costs<')).toBeGreaterThan(html.indexOf('>Readiness<'))
    expect(html.indexOf('>Costs<')).toBeGreaterThan(html.indexOf('>Settings<'))
    expect(html).toMatch(/aria-current="page"[^>]*>.*?<span>Costs<\/span>/)
  })

  it('gives the operator Dad after Costs, lit on its own page', () => {
    const html = sidebar('/dashboard/ops/loan', <OpsNavGroup />)
    expect(html).toContain('href="/dashboard/ops/loan"')
    expect(html.indexOf('>Dad<')).toBeGreaterThan(html.indexOf('>Costs<'))
    expect(html.indexOf('>Dad<')).toBeGreaterThan(html.indexOf('>Settings<'))
    expect(html).toMatch(/aria-current="page"[^>]*>.*?<span>Dad<\/span>/)
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
  })

  it('is 281px wide as the artboards render it (256px rows, 12px in), its edge a 1px rule of the track with no shadow (the audit design)', () => {
    expect(readFileSync('app/dashboard/layout.tsx', 'utf8')).toContain("'--sidebar-width': '281px'")
    const html = sidebar('/dashboard')
    expect(html).toMatch(/data-slot="sidebar-container"[^>]*class="[^"]*border-r border-track/)
    expect(html).not.toContain('shadow-sidebar')
    // The token stays defined, in both themes (drift guard (g)).
    const css = readFileSync('app/globals.css', 'utf8')
    expect(css).toContain('--shadow-sidebar: var(--shadow-sidebar);')
    expect(css.match(/^\s*--shadow-sidebar: \d/gm)).toHaveLength(2)
  })
})

describe('the header a client sees (the audit design, decision 13)', () => {
  it('is the yellow mark beside the client\'s own name at 17px bold ink, in the boards\' 46px row, with no arrow and nothing to press', () => {
    const html = render(<SidebarClientName name="Össur" />)
    expect(html).toMatch(/^<div class="flex h-\[46px\] min-w-0 items-center gap-3 px-3"><svg[^>]*class="[^"]*shrink-0 text-brand[^"]*"/)
    expect(html).toContain('<span class="min-w-0 truncate text-[17px] font-bold tracking-[-0.01em] text-foreground">Össur</span>')
    expect(html).not.toMatch(/<button|lucide-chevrons-up-down|aria-haspopup/)
    expect(renderText(<SidebarClientName name="Össur" />)).toBe('Össur')
  })
})

// T1.8 (9 Nov): on a hard load the header showed the "Verbatim" wordmark
// until the session resolved, then the name replaced it (a blink). The
// layout's fallback is now the name's own row with a bone where it lands.
describe('the header while the session resolves (T1.8)', () => {
  it('is the name\'s own 46px row, the mark where it sits and one bone where the name lands, with no word', () => {
    const html = render(<SidebarNamePending />)
    const row = html.match(/^<div [^>]*class="([^"]+)"/)![1]
    expect(row).toBe(render(<SidebarClientName name="Össur" />).match(/^<div class="([^"]+)"/)![1])
    expect(html).toMatch(/^<div data-sidebar-name-pending="" class="flex h-\[46px\] min-w-0 items-center gap-3 px-3"><svg[^>]*class="[^"]*shrink-0 text-brand[^"]*"/)
    expect(html).toContain('<span aria-hidden="true" class="block animate-pulse rounded-[4px] bg-muted h-4 w-16"></span>')
    expect(renderText(<SidebarNamePending />)).toBe('')
  })

  it('is the layout\'s fallback, so the sidebar prints no wordmark text while the session resolves', () => {
    const layout = readFileSync('app/dashboard/layout.tsx', 'utf8')
    expect(layout).toContain('<Suspense fallback={<SidebarNamePending />}>')
    expect(layout).not.toContain('fallback={<SidebarWordmark />}')
    const html = render(<SidebarProvider><AppSidebar header={<SidebarNamePending />} /></SidebarProvider>)
    expect(html).toContain('data-sidebar-name-pending=""')
    expect(renderText(<SidebarProvider><AppSidebar header={<SidebarNamePending />} /></SidebarProvider>)).not.toContain('Verbatim')
  })

  it('lands the operator\'s rows with the header: both loaders await the one request-cached read', () => {
    const ops = readFileSync('components/ops/ops-nav-loader.tsx', 'utf8')
    const head = readFileSync('components/workspace-switcher-loader.tsx', 'utf8')
    expect(ops).toContain('await sidebarHeaderRead()')
    expect(ops).not.toContain('getSessionContext')
    expect(head).toContain('export const sidebarHeaderRead = cache(async () => {')
    expect(head).toContain('const read = await sidebarHeaderRead()')
  })
})

describe('Log out, for the Settings bar', () => {
  it('is a form posting to the sign-out action, drawn as the design\'s 40px white button', () => {
    const html = render(<LogOutButton />)
    expect(html).toMatch(/^<form/)
    expect(html).toContain('type="submit"')
    expect(html).toContain('h-10')
    expect(html).toContain('rounded-[10px]')
    expect(html).toContain('border-[#E4E2DC]')
    expect(html).toContain('lucide-log-out')
    // (A mocked action is not a server reference, so React adds its replay
    // script after the button; the words on the button are what is pinned.)
    expect(renderText(<LogOutButton />)).toMatch(/^Log out /)
  })
})
