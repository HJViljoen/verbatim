import { describe, expect, it } from 'vitest'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'

import { render } from '@/lib/test/render'
import { AgentComposer } from './agent-composer'

// The Ask box as a page that sent the reader here leaves it (WP3.9): the
// question in the field, ready to read, edit and ask.
const router = { push() {}, replace() {}, refresh() {}, prefetch() {}, back() {}, forward() {}, hmrRefresh() {} }
const box = (ask?: string) => render(
  <AppRouterContext.Provider value={router as never}>
    <AgentComposer canSend ask={ask} placeholder="Ask about anything your market talks about" />
  </AppRouterContext.Provider>,
)

describe('the Ask box with a question another page sent', () => {
  it('opens on the question, as the field’s value, and on the placeholder without one', () => {
    expect(box('What does my market say about Looks & style?')).toContain('value="What does my market say about Looks &amp; style?"')
    expect(box()).toContain('value=""')
    expect(box()).toContain('placeholder="Ask about anything your market talks about"')
  })

  it('gives the field the whole row on a phone, the two buttons the row under it', () => {
    const html = box('What does my market say about Looks & style?')
    // At 390 the field sat beside both buttons, 90px wide: "What doe".
    expect(html).toMatch(/<form[^>]*class="[^"]*\bflex-wrap\b[^"]*\bsm:flex-nowrap\b/)
    expect(html).toMatch(/class="[^"]*\bbasis-full\b[^"]*\bsm:flex-1\b[^"]*"/)
  })
})
