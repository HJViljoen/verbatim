import { describe, expect, it } from 'vitest'
import { ADVICE_SAME_IDEA, adviceShortlist, adviceText, currentAdvice } from './advice-shortlist'

// Walkthrough item 6: Your moves drew 12 of 79 recommendations, ~15 of them
// the same "proof layer" idea reworded and some of them June's generic advice.
// The default is now the current advice, one row per idea, a handful.

type Row = { lineageId: string; status: string; inLatest?: boolean }
const row = (lineageId: string, over: Partial<Row> = {}): Row => ({ lineageId, status: 'new', ...over })

// Unit vectors on named axes: rows on one axis are one idea (cosine 1), rows
// on different axes are different ideas (cosine 0).
const AXES = ['proof', 'fit', 'comfort', 'creators', 'retail', 'june-a', 'june-b']
const unit = (axis: string) => AXES.map((a) => (a === axis ? 1 : 0))
const vectors = (byLineage: Record<string, string>) => (id: string) => (byLineage[id] ? unit(byLineage[id]) : undefined)

// The ledger's order: the current recommendation first, then the newest.
const ledger: Row[] = [
  row('proof-now', { inLatest: true }),
  row('proof-too', { inLatest: true }),
  row('comfort', { inLatest: true }),
  row('creators', { inLatest: true }),
  row('fit-working', { status: 'in_progress' }),
  row('proof-aug'),
  row('proof-jul'),
  row('june-avoid-controversy'),
  row('june-loyalty'),
]
const ideas = vectors({
  'proof-now': 'proof', 'proof-too': 'proof', comfort: 'comfort', creators: 'creators', 'fit-working': 'proof',
  'proof-aug': 'proof', 'proof-jul': 'proof', 'june-avoid-controversy': 'june-a', 'june-loyalty': 'june-b',
})

describe('adviceShortlist', () => {
  it('draws only the current advice: what the latest update raised, and what you are working on', () => {
    expect(currentAdvice(ledger).map((r) => r.lineageId)).toEqual(['proof-now', 'proof-too', 'comfort', 'creators', 'fit-working'])
    const list = adviceShortlist(ledger, ideas)
    expect(list.lineages).not.toContain('june-avoid-controversy')
    expect(list.lineages).not.toContain('june-loyalty')
  })

  it('draws one row per idea, and counts the other wordings on it', () => {
    const list = adviceShortlist(ledger, ideas)
    expect(list.lineages).toEqual(['proof-now', 'comfort', 'creators', 'fit-working'])
    // proof-too (current), proof-aug and proof-jul (older) are the same idea.
    expect(list.alsoRaised.get('proof-now')).toBe(3)
    expect(list.alsoRaised.has('comfort')).toBe(false)
    expect(list.earlier).toBe(ledger.length - 4)
  })

  it('never folds advice you decided on into another row', () => {
    const list = adviceShortlist(ledger, ideas)
    expect(list.lineages).toContain('fit-working')
    expect(list.alsoRaised.has('fit-working')).toBe(false)
  })

  it('caps the undecided ideas at a handful, in the ledger’s order, and never cuts what you decided on', () => {
    expect(adviceShortlist(ledger, ideas, { shown: 2 }).lineages).toEqual(['proof-now', 'comfort', 'fit-working'])
    expect(adviceShortlist(ledger, ideas, { shown: 1 }).lineages).toEqual(['proof-now', 'fit-working'])
  })

  it('draws advice you decided on in an earlier update, even where the latest did not raise it', () => {
    const decidedEarlier = [...ledger, row('july-done', { status: 'acted_on' }), row('june-dismissed', { status: 'dismissed' })]
    const list = adviceShortlist(decidedEarlier, ideas)
    expect(list.lineages).toContain('july-done')
    expect(list.lineages).toContain('june-dismissed')
    expect(list.alsoRaised.has('july-done')).toBe(false)
    // Never folded, even into a row saying the same thing.
    const sameIdea = adviceShortlist(decidedEarlier, vectors({ 'proof-now': 'proof', 'july-done': 'proof' }))
    expect(sameIdea.lineages).toContain('july-done')
    expect(sameIdea.alsoRaised.get('proof-now') ?? 0).toBe(0)
  })

  it('draws the current advice unmerged where there are no vectors', () => {
    const list = adviceShortlist(ledger, null)
    expect(list.lineages).toEqual(['proof-now', 'proof-too', 'comfort', 'creators', 'fit-working'])
    expect(list.alsoRaised.size).toBe(0)
  })

  it('keeps two ideas apart just under the bar', () => {
    const near = [1, 0]
    const angle = Math.acos(ADVICE_SAME_IDEA) + 0.01
    const apart = [Math.cos(angle), Math.sin(angle)]
    const rows = [row('a', { inLatest: true }), row('b', { inLatest: true })]
    const list = adviceShortlist(rows, (id) => (id === 'a' ? near : apart))
    expect(list.lineages).toEqual(['a', 'b'])
  })

  it('embeds the title with its argument', () => {
    expect(adviceText({ title: 'Publish a material passport', why: 'Buyers want proof.' })).toBe('Publish a material passport. Buyers want proof.')
    expect(adviceText({ title: 'Publish a material passport', why: null })).toBe('Publish a material passport.')
  })
})
