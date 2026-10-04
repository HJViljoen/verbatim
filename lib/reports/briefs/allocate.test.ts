import { describe, expect, it } from 'vitest'

import { affinityOf, allocateIdeas, overlapOfSmaller, preferenceOf, referencesFor, PER_BRIEF } from './allocate'
import type { BriefRole, GroundedPoint, IdeaDraft } from './types'

const SEP = '2026-09-01'
const AUG = '2026-08-01'

let seq = 0
/** A usable point with `n` videos of its own, heard in September (and August
 *  where asked). */
function point(id: string, role: BriefRole, n: number, opts: { months?: string[]; usable?: boolean; videos?: string[] } = {}): GroundedPoint {
  const videos = opts.videos ?? Array.from({ length: n }, () => `v${++seq}`)
  const months = opts.months ?? [SEP]
  return {
    id, role, questionId: `${role}.q`, text: `point ${id}`, insightIds: [`i-${id}`],
    videoIds: videos,
    monthVideoIds: Object.fromEntries(months.map((m) => [m, videos])),
    who: [{ about: 'market', videos: videos.length }],
    seenVideos: videos.length, makerVideos: 0, usable: opts.usable ?? true,
  }
}

const idea = (headline: string, basedOn: string[], home: BriefRole | null, second: BriefRole | null = null): IdeaDraft => ({ headline, basedOn, home, second })

describe('one idea, one home', () => {
  it('keeps an idea the evidence carries and homes it where the call asked', () => {
    const pts = [point('G1', 'sales', 8)]
    const a = allocateIdeas([idea('Buyers stall on the route to buy', ['G1'], 'sales')], pts, { month: SEP })
    expect(a.ideas).toHaveLength(1)
    expect(a.ideas[0]).toMatchObject({ id: 'I1', home: 'sales', placed: 'asked', videos: 8, points: ['G1'] })
    expect(a.byRole.sales).toEqual(['I1'])
  })

  it('holds an idea that rests on no usable point, or on an invented id', () => {
    const pts = [point('G1', 'sales', 8, { usable: false })]
    const a = allocateIdeas([idea('A', ['G1'], 'sales'), idea('B', ['G99'], 'sales')], pts, { month: SEP })
    expect(a.ideas).toEqual([])
    expect(a.held.map((h) => h.reason)).toEqual(['it rests on no usable point', 'it rests on no usable point'])
  })

  it('holds an idea under the reasonable bar (five distinct videos), counting a shared video once', () => {
    const shared = ['v-a', 'v-b', 'v-c']
    const pts = [point('G1', 'sales', 3, { videos: shared }), point('G2', 'sales', 3, { videos: [...shared.slice(0, 2), 'v-d'] })]
    const a = allocateIdeas([idea('Four videos only', ['G1', 'G2'], 'sales')], pts, { month: SEP })
    expect(a.ideas).toEqual([])
    expect(a.held[0].reason).toBe('too little evidence (4 videos)')
  })

  it('holds an idea none of whose talk falls in the brief\'s month', () => {
    const pts = [point('G1', 'sales', 9, { months: [AUG] })]
    const a = allocateIdeas([idea('August only', ['G1'], 'sales')], pts, { month: SEP })
    expect(a.ideas).toEqual([])
    expect(a.held[0].reason).toBe('nothing of it was heard in the month')
  })

  it('holds the weaker of two ideas resting mostly on the same points: the same idea told twice', () => {
    const pts = [point('G1', 'sales', 20), point('G2', 'marketing', 6), point('G3', 'content', 7)]
    const a = allocateIdeas([
      idea('Eco interest needs proof (sales version)', ['G1', 'G2'], 'sales'),
      idea('Eco interest needs proof (marketing version)', ['G2'], 'marketing'),
      idea('Different idea', ['G3'], 'content'),
    ], pts, { month: SEP })
    expect(a.ideas.map((i) => i.headline)).toEqual(['Eco interest needs proof (sales version)', 'Different idea'])
    expect(a.held).toEqual([{ headline: 'Eco interest needs proof (marketing version)', reason: 'the same idea as "Eco interest needs proof (sales version)"' }])
  })

  it('holds an idea whose videos are mostly another idea\'s, even on different points', () => {
    const vids = Array.from({ length: 10 }, (_, i) => `w${i}`)
    const pts = [point('G1', 'sales', 10, { videos: vids }), point('G2', 'content', 6, { videos: vids.slice(0, 6) })]
    const a = allocateIdeas([idea('Big', ['G1'], 'sales'), idea('Same videos', ['G2'], 'content')], pts, { month: SEP })
    expect(a.ideas.map((i) => i.headline)).toEqual(['Big'])
  })

  it('orders ideas by evidence, strongest first, and numbers them in that order', () => {
    const pts = [point('G1', 'sales', 6), point('G2', 'marketing', 12)]
    const a = allocateIdeas([idea('Smaller', ['G1'], 'sales'), idea('Bigger', ['G2'], 'marketing')], pts, { month: SEP })
    expect(a.ideas.map((i) => [i.id, i.headline])).toEqual([['I1', 'Bigger'], ['I2', 'Smaller']])
  })

  it('passes an idea on when its brief is full: the call\'s second reader first', () => {
    const pts = [point('G1', 'sales', 30), point('G2', 'sales', 20), point('G3', 'sales', 10)]
    const a = allocateIdeas([
      idea('One', ['G1'], 'sales'),
      idea('Two', ['G2'], 'sales'),
      idea('Three', ['G3'], 'sales', 'leadership'),
    ], pts, { month: SEP })
    expect(a.ideas.map((i) => [i.headline, i.home, i.placed])).toEqual([
      ['One', 'sales', 'asked'], ['Two', 'sales', 'asked'], ['Three', 'leadership', 'cap'],
    ])
    expect(a.byRole.sales).toHaveLength(PER_BRIEF)
  })

  it('without a second reader, passes it to the reader whose research produced most of its points', () => {
    const pts = [point('G1', 'sales', 30), point('G2', 'sales', 20), point('G3', 'content', 10), point('G4', 'content', 9), point('G5', 'sales', 8)]
    const a = allocateIdeas([
      idea('One', ['G1'], 'sales'),
      idea('Two', ['G2'], 'sales'),
      idea('Three', ['G3', 'G4', 'G5'], 'sales'),
    ], pts, { month: SEP })
    expect(a.ideas.find((i) => i.headline === 'Three')?.home).toBe('content')
  })

  it('fills a brief that would have no finding from a brief holding two, but only with an idea its own research helped ground', () => {
    const pts = [point('G1', 'sales', 30), point('G2', 'sales', 20), point('G3', 'marketing', 12), point('G4', 'content', 9)]
    const a = allocateIdeas([
      idea('Sales one', ['G1'], 'sales'),
      idea('Sales two, partly content\'s research', ['G2', 'G4'], 'sales'),
      idea('Marketing one', ['G3'], 'marketing'),
    ], pts, { month: SEP })
    const moved = a.ideas.find((i) => i.headline.startsWith('Sales two'))
    expect(moved).toMatchObject({ home: 'content', placed: 'fill' })
    // Leadership's research grounded none of them: it stays without a finding
    // rather than taking one its reader has no stake in.
    expect(a.byRole.leadership).toEqual([])
  })

  it('names every other idea, with its brief, in the brief that does not argue it', () => {
    const pts = [point('G1', 'sales', 9), point('G2', 'leadership', 7)]
    const a = allocateIdeas([idea('A', ['G1'], 'sales'), idea('C', ['G2'], 'leadership')], pts, { month: SEP })
    expect(referencesFor('sales', a)).toEqual([{ headline: 'C', brief: 'leadership' }])
    expect(referencesFor('content', a)).toEqual([{ headline: 'A', brief: 'sales' }, { headline: 'C', brief: 'leadership' }])
  })

  it('prints every idea in exactly one brief', () => {
    const pts = Array.from({ length: 8 }, (_, i) => point(`G${i + 1}`, (['sales', 'marketing', 'content', 'leadership'] as const)[i % 4], 6 + i))
    const drafts = pts.map((p, i) => idea(`Idea ${i}`, [p.id], 'sales'))
    const a = allocateIdeas(drafts, pts, { month: SEP })
    const homes = Object.values(a.byRole).flat()
    expect(new Set(homes).size).toBe(homes.length)
    expect(homes.length).toBe(a.ideas.length)
    for (const r of Object.keys(a.byRole) as BriefRole[]) expect(a.byRole[r].length).toBeLessThanOrEqual(PER_BRIEF)
  })
})

describe('the helpers', () => {
  it('affinity is the share of points each role produced', () => {
    expect(affinityOf([{ role: 'sales' }, { role: 'sales' }, { role: 'content' }, { role: 'leadership' }])).toEqual({ sales: 0.5, marketing: 0, content: 0.25, leadership: 0.25 })
  })
  it('overlap is measured on the smaller set', () => {
    expect(overlapOfSmaller(['a', 'b'], ['a', 'b', 'c', 'd'])).toBe(1)
    expect(overlapOfSmaller(['a', 'x'], ['a', 'b', 'c', 'd'])).toBe(0.5)
    expect(overlapOfSmaller([], ['a'])).toBe(0)
  })
  it('the call\'s reader and second come before affinity, each once', () => {
    expect(preferenceOf({ draft: idea('x', [], 'marketing', 'leadership'), affinity: { sales: 0.6, marketing: 0, content: 0.4, leadership: 0 } }))
      .toEqual(['marketing', 'leadership', 'sales', 'content'])
  })
})
