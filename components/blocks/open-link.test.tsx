import { describe, expect, it } from 'vitest'
import { EMAIL } from '@/lib/email/theme'

import { render, renderText } from '@/lib/test/render'
import { openLink, splitArrow } from './open-link'

// The blocks branched on `mode === 'email'` and treated print as the screen,
// so a brief's PDF and its /r/<token> share page carried "Open Market →" —
// absolute, and therefore resolving to a login wall for a reader with no
// account.
describe('openLink', () => {
  const href = 'https://app.verbatimintel.com/dashboard/market'

  it('is a link in the app and in an email', () => {
    expect(renderText(<>{openLink('app', href, 'Open Market →')}</>)).toBe('Open Market →')
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

  it('underlines its words and never its arrow, in the app (the preview’s footer link)', () => {
    // The words sit in their own span, which carries the underline (on hover
    // here, at rest in a roomy frame through `data-link-text`); the anchor
    // carries no decoration, since one on it would propagate to the arrow.
    const markup = render(<>{openLink('app', href, 'Open Market →')}</>)
    expect(markup).toContain('<span data-link-text="" class="group-hover/open:underline">Open Market</span> <span aria-hidden="true">→</span>')
    expect(markup).toMatch(/^<a class="group\/open" href="[^"]+">/)
    // A label with no arrow is all words.
    expect(render(<>{openLink('app', href, 'Open Market')}</>)).toContain('<span data-link-text="" class="group-hover/open:underline">Open Market</span></a>')
    expect(splitArrow('What we changed, and when →')).toEqual({ text: 'What we changed, and when', arrow: '→' })
    expect(splitArrow('more · one click down  → ')).toEqual({ text: 'more · one click down', arrow: '→' })
    expect(splitArrow('1440 → 390')).toEqual({ text: '1440 → 390', arrow: null })
  })

  it('is nothing at all on paper', () => {
    expect(openLink('print', href, 'Open Market →')).toBeNull()
  })
})
