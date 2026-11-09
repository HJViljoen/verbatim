import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { SidebarProvider } from '@/components/ui/sidebar'
import { PhoneWordmark } from '@/components/workspace-switcher-loader'
import { PhoneTopBar } from './phone-bar'

// The wordmark's face is next/font, which only Next's compiler runs; the
// loaders' reads are never called here.
vi.mock('next/font/google', () => ({ Bricolage_Grotesque: () => ({ className: 'font-wordmark' }) }))
vi.mock('@/lib/auth', () => ({ getSessionContext: async () => { throw new Error('not in a render test') } }))
vi.mock('@/lib/workspaces', () => ({ listWorkspaces: async () => [] }))
vi.mock('@/components/workspace-switcher', () => ({ WorkspaceSwitcher: () => null }))

// THE PHONE'S TOP BAR (depth v2, T9; E1-Dashboard-Phone's `.ptop`). Below 768
// the sidebar is a drawer and this bar stands in for it: the wordmark and the
// workspace's name, and the menu button that opens the drawer, whose rows are
// the sidebar's own (lib/nav.ts).

const bar = () => render(
  <SidebarProvider>
    <PhoneTopBar brand={<span data-brand="">Verbatim Össur</span>} />
  </SidebarProvider>,
)

describe('PhoneTopBar', () => {
  it('is a white bar with a hairline under it, drawn only below 768 and never on paper', () => {
    const m = bar()
    expect(m).toMatch(/<header data-phone-bar="" class="[^"]*"/)
    for (const c of ['md:hidden', 'print:hidden', 'bg-white', 'border-b', 'border-[#E4E2DC]', 'px-4', 'py-3']) expect(m).toContain(c)
    // 12px of padding round a 44px button keeps the bar at 68px.
    expect(m).not.toContain('py-3.5')
  })

  it('holds the brand slot on the left and the menu button on the right', () => {
    const m = bar()
    expect(m.indexOf('data-brand')).toBeLessThan(m.indexOf('<button'))
    expect(m).toMatch(/<button type="button" aria-label="Open navigation" aria-expanded="false" class="[^"]*size-11[^"]*rounded-lg[^"]*bg-\[#F7F6F2\]/)
    // 44px to tap (the standing rule; the real-data pass, 8 Nov, measured 40).
    expect(m).not.toContain('size-10')
    // The lucide menu glyph, decorative.
    expect(m).toMatch(/<svg[^>]*lucide-menu[^>]*aria-hidden="true"/)
  })
})

// T1.8 (9 Nov): while the session resolves the bar draws a bone where the
// name lands (13px, 4px after the word), never a bare wordmark that grows.
describe('PhoneWordmark', () => {
  it('draws the wordmark and, while the session resolves, a bone where the name lands', () => {
    const pending = render(<PhoneWordmark pending />)
    expect(pending).toContain('<span aria-hidden="true" class="block animate-pulse rounded-[4px] bg-muted ml-1 h-3 w-12"></span>')
    expect(renderText(<PhoneWordmark pending />)).toBe('Verbatim')
    const named = render(<PhoneWordmark name="Sealand" />)
    expect(named).toContain('<span class="ml-1 min-w-0 truncate text-[13px] text-muted-foreground">Sealand</span>')
    expect(named).not.toContain('animate-pulse')
    expect(render(<PhoneWordmark />)).not.toContain('animate-pulse')
  })
})

describe('the dashboard layout on a phone', () => {
  const layout = readFileSync('app/dashboard/layout.tsx', 'utf8')

  it('draws the top bar above <main> in the pane, and no floating trigger', () => {
    expect(layout).toContain('<PhoneTopBar')
    expect(layout).not.toContain('<SidebarTrigger')
    expect(layout.indexOf('<PhoneTopBar')).toBeLessThan(layout.indexOf('<main className'))
    // The brand streams: the wordmark and a bone where the name lands at once,
    // the workspace's name after the session (T1.8).
    expect(layout).toContain('<Suspense fallback={<PhoneWordmark pending />}>')
    expect(layout).toContain('<PhoneWordmarkLoader />')
  })

  it('gives <main> the board\'s 16px gutters and 18px over the title on a phone, and from 768 the audit design\'s 36/40/48', () => {
    expect(layout).toContain('<main className="relative z-10 flex-1 min-h-0 overflow-y-auto px-4 pt-[18px] pb-12 md:px-10 md:pt-9 md:pb-12">')
  })

  it('the shots harness draws the same shell', () => {
    const harness = readFileSync('scripts/pages-shots.ts', 'utf8')
    expect(harness).toContain('h(PhoneTopBar, { brand: phoneBrand() })')
    expect(harness).toContain('px-4 pt-[18px] pb-12 md:px-10 md:pt-9 md:pb-12')
  })
})
