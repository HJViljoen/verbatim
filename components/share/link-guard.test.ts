import { describe, expect, it } from 'vitest'
import { leadsIntoTheApp } from './link-guard'

// THE GUARD INTERCEPTED NONE OF THE LINKS THE NEW SHARE SHELLS ACTUALLY DRAW.
// The blocks build ABSOLUTE hrefs from ctx.appUrl, and app/r/[token]/page.tsx
// passes NEXT_PUBLIC_SITE_URL — the marketing apex, empty in .env.example —
// while the share page is served from app.verbatimintel.com. Neither the
// leading-slash test nor the same-origin one matched, so an outside reader
// clicking "This week →" left for a host that serves no /dashboard.
describe('which links the share guard stops', () => {
  const ORIGIN = 'https://app.verbatimintel.com'
  const CONFIGURED = 'https://verbatimintel.com'

  it('stops a relative app link', () => {
    expect(leadsIntoTheApp('/dashboard/voice', ORIGIN, CONFIGURED)).toBe(true)
  })

  it('stops an absolute link built from the configured app URL', () => {
    expect(leadsIntoTheApp(`${CONFIGURED}/dashboard/week`, ORIGIN, CONFIGURED)).toBe(true)
    expect(leadsIntoTheApp(`${ORIGIN}/dashboard/week`, ORIGIN, CONFIGURED)).toBe(true)
  })

  it('stops it with a trailing slash on the configured URL', () => {
    expect(leadsIntoTheApp(`${CONFIGURED}/dashboard/week`, ORIGIN, `${CONFIGURED}/`)).toBe(true)
  })

  it('lets another share link through — it is a page with no account behind it', () => {
    expect(leadsIntoTheApp('/r/hMi7fyz8', ORIGIN, CONFIGURED)).toBe(false)
    expect(leadsIntoTheApp(`${CONFIGURED}/r/hMi7fyz8`, ORIGIN, CONFIGURED)).toBe(false)
    expect(leadsIntoTheApp(`${ORIGIN}/r/hMi7fyz8`, ORIGIN, CONFIGURED)).toBe(false)
  })

  it('lets a platform link through', () => {
    expect(leadsIntoTheApp('https://www.tiktok.com/@maker/video/731', ORIGIN, CONFIGURED)).toBe(false)
  })

  it('does not treat an unset app URL as a prefix of everything', () => {
    expect(leadsIntoTheApp('https://example.com/dashboard', ORIGIN, '')).toBe(false)
    expect(leadsIntoTheApp('https://example.com/dashboard', ORIGIN, undefined)).toBe(false)
  })
})
