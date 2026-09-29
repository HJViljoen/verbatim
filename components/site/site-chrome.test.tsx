import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@/lib/test/render'
import { SiteNav } from '@/app/site/_components/site-nav'
import { SiteFooter } from '@/app/site/_components/site-footer'

// The marketing chrome's way into the app (finish-list item 25). Below 900px
// the header used to hide every text link, Sign in with them, and the footer
// had none: a client on a phone could not get from the site to the app.

const LOGIN = 'https://app.verbatimintel.com/login'
const css = readFileSync(join(__dirname, '..', '..', 'app', 'site', 'site.css'), 'utf8')

describe('the site header and footer', () => {
  it('marks the header sign-in link as the one that survives on a phone', () => {
    for (const variant of ['dark', 'light'] as const) {
      const html = render(SiteNav({ variant }))
      expect(html).toContain(`href="${LOGIN}" class="signin"`)
    }
  })

  it('the phone rule hides the other text links and spares .signin', () => {
    expect(css).toMatch(/\.nav-links a:not\(\.btn\):not\(\.signin\) \{ display: none; \}/)
    expect(css).not.toMatch(/\.nav-links a:not\(\.btn\) \{ display: none; \}/)
  })

  it('carries a sign-in link in the footer too', () => {
    expect(render(SiteFooter())).toContain(`href="${LOGIN}"`)
  })
})
