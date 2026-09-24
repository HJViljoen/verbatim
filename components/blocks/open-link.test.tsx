import { describe, expect, it } from 'vitest'
import { EMAIL } from '@/lib/email/theme'

import { render } from '@/lib/test/render'
import { openLink } from './open-link'

// The blocks branched on `mode === 'email'` and treated print as the screen,
// so a brief's PDF and its /r/<token> share page carried "Open Market →" —
// absolute, and therefore resolving to a login wall for a reader with no
// account.
describe('openLink', () => {
  const href = 'https://app.verbatimintel.com/dashboard/market'

  it('is a link in the app and in an email', () => {
    expect(render(<>{openLink('app', href, 'Open Market →')}</>)).toContain('Open Market →')
    expect(render(<>{openLink('app', href, 'Open Market →')}</>)).toContain(href)
    const email = render(<>{openLink('email', href, 'Open Market →')}</>)
    expect(email).toContain(`href="${href}"`)
    expect(email).toContain('style=')
  })

  it('paints one navigation link style, undecorated, in an email (SH24)', () => {
    // It set the charcoal ink and no `text-decoration`, so the six block
    // footer links rendered as default UNDERLINED dark links while every other
    // link on the same artefact is EMAIL.link with no underline. The artboards
    // have one navigation link style; their only underlines are the dotted
    // evidence underlines under figures.
    const markup = render(<>{openLink('email', 'https://app.verbatimintel.com/dashboard/week', 'Open This week →')}</>)
    expect(markup).toContain(EMAIL.link)
    expect(markup).toContain('text-decoration:none')
    expect(markup).not.toContain(EMAIL.ink)
  })

  it('is nothing at all on paper', () => {
    expect(openLink('print', href, 'Open Market →')).toBeNull()
  })
})
