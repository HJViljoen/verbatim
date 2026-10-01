import { describe, expect, it, vi } from 'vitest'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import type { AskHistory } from '@/lib/pages/agent-thread'
import { AskPill, type AskPillProps } from './ask-pill'
import { HistoryDrawer } from './history-drawer'

// The Agent page (1 Oct): the pill in the centre with the rebuild's controls
// around it, and earlier questions in a sheet at the bottom. Render tier: what
// it PRINTS. The sheet's Escape and focus handling need a browser; they are
// checked in one (the pull request's shots).

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }))

const props = (over: Partial<AskPillProps> = {}): AskPillProps => ({
  canSend: true,
  window: { current: 'days90', href: { days90: '/dashboard/agent', all: '/dashboard/agent?window=all' } },
  asked: { asked: 6, cap: 40 },
  planLimit: 'PDF, up to 4 MB',
  ...over,
})
const text = (node: React.ReactNode) => renderText(node).replace(/\s+/g, ' ')

describe('the Agent\'s pill', () => {
  it('prints the question, then the pill, then every control the rebuild added, in that order', () => {
    const t = text(<AskPill {...props()} />)
    const order = [
      'What does your market say about this?',
      'Check a plan', 'PDF, up to 4 MB', 'Window', 'Last 90 days', 'All time',
      '6 of 40 questions asked this month',
    ]
    const at = order.map((s) => t.indexOf(s))
    expect(at.filter((x) => x < 0)).toEqual([])
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(render(<AskPill {...props()} />)).toContain('placeholder="Ask about anything your market talks about"')
  })

  it('puts the arrow inside the pill: the field and Ask are one form, the arrow after the field', () => {
    const html = render(<AskPill {...props()} />)
    const form = html.slice(html.indexOf('<form'), html.indexOf('</form>'))
    expect(form).toMatch(/rounded-\[32px\]/)
    expect(form.indexOf('<textarea')).toBeGreaterThanOrEqual(0)
    expect(form.indexOf('aria-label="Ask"')).toBeGreaterThan(form.indexOf('<textarea'))
    // The controls sit under the pill, not inside it.
    expect(form).not.toContain('Check a plan')
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
  })

  it('is drawn disabled, with the reason in the pill, for a reader who may not ask', () => {
    const html = render(<AskPill {...props({ canSend: false })} />)
    expect(html).toContain('placeholder="Only an owner or admin can ask here"')
    expect(html).toMatch(/<textarea[^>]*disabled/)
    expect(html).toMatch(/<button[^>]*disabled[^>]*aria-label="Ask"|<button[^>]*aria-label="Ask"[^>]*disabled/)
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

describe('earlier questions, in the sheet at the bottom', () => {
  it('is not drawn until there is one (rule 2)', () => {
    expect(render(<HistoryDrawer history={null} />)).toBe('')
    expect(render(<HistoryDrawer history={{ ...HISTORY, rows: [], held: 0 }} />)).toBe('')
  })

  it('is a handle while it is down: a button that says what it raises, and a list nothing can reach', () => {
    const html = render(<HistoryDrawer history={HISTORY} />)
    const button = html.match(/<button[^>]*>/)![0]
    expect(button).toContain('aria-expanded="false"')
    const controls = button.match(/aria-controls="([^"]+)"/)![1]
    expect(html).toMatch(new RegExp(`id="${controls}"[^>]*inert`))
    expect(text(<HistoryDrawer history={HISTORY} />)).toMatch(/^Earlier questions/)
  })

  it('lists each question with its date and its thread, and keeps the copy contract', () => {
    const html = render(<HistoryDrawer history={HISTORY} defaultOpen />)
    assertCopyContract(html)
    expect(html.match(/<button[^>]*>/)![0]).toContain('aria-expanded="true"')
    expect(html).not.toMatch(/\sinert/)
    const t = text(<HistoryDrawer history={HISTORY} defaultOpen />)
    expect(t).toContain('What do buyers say about the zips? 21 Sep')
    expect(t).toContain('How is the price talked about? 14 Sep')
    expect(html).toContain('href="/dashboard/agent/t1"')
    expect(html).not.toMatch(/border-l(?:-|\b)|border-left/)
  })
})
