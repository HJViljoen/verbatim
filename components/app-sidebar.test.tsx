import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'
import { render, renderText } from '@/lib/test/render'
import { AppSidebar } from './app-sidebar'
import { LogOutButton } from './log-out-button'
import { OpsNavGroup } from './ops/ops-nav'

// THE SIDEBAR OF 1 OCT, AS IT PRINTS (`sidebar2.py`; the sidebar of every
// `Page-*.dc.html` artboard). What a static render can pin: the ten rows in the
// design's order and groups, no group label, the hairlines, the Agent's yellow
// row, the active pill with no left bar, and Log out gone from the foot.

const path = vi.hoisted(() => ({ current: '/dashboard/voice' }))
vi.mock('next/navigation', () => ({ usePathname: () => path.current }))
vi.mock('@/app/login/actions', () => ({ signOut: async () => {} }))

const sidebar = (at: string, ops?: React.ReactNode) => {
  path.current = at
  return render(<SidebarProvider><AppSidebar ops={ops} /></SidebarProvider>)
}
const rows = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>.*?<span>([^<]+)<\/span><\/a>/g)].map((m) => [m[2], m[1]])

describe('the sidebar', () => {
  it('draws the ten in the design\'s order, at their addresses', () => {
    expect(rows(sidebar('/dashboard/voice'))).toEqual([
      ['Dashboard', '/dashboard'],
      ['Your market', '/dashboard/overview'],
      ['This week', '/dashboard/week'],
      ['Conversation', '/dashboard/voice'],
      ['Competitive', '/dashboard/competitive'],
      ['Subjects', '/dashboard/subjects'],
      ['Your moves', '/dashboard/market'],
      ['Agent', '/dashboard/agent'],
      ['Studio', '/dashboard/studio'],
      ['Settings', '/dashboard/settings'],
    ])
  })

  it('carries no group label, no Logout, no Reports and none of the old labels', () => {
    const text = renderText(<SidebarProvider><AppSidebar /></SidebarProvider>)
    for (const gone of ['Intelligence', 'Account', 'Logout', 'Log out', 'Reports', 'Brands', 'Ask']) {
      expect(text.split(' '), gone).not.toContain(gone)
    }
  })

  it('separates the groups by two hairlines, 12px in and 8px above and below', () => {
    const html = sidebar('/dashboard')
    const hairlines = html.match(/<div aria-hidden="true" class="mx-3 my-2 h-px shrink-0 bg-\[#E4E2DC\]"><\/div>/g) ?? []
    expect(hairlines).toHaveLength(2)
    // In order: Competitive · hairline · Subjects … Your moves · hairline · Agent.
    const at = (s: string) => html.indexOf(s)
    expect(at('>Competitive<')).toBeLessThan(html.indexOf('h-px'))
    expect(html.indexOf('h-px')).toBeLessThan(at('>Subjects<'))
    expect(html.lastIndexOf('h-px')).toBeGreaterThan(at('>Your moves<'))
    expect(html.lastIndexOf('h-px')).toBeLessThan(at('>Agent<'))
  })

  it('marks the active page with the ink pill and weight, and no left bar (the stripe ban)', () => {
    const html = sidebar('/dashboard/voice')
    expect(html).toContain('aria-current="page"')
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    const active = html.slice(html.lastIndexOf('<a ', html.indexOf('aria-current="page"')), html.indexOf('</a>', html.indexOf('aria-current="page"')))
    expect(active).toContain('data-active="true"')
    expect(active).toContain('>Conversation<')
    expect(active).toContain('data-[active=true]:bg-foreground/[0.07]')
    expect(active).toContain('data-[active=true]:font-semibold')
    // No bar at the pill's edge, on any row.
    expect(html).not.toMatch(/before:w-\[3px\]|before:w-0\.5|before:bg-primary|border-l-/)
  })

  it('draws the Agent as a filled yellow row with the Sparkles icon, on every page', () => {
    for (const at of ['/dashboard', '/dashboard/agent']) {
      const html = sidebar(at)
      const start = html.lastIndexOf('<a ', html.indexOf('>Agent<'))
      const agent = html.slice(start, html.indexOf('</a>', start))
      expect(agent).toContain('bg-[#FFD43B]')
      expect(agent).toContain('font-semibold')
      expect(agent).toContain('lucide-sparkles')
    }
  })

  it('lights the Dashboard on /dashboard alone, and the Studio from Reports\' redirect', () => {
    expect(sidebar('/dashboard')).toMatch(/aria-current="page"[^>]*>.*?<span>Dashboard<\/span>/)
    expect(sidebar('/dashboard/overview')).toMatch(/aria-current="page"[^>]*>.*?<span>Your market<\/span>/)
    expect(sidebar('/dashboard/reports')).toMatch(/aria-current="page"[^>]*>.*?<span>Studio<\/span>/)
  })

  it('puts the operator\'s group above the Studio, drawn with the same rows', () => {
    const html = sidebar('/dashboard/ops/readiness', <OpsNavGroup />)
    expect(html.indexOf('>Readiness<')).toBeGreaterThan(html.indexOf('>Agent<'))
    expect(html.indexOf('>Readiness<')).toBeLessThan(html.indexOf('>Studio<'))
    expect(html).toMatch(/aria-current="page"[^>]*>.*?<span>Readiness<\/span>/)
    expect(renderText(<SidebarProvider><OpsNavGroup /></SidebarProvider>)).not.toContain('Operator')
  })

  it('is 281px wide as the artboards render it (256px rows, 12px in, the hairline) with no shadow', () => {
    expect(readFileSync('app/dashboard/layout.tsx', 'utf8')).toContain("'--sidebar-width': '281px'")
    expect(sidebar('/dashboard')).toContain('border-r-[#E4E2DC]')
    expect(readFileSync('app/globals.css', 'utf8')).not.toMatch(/\[data-slot="sidebar-inner"\]\s*\{\s*box-shadow/)
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
