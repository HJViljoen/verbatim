import { describe, expect, it } from 'vitest'

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

  it('is nothing at all on paper', () => {
    expect(openLink('print', href, 'Open Market →')).toBeNull()
  })
})
