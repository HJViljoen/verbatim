import { describe, expect, it, vi } from 'vitest'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { AskCard, type AskCardProps } from './ask-card'
import { EarlierQuestions } from './earlier'

// The Agent page (pages rebuild, 1 Oct; Page-Agent.dc.html): one question box
// with the month's allowance inside it, and earlier questions only once there
// are any. Render tier: what it PRINTS.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }))

const props = (over: Partial<AskCardProps> = {}): AskCardProps => ({
  canSend: true,
  window: { current: 'days90', href: { days90: '/dashboard/agent', all: '/dashboard/agent?window=all' } },
  asked: { asked: 0, cap: 40 },
  planLimit: 'PDF, up to 4 MB',
  ...over,
})
const text = (node: React.ReactNode) => renderText(node).replace(/\s+/g, ' ')

describe('the Agent\'s question box', () => {
  it('prints the design\'s copy, in its order', () => {
    const t = text(<AskCard {...props()} />)
    const order = [
      'What does your market say about this?',
      'Ask what your market thinks about anything: a product, a price, a claim, a competitor.',
      'Check a plan', 'PDF, up to 4 MB', 'Window', 'Last 90 days', 'All time',
      '0 of 40 questions asked this month Ask',
    ]
    const at = order.map((s) => t.indexOf(s))
    expect(at.filter((x) => x < 0)).toEqual([])
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(render(<AskCard {...props()} />)).toContain('placeholder="Ask about anything your market talks about"')
  })

  it('keeps the copy contract and draws no stripe', () => {
    const html = render(<AskCard {...props()} />)
    assertCopyContract(html)
    expect(html).not.toMatch(/border-l(?:-|\b)|border-left/)
  })

  it('carries none of what was cut: starters, "comments reach back", what an answer reads, not answered', () => {
    const t = text(<AskCard {...props()} />)
    for (const gone of ['Start from what your market talked about', 'comments reach back', 'What an answer reads', 'Not answered', 'written from']) {
      expect(t).not.toContain(gone)
    }
  })

  it('fills the box with a question another page sent', () => {
    expect(render(<AskCard {...props({ ask: 'What do buyers say about zips?' })} />)).toContain('What do buyers say about zips?')
  })

  it('marks the window the page is on', () => {
    const html = render(<AskCard {...props({ window: { current: 'all', href: { days90: '/dashboard/agent', all: '/dashboard/agent?window=all' } } })} />)
    expect(html).toMatch(/<a[^>]*aria-current="true"[^>]*>All time<\/a>/)
  })

  it('is drawn disabled, with the reason in the box, for a reader who may not ask', () => {
    const html = render(<AskCard {...props({ canSend: false })} />)
    expect(html).toContain('placeholder="Only an owner or admin can ask here"')
    expect(html).toMatch(/<textarea[^>]*disabled/)
  })

  it('leaves the allowance out where the month could not be read, rather than print a zero', () => {
    expect(text(<AskCard {...props({ asked: null })} />)).not.toContain('questions asked this month')
  })
})

describe('earlier questions', () => {
  it('is not drawn until there is one (rule 2)', () => {
    expect(render(<EarlierQuestions history={null} />)).toBe('')
    expect(render(<EarlierQuestions history={{ rows: [], held: 0, earliest: null, href: '/dashboard/agent' }} />)).toBe('')
  })

  it('lists each question with its date, and keeps the copy contract', () => {
    const history = {
      rows: [
        { threadId: 't1', title: 'What do buyers say about the zips?', askedAt: '2026-09-21T10:00:00.000Z', claimCrossed: false },
        { threadId: 't2', title: 'How is the price talked about?', askedAt: '2026-09-14T10:00:00.000Z', claimCrossed: null },
      ],
      held: 2,
      earliest: '2026-09-14T10:00:00.000Z',
      href: '/dashboard/agent',
    }
    const html = render(<EarlierQuestions history={history} />)
    assertCopyContract(html)
    const t = text(<EarlierQuestions history={history} />)
    expect(t).toContain('Earlier questions')
    expect(t).toContain('What do buyers say about the zips? 21 Sep')
    expect(html).toContain('href="/dashboard/agent/t1"')
  })
})
