import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { render } from '@/lib/test/render'
import { SidebarProvider } from '@/components/ui/sidebar'
import { PhoneTopBar } from './phone-bar'

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
    for (const c of ['md:hidden', 'print:hidden', 'bg-white', 'border-b', 'border-[#E4E2DC]', 'px-4', 'py-3.5']) expect(m).toContain(c)
  })

  it('holds the brand slot on the left and the menu button on the right', () => {
    const m = bar()
    expect(m.indexOf('data-brand')).toBeLessThan(m.indexOf('<button'))
    expect(m).toMatch(/<button type="button" aria-label="Open navigation" aria-expanded="false" class="[^"]*size-10[^"]*rounded-lg[^"]*bg-\[#F7F6F2\]/)
    // The lucide menu glyph, decorative.
    expect(m).toMatch(/<svg[^>]*lucide-menu[^>]*aria-hidden="true"/)
  })
})

describe('the dashboard layout on a phone', () => {
  const layout = readFileSync('app/dashboard/layout.tsx', 'utf8')

  it('draws the top bar above <main> in the pane, and no floating trigger', () => {
    expect(layout).toContain('<PhoneTopBar')
    expect(layout).not.toContain('<SidebarTrigger')
    expect(layout.indexOf('<PhoneTopBar')).toBeLessThan(layout.indexOf('<main className'))
    // The brand streams: the wordmark at once, the workspace's name after the session.
    expect(layout).toContain('<Suspense fallback={<PhoneWordmark />}>')
    expect(layout).toContain('<PhoneWordmarkLoader />')
  })

  it('gives <main> the board\'s 16px gutters and 18px over the title on a phone, as before from 768', () => {
    expect(layout).toContain('<main className="relative z-10 flex-1 min-h-0 overflow-y-auto px-4 pt-[18px] pb-12 md:px-10 md:pt-7 md:pb-10">')
  })

  it('the shots harness draws the same shell', () => {
    const harness = readFileSync('scripts/pages-shots.ts', 'utf8')
    expect(harness).toContain('h(PhoneTopBar, { brand: phoneBrand() })')
    expect(harness).toContain('px-4 pt-[18px] pb-12 md:px-10 md:pt-7 md:pb-10')
  })
})
