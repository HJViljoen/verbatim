import { describe, expect, it } from 'vitest'

import { Meaning } from './meaning'
import { applyRepeats, buildRepeatsPrompts, repeatItemsOf, verdictsOf } from './repeats'
import type { BriefItem, BriefRole, MonthlyBriefData, SectionKey } from './types'

const brief = (role: BriefRole, sections: { key: SectionKey; items: BriefItem[] }[]): MonthlyBriefData => ({
  version: 1, kind: 'monthly_brief', role, title: role, company: 'Acme', month: '2026-09-01', heardMonths: [],
  inShort: { summary: '', figures: [], also: [] }, findings: [],
  sections: sections.map((s) => ({ key: s.key, title: s.key, groups: [{ items: s.items }] })),
  held: [], promptVersion: 'v', model: 'm', costUsd: 0,
})
const IDEAS = [
  { id: 'I1', headline: 'People want proof the straps survive daily loads', home: 'content' as const },
  { id: 'I2', headline: 'Buyers ask where to order', home: 'sales' as const },
]

describe('the repeat judge', () => {
  const set = [
    brief('sales', [{ key: 'sales.stops', items: [{ title: 'Wear doubts', text: 'Shoppers doubt the straps hold. They ask about rips.', detail: 'More.', videoIds: ['a'] }, { title: 'Route', text: 'Buyers ask where to order.', videoIds: ['b'] }] }]),
    brief('marketing', [{ key: 'marketing.rivals', items: [{ title: 'Rival', text: 'Rival is known for travel packs. People like it.', videoIds: ['c'] }] }]),
    brief('leadership', [
      { key: 'leadership.market', items: [{ title: 'Durability', text: 'Owners ask whether straps survive daily loads.', detail: '7% of videos.' }] },
      { key: 'leadership.weigh', items: [{ title: 'Rival', text: 'Rival is chosen for travel packs. Owners keep it.', videoIds: ['c'] }] },
      { key: 'leadership.decisions', items: [{ text: 'Should Acme show the straps?', videoIds: ['a'] }] },
    ]),
  ]

  it('reads every untagged item but code\'s counts and the questions for the business', () => {
    const items = repeatItemsOf(set)
    expect(items.map((i) => i.id)).toEqual(['R1', 'R2', 'R3', 'R4', 'R5'])
    expect(items.map((i) => i.section)).not.toContain('leadership.decisions')
    const { user } = buildRepeatsPrompts({ ideas: IDEAS, findings: new Map([['I1', 'Owners ask about rips.']]), items })
    expect(user).toContain('I1 [Content brief] People want proof the straps survive daily loads: Owners ask about rips.')
    expect(user).toContain('R1 [Sales brief, stops] Wear doubts. Shoppers doubt the straps hold. They ask about rips. More.')
  })

  it('holds an item restating its own brief\'s idea, names another brief\'s, and the earlier brief keeps a shared claim', () => {
    const items = repeatItemsOf(set)
    const verdicts = verdictsOf({ items: [
      { item: 'R1', restates_idea: 'I1', same_as: '' },
      { item: 'R2', restates_idea: 'I2', same_as: '' },
      { item: 'R3', restates_idea: '', same_as: 'R5' },
      { item: 'R4', restates_idea: 'I1', same_as: '' },
      { item: 'R9', restates_idea: 'I1', same_as: '' },
    ] }, items, IDEAS)
    expect(verdicts).toHaveLength(4)
    const [s, m, l] = applyRepeats(set, verdicts, IDEAS)
    expect(s.sections[0].groups[0].items).toEqual([{ title: 'Wear doubts', text: 'Shoppers doubt the straps hold.', tag: 'Argued in the Content brief', videoIds: ['a'] }])
    expect(s.held).toEqual([{ what: 'sales.stops: Route', reason: 'says what the finding "Buyers ask where to order" says' }])
    expect(m.sections[0].groups[0].items[0].tag).toBeUndefined()
    expect(l.sections.find((x) => x.key === 'leadership.weigh')!.groups[0].items[0]).toMatchObject({ text: 'Rival is chosen for travel packs.', tag: 'Also in the Marketing brief' })
    // A subject line keeps its level and is named.
    expect(l.sections.find((x) => x.key === 'leadership.market')!.groups[0].items[0]).toMatchObject({ detail: '7% of videos.', tag: 'Argued in the Content brief' })
  })

  it('a judged idea far from the item in meaning is a slip, and tags nothing', () => {
    const items = repeatItemsOf(set)
    const verdicts = verdictsOf({ items: [{ item: 'R1', restates_idea: 'I2', same_as: '' }] }, items, IDEAS)
    const texts = new Map([['I1', 'People want proof the straps survive daily loads. Shoppers doubt the straps hold.'], ['I2', 'Buyers ask where to order.']])
    const [s] = applyRepeats(set, verdicts, IDEAS, { meaning: new Meaning(new Map(), 'words'), texts })
    expect(s.sections[0].groups[0].items[0].tag).toBeUndefined()
  })

  it('a same-as item far from the closest line in the other briefs is a slip', () => {
    const items = repeatItemsOf(set)
    // R2 (route to buy) named as the same as R5 (a rival chosen for travel).
    const verdicts = verdictsOf({ items: [{ item: 'R2', restates_idea: '', same_as: 'R5' }] }, items, IDEAS)
    const out = applyRepeats(set, verdicts, IDEAS, { meaning: new Meaning(new Map(), 'words'), texts: new Map() })
    expect(out[2].sections.find((x) => x.key === 'leadership.weigh')!.groups[0].items[0].tag).toBeUndefined()
  })

  it('a same-brief pair is not a repeat across briefs', () => {
    const items = repeatItemsOf(set)
    expect(verdictsOf({ items: [{ item: 'R1', restates_idea: '', same_as: 'R2' }] }, items, IDEAS)).toEqual([{ key: items[0].key, idea: null, sameAs: null }])
  })
})
