import { describe, it, expect } from 'vitest'

import { accountKey, pickQuotes, quotable, type QuoteCandidate } from './voices'

// Two of September's real comments (DR F35, plan §2.2's print): one on the
// airline-sizes theme, one on the colours theme. Their ids are labels.
const AIRLINE = 'About time they do something about the people who have too many or too big ‘carry on’ suitcases'
const PINK = 'If you made it in pink and a bigger size I would buy it immediately'

const c = (over: Partial<QuoteCandidate> = {}): QuoteCandidate => ({
  evidenceId: 'ev-airline',
  quote: AIRLINE,
  rank: 1,
  lang: 'en',
  english: null,
  insightKind: 'question',
  commentId: 'cm-1',
  commentDate: '2026-09-14T00:00:00.000Z',
  author: 'traveller_amy',
  videoAccount: 'packinglight',
  ...over,
})

describe('the quote rule (plan §4.0 Quotes)', () => {
  it('takes a comment dated in the reading month, of the right kind, from someone other than the video’s account', () => {
    expect(quotable(c(), '2026-09-01', 'question')).toBe(true)
  })

  it('refuses a comment from another month (the June Cotopaxi quotes, GR F9)', () => {
    expect(quotable(c({ commentDate: '2026-06-07T00:00:00.000Z' }), '2026-09-01', 'question')).toBe(false)
    expect(quotable(c({ commentDate: '2026-10-01T00:00:00.000Z' }), '2026-09-01', 'question')).toBe(false)
  })

  it('refuses the video’s own account, however it is spelt', () => {
    expect(quotable(c({ author: '@PackingLight' }), '2026-09-01', 'question')).toBe(false)
    expect(accountKey(' @PackingLight ')).toBe('packinglight')
  })

  it('refuses the wrong kind, and anything with no comment behind it', () => {
    expect(quotable(c({ insightKind: 'praise' }), '2026-09-01', 'question')).toBe(false)
    expect(quotable(c({ commentId: null }), '2026-09-01', 'question')).toBe(false)
    expect(quotable(c({ insightKind: 'praise' }), '2026-09-01', null)).toBe(true)
  })

  it('refuses a quote a reader cannot read: another language with no English yet', () => {
    expect(quotable(c({ quote: 'Ich brauche diese Tasche für meine nächste Reise sofort', lang: 'de', english: null }), '2026-09-01', null)).toBe(false)
    expect(quotable(c({ quote: 'Ich brauche diese Tasche für meine nächste Reise sofort', lang: 'de', english: 'I need this bag for my next trip right away' }), '2026-09-01', null)).toBe(true)
  })

  it('orders by the evidence’s own rank, never by likes, and prints one wording once', () => {
    const picked = pickQuotes([
      c({ evidenceId: 'ev-3', rank: 3, quote: PINK, insightKind: 'feature_request' }),
      c({ evidenceId: 'ev-1', rank: 1 }),
      c({ evidenceId: 'ev-2', rank: 2 }),
    ], { month: '2026-09-01', kind: null, count: 2 })
    expect(picked.map((p) => p.evidenceId)).toEqual(['ev-1', 'ev-3'])
  })
})
