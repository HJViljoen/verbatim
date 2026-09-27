import { describe, expect, it } from 'vitest'

import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { exclusionGroups } from '@/lib/settings/search-set'
import { SEALAND_CLIENT_ID } from '@/lib/config'

import { SearchSetCard, type SetGroup } from './search-set'

// Settings › What we read, "The search set" as the approved preview draws it
// (WP3.10). Sealand on staging, read-only, 27 Sep 2026: the 22 searched terms
// with the day each was first searched, the three communities read, the nine
// words of "Not these", and the set's history (lib/settings/search-set.ts).

const GROUPS: SetGroup[] = [
  { key: 'brand_keywords', label: 'Your name', sub: 'how people write it', terms: [
    { term: 'sealand gear', day: 'by 6 Jul' }, { term: '#sealandgear', day: 'by 6 Jul' }, { term: 'sealand bag', day: '9 Sep' },
  ] },
  { key: 'competitor_keywords', label: 'Brands you track', sub: 'their products, by name', terms: [
    { term: 'cotopaxi backpack', day: '9 Sep' }, { term: 'freitag bag', day: '9 Sep' }, { term: 'frtg', day: '13 Sep' },
    { term: 'rareform bag', day: '9 Sep' }, { term: 'north face backpack', day: '20 Sep' }, { term: 'patagonia black hole', day: '20 Sep' }, { term: 'fombrand', day: '20 Sep' },
  ] },
  { key: 'industry_keywords', label: 'The category', sub: 'what people call products like yours', terms: [
    { term: 'eco backpack', day: 'by 6 Jul' }, { term: 'upcycled bag', day: 'by 6 Jul' }, { term: 'made from waste', day: '20 Sep' },
  ] },
]
const HISTORY = {
  steps: [
    { when: 'by 6 Jul', words: '6 of today’s terms', state: 'past' as const },
    { when: '9 Sep', words: '3 brands out and 1 in, 7 terms out and 7 in, 2 communities added', state: 'past' as const },
    { when: '13 Sep', words: '4 terms added', state: 'past' as const },
    { when: '17 Sep', words: '4 brands and 5 terms added, first searched 20 Sep', state: 'past' as const },
    { when: '6 Dec update', words: 'October against November: the first comparison read the same way', state: 'ahead' as const },
    { when: '1 Jan 2027', words: 'the earliest a change you ask for lands', state: 'ahead' as const },
  ],
  heldAfter: 3,
}
const EXCLUSIONS = exclusionGroups(SEALAND_CLIENT_ID, ['argentina', 'chile', 'torres del paine', 'ecuador', 'volcano', 'schengen', 'immigration', 'border control', 'hip hop'])
const read = (t: string): string => t.replace(/\s+([,.)])/g, '$1').replace(/\s+/g, ' ')

const card = (over: Partial<Parameters<typeof SearchSetCard>[0]> = {}) => (
  <SearchSetCard
    locked
    queue={{ state: 'available', summary: 'queued for October: none yet', lines: [] }}
    canEdit
    groups={GROUPS}
    communities={[{ name: 'backpacks', day: '9 Sep' }, { name: 'travelgear', day: '9 Sep' }, { name: 'onebag', day: '9 Sep' }]}
    exclusions={EXCLUSIONS}
    history={HISTORY}
    recordHref="/dashboard/settings/record"
    editor={<form data-editor="">the editor</form>}
    {...over}
  />
)

describe('The search set', () => {
  it('opens on the strip that holds it still, with what is queued and the one control', () => {
    const t = read(renderText(card()))
    expect(t).toContain('Held still until January queued for October: none yet Queue a change')
    expect(render(card())).toContain('aria-expanded="false"')
  })

  it('prints each group with its searches and the day we first searched each, then the communities and "Not these" by meaning', () => {
    const t = read(renderText(card()))
    expect(t).toContain('Group Search, and the day we first searched it')
    expect(t).toContain('Your name 3 how people write it sealand gear by 6 Jul #sealandgear by 6 Jul sealand bag 9 Sep')
    expect(t).toContain('Brands you track 7 their products, by name cotopaxi backpack 9 Sep')
    expect(t).toContain('north face backpack 20 Sep')
    expect(t).toContain('Communities 3 Reddit, read as well as searched r/backpacks 9 Sep r/travelgear 9 Sep r/onebag 9 Sep')
    expect(t).toContain('Not these 9 other meanings of the names we track Patagonia, the region argentina · chile · torres del paine Cotopaxi, the volcano ecuador · volcano')
    expect(t).toContain('old school, the music hip hop')
  })

  it('draws the editor only when asked: the set is what a first render shows', () => {
    expect(render(card())).not.toContain('data-editor')
  })

  it('tells how the set got here, the held-still stretch and the dates ahead', () => {
    const html = render(card())
    const t = read(renderText(card()))
    expect(t).toContain('How the set got here by 6 Jul 6 of today’s terms 9 Sep 3 brands out and 1 in, 7 terms out and 7 in, 2 communities added')
    expect(t).toContain('held still 17 Sep 4 brands and 5 terms added, first searched 20 Sep')
    expect(t).toContain('6 Dec update October against November: the first comparison read the same way 1 Jan 2027 the earliest a change you ask for lands')
    // Four changes made (filled), two dates ahead (hollow).
    expect(html.match(/size-3 shrink-0 rounded-full bg-ink-market/g)).toHaveLength(4)
    expect(html.match(/size-3 shrink-0 rounded-full bg-tile ring-2/g)).toHaveLength(2)
    expect(t.match(/held still/g)).toHaveLength(1)
  })

  it('links to The record in its footer, and nothing else', () => {
    expect(read(renderText(card()))).toContain('What we changed, and when →')
    expect(render(card())).toContain('href="/dashboard/settings/record"')
  })

  it('offers no control where the queue cannot be read yet, and says a change is noted by hand', () => {
    const t = read(renderText(card({ queue: { state: 'unavailable' } })))
    expect(t).toContain('Held still until January tell us and we will note it for then')
    expect(t).not.toContain('Queue a change')
  })

  it('lists what is queued, with the month it lands and who queued it', () => {
    const t = read(renderText(card({ queue: { state: 'available', summary: 'queued for January 2027: 1 change', lines: [
      { field: 'industry_keywords', label: 'Terms for the category', words: 'adds wet commute bag', month: '2027-01-01', queuedAt: '2026-10-12T09:00:00.000Z', queuedBy: 'daniela@sealand.example · owner' },
    ] } })))
    expect(t).toContain('Terms for the category: adds wet commute bag')
    expect(t).toContain('queued 12 Oct by daniela@sealand.example')
  })

  it('draws a workspace that is not held still with its own control, and a reader who cannot edit with none', () => {
    const open = read(renderText(card({ locked: false, history: { steps: HISTORY.steps.slice(0, 4), heldAfter: null } })))
    expect(open).toContain('Changes land with the next update Change the search set')
    expect(open).not.toContain('held still')
    const member = read(renderText(card({ canEdit: false })))
    expect(member).not.toContain('Queue a change')
    expect(member).toContain('Held still until January')
  })

  it('says an empty group is empty', () => {
    const t = read(renderText(card({ queue: { state: 'unavailable' }, groups: GROUPS.map((g) => ({ ...g, terms: [] })), communities: [], exclusions: [] })))
    expect(t.match(/none yet/g)).toHaveLength(5)
  })

  it('keeps the copy contract, with no em dash', () => {
    assertCopyContract(card())
    expect(renderText(card())).not.toContain('—')
  })
})
