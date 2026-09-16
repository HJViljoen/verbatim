import { describe, it, expect } from 'vitest'
import { AgentAnswerView } from './agent-answer'
import { render, renderText } from '@/lib/test/render'
import { saidHeading, citationWhere, JUDGEMENT_HEADING } from '@/lib/agent/types'
import type { Citation, ThreadAnswer } from '@/lib/pages/agent-thread'

// AS4 on screen (Phase 1 WP21): a quoted voice carries its number, where it was
// said and a link to it — the four things the exported deck has always shown
// and the page threw away.

const quote = (n: number, ref: string, text: string, extra: Record<string, unknown> = {}) => ({
  ref, text, commentId: ref.startsWith('c:') ? ref.slice(2) : null, videoId: ref.startsWith('v:') ? ref.slice(2) : null, n, ...extra,
})

const answer = (over: Partial<ThreadAnswer> = {}): ThreadAnswer => ({
  answer: 'Comfort and fit come up before price.',
  silent: false,
  nearest: [],
  judgement: [{ text: 'Lead with fit.', basedOn: ['G1'] }],
  runId: 'r1',
  costUsd: 0.02,
  grounded: [{
    id: 'G1',
    text: 'People worry about skin irritation.',
    insightIds: ['i1'],
    themeRefs: [],
    conversationCount: 2,
    voices: 'client',
    quotes: [quote(1, 'c:c1', 'my skin gets so irritated')],
  }],
  ...over,
})

const citations: Citation[] = [
  { n: 1, ref: 'c:c1', text: 'my skin gets so irritated', platform: 'youtube', date: '2026-07-01', href: 'https://youtu.be/x?lc=1', commentLevel: true },
  { n: 2, ref: 'v:v1', text: 'fit was the deciding thing', platform: 'tiktok', date: null, href: 'https://tiktok.com/x', commentLevel: false },
]

describe('provenance on screen', () => {
  it('prints the number, the platform, the date and a link to the comment', () => {
    const text = renderText(<AgentAnswerView answer={answer()} citations={citations} />)
    // The YEAR is part of it, and it is the deck's appendix rendering too
    // (citationWhere): an answer retrieves across a corpus that runs back to
    // 2020, and "1 Jul" beside "1 Jul" is two different Julys.
    expect(text).toContain('1 · YouTube · 1 Jul 2026 · the comment')
    expect(render(<AgentAnswerView answer={answer()} citations={citations} />)).toContain('https://youtu.be/x?lc=1')
  })

  it('says "the post" where only the post can be reached', () => {
    // TikTok and Instagram have no comment-level deep link, and the word is
    // the only thing that tells a reader they will land somewhere broader.
    const a = answer({
      grounded: [{ ...answer().grounded[0], quotes: [quote(2, 'v:v1', 'fit was the deciding thing')] }],
    })
    const text = renderText(<AgentAnswerView answer={a} citations={citations} />)
    expect(text).toContain('2 · TikTok · the post')
    expect(text).not.toContain('the comment')
  })

  it('says the source is on file rather than inventing one', () => {
    // A quote whose comment has been erased since, or whose video row is gone:
    // the words resolved, the provenance did not, and the number still stands.
    const text = renderText(<AgentAnswerView answer={answer()} citations={[]} />)
    expect(text).toContain('1 · source on file')
  })

  it('keeps the deck’s numbering — the n on the quote, not its position', () => {
    const a = answer({
      grounded: [{ ...answer().grounded[0], quotes: [quote(7, 'c:c1', 'my skin gets so irritated')] }],
    })
    expect(renderText(<AgentAnswerView answer={a} citations={citations} />)).toContain('7 ·')
  })
})

describe('the register headings', () => {
  it('says "your customers" only when every point rests on the client’s own audience', () => {
    expect(renderText(<AgentAnswerView answer={answer()} />)).toContain('What your customers said')
    const mixed = answer({ grounded: [{ ...answer().grounded[0], voices: 'category' }] })
    const text = renderText(<AgentAnswerView answer={mixed} />)
    expect(text).toContain('What people said')
    expect(text).not.toContain('What your customers said')
  })

  it('is the same rule the exported deck now uses', () => {
    expect(saidHeading([{ voices: 'client' }, { voices: 'category' }])).toBe('What people said')
    expect(saidHeading([{ voices: 'client' }])).toBe('What your customers said')
    // An answer with no grounded points claims nothing about whose customers
    // spoke, so it never earns the stronger heading.
    expect(saidHeading([])).toBe('What people said')
  })

  it('speaks in one voice about its own reading, on screen and on paper', () => {
    expect(renderText(<AgentAnswerView answer={answer()} />)).toContain(JUDGEMENT_HEADING)
    expect(JUDGEMENT_HEADING).toBe('What I’d take from that')
  })
})

describe('what the answer still does', () => {
  it('numbers the findings and points judgement at those numbers', () => {
    const text = renderText(<AgentAnswerView answer={answer()} citations={citations} />)
    expect(text).toContain('Reasoning from finding 1 above.')
  })

  it('marks an uncited proposal as inference rather than letting it borrow credit', () => {
    const a = answer({ judgement: [{ text: 'Try a bundle.', basedOn: [] }] })
    expect(renderText(<AgentAnswerView answer={a} />)).toContain('this one is inference')
  })

  it('marks a quoted voice as the speaker’s words', () => {
    // The `quote` marker is what keeps copy-contract rule (c) off a commenter's
    // own sentence (WP0, lib/test/copy-contract.ts).
    expect(render(<AgentAnswerView answer={answer()} citations={citations} />)).toContain('data-copy="quote"')
  })
})

describe('citationWhere', () => {
  // ONE rendering for both renderers: the screen's Provenance and the deck's
  // evidence appendix. They printed the same quote's date as "30 Aug" and as
  // "2026-08-30".
  it('dates a quote with its year, so two Augusts are two Augusts', () => {
    expect(citationWhere({ platform: 'youtube', date: '2026-08-30' })).toBe('YouTube · 30 Aug 2026')
  })

  it('prints whichever half is recorded, and nothing when neither is', () => {
    expect(citationWhere({ platform: 'tiktok', date: null })).toBe('TikTok')
    expect(citationWhere({ platform: null, date: '2026-08-30' })).toBe('30 Aug 2026')
    expect(citationWhere({ platform: null, date: null })).toBe('')
    expect(citationWhere(undefined)).toBe('')
  })
})
