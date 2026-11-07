import { describe, expect, it, vi } from 'vitest'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import type { AskHistory } from '@/lib/pages/agent-thread'
import { AskPill, type AskPillProps } from './ask-pill'
import { EarlierQuestions } from './history-drawer'

// The Agent page (the audit design, 7 Nov, Agent.dc.html): the question's
// tile, the box with its label, the yellow Ask and the rebuild's controls
// under it, then earlier questions as a table. Render tier: what it PRINTS.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }))

const props = (over: Partial<AskPillProps> = {}): AskPillProps => ({
  canSend: true,
  window: { current: 'days90', href: { days90: '/dashboard/agent', all: '/dashboard/agent?window=all' } },
  asked: { asked: 6, cap: 40 },
  planLimit: 'PDF, up to 4 MB',
  ...over,
})
const text = (node: React.ReactNode) => renderText(node).replace(/\s+/g, ' ')

describe('the Agent\'s question', () => {
  it('prints the question, then the box, then every control the rebuild added, in that order', () => {
    const t = text(<AskPill {...props()} />)
    const order = [
      'What does your market say about this?',
      'Your question', 'Ask',
      'Check a plan', 'PDF, up to 4 MB', 'Window', 'Last 90 days', 'All time',
      '6 of 40 questions asked this month',
    ]
    const at = order.map((s) => t.indexOf(s))
    expect(at.filter((x) => x < 0)).toEqual([])
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(render(<AskPill {...props()} />)).toContain('placeholder="Ask about anything your market talks about"')
  })

  it('labels the field and puts a yellow Ask beside it, outside the field, in one form', () => {
    const html = render(<AskPill {...props()} />)
    const form = html.slice(html.indexOf('<form'), html.indexOf('</form>'))
    const id = form.match(/<textarea[^>]*id="([^"]+)"/)![1]
    expect(form).toContain(`<label for="${id}"`)
    expect(form).toMatch(/<label[^>]*>Your question<\/label>/)
    expect(form.indexOf('<label')).toBeLessThan(form.indexOf('<textarea'))
    // The field is the kit's input, a radius up; Ask is a text button after it.
    expect(form).toMatch(/<textarea[^>]*class="[^"]*\bborder-input-line\b[^"]*\brounded-\[10px\]/)
    const button = form.match(/<button[^>]*type="submit"[^>]*>([\s\S]*?)<\/button>/)!
    expect(button[1]).toBe('Ask')
    expect(button[0]).toContain('bg-brand')
    expect(form.indexOf('<button')).toBeGreaterThan(form.indexOf('</textarea>'))
    // The pill is gone, and the controls sit under the box, not inside it.
    expect(form).not.toMatch(/rounded-\[32px\]/)
    expect(form).not.toContain('Check a plan')
  })

  it('is one tile at most 1000px wide, with no mark in a square', () => {
    const html = render(<AskPill {...props()} />)
    expect(html).toMatch(/^<section[^>]*class="[^"]*\bmax-w-\[1000px\][^"]*"/)
    expect(html).toMatch(/<h2[^>]*text-\[26px\][^>]*>What does your market say about this\?<\/h2>/)
    expect(html).not.toMatch(/<svg/)
    expect(html).not.toMatch(/font-mono/)
  })

  it('keeps the copy contract, and draws no stripe, no figure and no dash', () => {
    const html = render(<AskPill {...props()} />)
    assertCopyContract(html)
    expect(html).not.toMatch(/border-l(?:-|\b)|border-left/)
    expect(text(<AskPill {...props()} />)).not.toMatch(/[—–]/)
  })

  it('carries none of what was cut: starters, how it works, what an answer reads, not answered', () => {
    const t = text(<AskPill {...props()} />)
    for (const gone of [
      'Start from what your market talked about', 'comments reach back', 'What an answer reads', 'Not answered', 'written from',
      // The rebuild's subheading taught what to ask; the shape does that.
      'Ask what your market thinks about anything',
    ]) {
      expect(t).not.toContain(gone)
    }
  })

  it('fills the pill with a question another page sent', () => {
    expect(render(<AskPill {...props({ ask: 'What do buyers say about zips?' })} />)).toContain('What do buyers say about zips?')
  })

  it('marks the window the page is on', () => {
    const html = render(<AskPill {...props({ window: { current: 'all', href: { days90: '/dashboard/agent', all: '/dashboard/agent?window=all' } } })} />)
    expect(html).toMatch(/<a[^>]*aria-current="true"[^>]*>All time<\/a>/)
    expect(html).toContain('href="/dashboard/agent?window=all"')
    // The white segmented control, the chosen option on the pale yellow.
    expect(html).toMatch(/<div role="group" aria-label="Window" class="[^"]*\brounded-\[10px\][^"]*\bbg-card\b/)
    expect(html).toMatch(/<a[^>]*class="[^"]*\bbg-accent\b[^"]*"[^>]*aria-current="true"|<a[^>]*aria-current="true"[^>]*class="[^"]*\bbg-accent\b/)
  })

  it('is drawn disabled, with the reason in the pill, for a reader who may not ask', () => {
    const html = render(<AskPill {...props({ canSend: false })} />)
    expect(html).toContain('placeholder="Only an owner or admin can ask here"')
    expect(html).toMatch(/<textarea[^>]*disabled/)
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled[^>]*>Ask<\/button>/)
    expect(html).toMatch(/<input[^>]*type="file"[^>]*disabled/)
  })

  it('says why when nothing is searchable, rather than the role gate', () => {
    const html = render(<AskPill {...props({ canSend: false, disabledNote: 'Nothing is searchable yet, so there is nothing to answer from' })} />)
    expect(html).toContain('placeholder="Nothing is searchable yet, so there is nothing to answer from"')
  })

  it('leaves the allowance out where the month could not be read, rather than print a zero', () => {
    expect(text(<AskPill {...props({ asked: null })} />)).not.toContain('questions asked this month')
  })
})

const HISTORY: AskHistory = {
  rows: [
    { threadId: 't1', title: 'What do buyers say about the zips?', askedAt: '2026-09-21T10:00:00.000Z', claimCrossed: false },
    { threadId: 't2', title: 'How is the price talked about?', askedAt: '2026-09-14T10:00:00.000Z', claimCrossed: null },
  ],
  held: 2,
  earliest: '2026-09-14T10:00:00.000Z',
  href: '/dashboard/agent',
}

describe('earlier questions, as a table under the question', () => {
  it('is not drawn until there is one (rule 2)', () => {
    expect(render(<EarlierQuestions history={null} />)).toBe('')
    expect(render(<EarlierQuestions history={{ ...HISTORY, rows: [], held: 0 }} />)).toBe('')
  })

  it('is a tile with a table, Question and Asked, and nothing to raise or hide', () => {
    const html = render(<EarlierQuestions history={HISTORY} />)
    expect(html).toMatch(/^<section/)
    expect(html).toContain('<table')
    expect(html).toMatch(/<th scope="col"[^>]*>Question<\/th><th scope="col"[^>]*>Asked<\/th>/)
    expect(html).not.toMatch(/<button|aria-expanded|\sinert/)
    expect(text(<EarlierQuestions history={HISTORY} />)).toMatch(/^Earlier questions/)
  })

  it('lists each question with its date and its thread, and keeps the copy contract', () => {
    const html = render(<EarlierQuestions history={HISTORY} />)
    assertCopyContract(html)
    const t = text(<EarlierQuestions history={HISTORY} />)
    expect(t).toContain('What do buyers say about the zips? 21 Sep')
    expect(t).toContain('How is the price talked about? 14 Sep')
    expect(html).toContain('href="/dashboard/agent/t1"')
    expect(html.match(/<tr>/g)).toHaveLength(3)
    expect(html).not.toMatch(/border-l(?:-|\b)|border-left/)
  })
})
