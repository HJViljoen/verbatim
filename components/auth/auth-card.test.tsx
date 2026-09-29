import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, renderText } from '@/lib/test/render'
import { AuthCard } from './auth-card'

// The signed-out pages are one family (finish-list item 25 polish): the ditto
// mark beside the name, on the crowd, in one card. Sign in used to wear a plain
// green square where the mark belongs; the other four wore no mark at all.

const ROOT = join(__dirname, '..', '..')
const PAGES = [
  'app/login/page.tsx',
  'app/signup/page.tsx',
  'app/reset/page.tsx',
  'app/reset/confirm/page.tsx',
  'app/invite/[token]/page.tsx',
]

describe('AuthCard', () => {
  it('draws the ditto mark beside the name, never the old square', () => {
    const html = render(AuthCard({ subtitle: 'Reset your password', children: null }))
    expect(html).toContain('viewBox="0 0 64 64"')
    expect((html.match(/<line /g) ?? []).length).toBe(2)
    expect(html).not.toContain('rounded-md bg-primary')
    expect(renderText(AuthCard({ subtitle: 'Reset your password', children: null }))).toBe('Verbatim Reset your password')
  })

  it('prints the notice a broken link brought, above the form, and nothing when there is none', () => {
    const html = render(AuthCard({ notice: 'That reset link has expired.', children: <form /> }))
    expect(html).toMatch(/role="status"[^>]*>That reset link has expired\.<\/p><form>/)
    expect(render(AuthCard({ notice: null, children: null }))).not.toContain('role="status"')
  })

  it('frames every signed-out page', () => {
    for (const page of PAGES) {
      const src = readFileSync(join(ROOT, page), 'utf8')
      expect(src, page).toContain("from '@/components/auth/auth-card'")
      expect(src, page).not.toContain('rounded-md bg-primary')
    }
  })
})
