import { describe, expect, it } from 'vitest'
import { subjectForTheme } from '../written/pool'
import { placeConversations, placeSubject, placementTiers, subjectOfTheme, type SubjectPlacement } from './subject-place'
import { convOf, type ConvInput } from './v2/market'

// ONE PLACEMENT RULE (14 Oct): every surface that names a conversation's
// subject names it through `placeSubject`. Market reads it in `convOf`;
// Content, the legacy Voice surface and their tiles through
// `placeConversations`. These pin the two to one answer.

const members = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)
const invert = (pairs: [string, string[]][]) => {
  const m = new Map<string, string[]>()
  for (const [subject, ids] of pairs) for (const id of ids) m.set(id, [...(m.get(id) ?? []), subject])
  return m
}

/** Three conversations and a mixed tenant: Fit ready, Cost open, Repair
 *  failed (14 Oct: in the second tier with Cost, a tracked subject is never
 *  hidden). */
const A = members('a', 10)
const B = members('b', 10)
const C = members('c', 10)
const all = [
  { subject: { id: 'fit', name: 'Fit' }, calibration: 'ready' },
  { subject: { id: 'cost', name: 'Cost' }, calibration: 'provisional' },
  { subject: { id: 'repair', name: 'Repair' }, calibration: 'failed' },
]
const tiers = placementTiers(all)
const membership: [string, string[]][] = [
  // A: Fit holds 3, Cost 8. A ready subject that qualifies always wins.
  ['fit', A.slice(0, 3)], ['cost', A.slice(0, 8)],
  // B: Repair (failed) holds 9, Cost (open) 4: one tier, the most wins.
  ['repair', B.slice(0, 9)], ['cost', [...B.slice(0, 2), ...B.slice(8, 10)]],
  // C: Repair alone: Repair, as an open subject would.
  ['repair', C.slice(0, 7)],
]
const placement: SubjectPlacement = {
  names: new Map([...tiers.ready, ...tiers.pending].map((s) => [s.id, s.name])),
  order: tiers.ready.map((s) => s.id),
  subjectsOf: invert(membership.filter(([s]) => tiers.ready.some((x) => x.id === s))),
  pending: { order: tiers.pending.map((s) => s.id), subjectsOf: invert(membership.filter(([s]) => tiers.pending.some((x) => x.id === s))) },
}

function marketInput(): ConvInput {
  return {
    period: 'month',
    themes: new Map([['A', { label: 'Conv A', kind: 'question', memberIds: A }], ['B', { label: 'Conv B', kind: 'question', memberIds: B }], ['C', { label: 'Conv C', kind: 'question', memberIds: C }]]),
    subjects: placement,
    weekCounts: [],
    weekCut: [],
    monthCounts: new Map([['A', 9], ['B', 7], ['C', 5]]),
    series: new Map(),
    month: '2026-10-01',
    nowMonth: '2026-10-01',
    newIds: new Set(),
    setApart: new Map(),
    pair: null,
  }
}

describe('one placement rule for a conversation\'s subject', () => {
  it('names the same subject for the same conversation on Market (convOf) and Content (placeConversations)', () => {
    const content = placeConversations(new Map([['A', A], ['B', B], ['C', C]]), placement)
    for (const id of ['A', 'B', 'C']) {
      const market = convOf(id, marketInput())!
      expect(content.get(id)?.name ?? null).toBe(market.subjectName)
      expect(content.get(id)?.id ?? null).toBe(market.subjectId)
    }
    expect([...content].map(([id, s]) => [id, s?.name ?? null])).toEqual([['A', 'Fit'], ['B', 'Repair'], ['C', 'Repair']])
  })

  it('Content\'s old rule (every active subject, one tier) named a provisional one over a ready one; the two tiers never do', () => {
    const everyActive = invert(membership)
    expect(subjectForTheme(A, everyActive, ['cost', 'fit', 'repair'])).toBe('cost')
    expect(placeSubject(A, placement)).toBe('fit')
  })

  it('a failed subject is placed exactly as a provisional one (14 Oct): in the second tier, never over a ready one', () => {
    expect(tiers.ready.map((s) => s.id)).toEqual(['fit'])
    expect(tiers.pending.map((s) => s.id)).toEqual(['cost', 'repair'])
    // B: no ready subject takes it; Repair holds the most of the second tier.
    expect(placeSubject(B, placement)).toBe('repair')
    // A: Repair holding every member insight still loses to a ready Fit.
    const repairAll: SubjectPlacement = {
      ...placement,
      pending: { order: ['cost', 'repair'], subjectsOf: invert([['repair', A], ['cost', A.slice(0, 8)]]) },
    }
    expect(placeSubject(A, repairAll)).toBe('fit')
    // A tie in the second tier goes to the subjects' own order, whatever the state.
    const tie: SubjectPlacement = { names: placement.names, order: [], subjectsOf: new Map(), pending: { order: ['cost', 'repair'], subjectsOf: invert([['repair', A.slice(0, 5)], ['cost', A.slice(5, 10)]]) } }
    expect(placeSubject(A, tie)).toBe('cost')
  })

  it('a tenant whose subjects are all open (Össur, 13 Oct) names the open subject, and no subject read names nothing', () => {
    const open: SubjectPlacement = { names: new Map([['cost', 'Cost']]), order: [], subjectsOf: new Map(), pending: { order: ['cost'], subjectsOf: invert([['cost', A.slice(0, 5)]]) } }
    expect(placeConversations(new Map([['A', A]]), open).get('A')).toEqual({ id: 'cost', name: 'Cost' })
    expect(placeConversations(new Map([['A', A]]), null).get('A')).toBeNull()
  })

  it('one tier is the written read\'s rule exactly (lib/written/pool.ts subjectForTheme)', () => {
    const of = invert(membership)
    for (const m of [A, B, C, A.slice(0, 2), [...A, ...B]]) expect(subjectOfTheme(m, of, ['fit', 'cost'])).toBe(subjectForTheme(m, of, ['fit', 'cost']))
  })
})
