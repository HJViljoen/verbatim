import { describe, expect, it } from 'vitest'
import { subjectForTheme } from '../written/pool'
import { notReadyIds, placeConversations, placeSubject, placementTiers, subjectOfTheme, type SubjectPlacement } from './subject-place'
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
 *  failed (14 Oct: in the third tier, after Cost; a tracked subject is never
 *  hidden, and a failed one never outbids an open one). */
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
  // B: Repair (failed) holds 9, Cost (open) 4: Cost qualifies, so Cost keeps
  // it (a failed subject catches more than it should, and never outbids).
  ['repair', B.slice(0, 9)], ['cost', [...B.slice(0, 2), ...B.slice(8, 10)]],
  // C: Repair alone: no ready or open subject takes it, so Repair does.
  ['repair', C.slice(0, 7)],
]
const tierOf = (list: readonly { id: string }[]) => ({
  order: list.map((s) => s.id),
  subjectsOf: invert(membership.filter(([s]) => list.some((x) => x.id === s))),
})
const placement: SubjectPlacement = {
  names: new Map([...tiers.ready, ...tiers.pending, ...tiers.failed].map((s) => [s.id, s.name])),
  ...tierOf(tiers.ready),
  pending: tierOf(tiers.pending),
  failed: tierOf(tiers.failed),
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
    expect([...content].map(([id, s]) => [id, s?.name ?? null])).toEqual([['A', 'Fit'], ['B', 'Cost'], ['C', 'Repair']])
  })

  it('Content\'s old rule (every active subject, one tier) named a provisional one over a ready one; the two tiers never do', () => {
    const everyActive = invert(membership)
    expect(subjectForTheme(A, everyActive, ['cost', 'fit', 'repair'])).toBe('cost')
    expect(placeSubject(A, placement)).toBe('fit')
  })

  it('three tiers (the lead\'s ruling, 14 Oct): ready, then open, then failed; a failed subject is placed, never hidden, never over an open or a ready one', () => {
    expect(tiers.ready.map((s) => s.id)).toEqual(['fit'])
    expect(tiers.pending.map((s) => s.id)).toEqual(['cost'])
    expect(tiers.failed.map((s) => s.id)).toEqual(['repair'])
    // B: Repair (failed) holds 9 of 10, Cost (open) 4: the open one keeps it.
    expect(placeSubject(B, placement)).toBe('cost')
    // C: only the failed one qualifies: it takes the conversation.
    expect(placeSubject(C, placement)).toBe('repair')
    // A: Repair holding every member insight still loses to a ready Fit.
    const repairAll: SubjectPlacement = { ...placement, failed: { order: ['repair'], subjectsOf: invert([['repair', A]]) } }
    expect(placeSubject(A, repairAll)).toBe('fit')
    // With no open subject that qualifies, the failed one is read: Cost at 2
    // of 10 does not qualify on B, so Repair takes it.
    const costThin: SubjectPlacement = { ...placement, pending: { order: ['cost'], subjectsOf: invert([['cost', B.slice(0, 2)]]) } }
    expect(placeSubject(B, costThin)).toBe('repair')
    // A tier with nothing read is no tier.
    expect(placeSubject(C, { ...placement, failed: null })).toBeNull()
    // The chips' not-ready set: open and failed alike.
    expect([...notReadyIds(placement)]).toEqual(['cost', 'repair'])
    expect(notReadyIds(null).size).toBe(0)
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
