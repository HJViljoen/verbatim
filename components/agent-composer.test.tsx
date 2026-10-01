import { describe, expect, it } from 'vitest'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'

import { render } from '@/lib/test/render'
import { AgentComposer } from './agent-composer'

// The ask box as a page that sent the reader here leaves it (WP3.9): the
// question in the field, ready to read, edit and ask. Since 1 Oct the box is
// the pill, on the Agent page and on a thread.
const router = { push() {}, replace() {}, refresh() {}, prefetch() {}, back() {}, forward() {}, hmrRefresh() {} }
const box = (props: Partial<React.ComponentProps<typeof AgentComposer>> = {}) => render(
  <AppRouterContext.Provider value={router as never}>
    <AgentComposer canSend placeholder="Ask about anything your market talks about" {...props} />
  </AppRouterContext.Provider>,
)

describe('the Ask box with a question another page sent', () => {
  it('opens on the question, as the field’s value, and on the placeholder without one', () => {
    expect(box({ ask: 'What does my market say about Looks & style?' })).toMatch(/<textarea[^>]*>What does my market say about Looks &amp; style\?<\/textarea>/)
    expect(box()).toMatch(/<textarea[^>]*><\/textarea>/)
    expect(box()).toContain('placeholder="Ask about anything your market talks about"')
  })

  it('grows with the question rather than cutting it on a phone', () => {
    // At 390 a one-line field read "What doe". The field is sized to what it
    // holds (and to its placeholder while empty), up to a ceiling.
    const html = box({ ask: 'What does my market say about Looks & style?' })
    expect(html).toMatch(/<textarea[^>]*class="[^"]*\bfield-sizing-content\b[^"]*\bmax-h-\[220px\]|<textarea[^>]*class="[^"]*\bmax-h-\[220px\][^"]*\bfield-sizing-content\b/)
  })
})

describe('the pill on a thread', () => {
  it('names the follow-up and keeps Check a plan, with no window or allowance of its own', () => {
    const html = box({ threadId: 't1', placeholder: 'Ask a follow-up in this thread' })
    expect(html).toContain('aria-label="Your follow-up"')
    expect(html).toContain('Check a plan')
    expect(html).not.toContain('aria-label="Window"')
    expect(html).not.toContain('questions asked this month')
  })
})
