import { describe, expect, it } from 'vitest'

import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { WHAT_WE_CHANGED_HREF } from '@/components/pages/overview/change'

import { TheRecord, WHAT_WE_CHANGED_ID, WhatWeChangedLead, WhenCompared } from './what-we-changed'
import { whatWeChangedFixture } from './fixture'

// Settings › What we changed (market-first WP1.6, plan §2.10 D2): the three
// pieces deploy 2 ships, rendered against the copy contract and the 25 Sep
// rulings, on Sealand's September read to the 27 Sep update.

const read = (node: Parameters<typeof renderText>[0]): string =>
  renderText(node).replace(/\s+([,.)”’:])/g, '$1').replace(/([“(])\s+/g, '$1')

describe('What we changed', () => {
  const f = whatWeChangedFixture()
  const lead = <WhatWeChangedLead block={f.block} />

  it('is where the front page’s "What we changed, and when →" lands', () => {
    expect(WHAT_WE_CHANGED_HREF).toBe(`/dashboard/settings/record#${WHAT_WE_CHANGED_ID}`)
    expect(render(lead)).toContain(`id="${WHAT_WE_CHANGED_ID}"`)
  })

  it('says the pair in one sentence, names the first pair read the same way, and why September is not compared, in the front page’s sentence', () => {
    const t = read(lead)
    expect(t).toContain('August and September sit side by side, not read as a change: we changed our searches in September.')
    expect(t).toContain('The first comparison read the same way: October against November, from the 6 Dec update, if nothing we search changes.')
    expect(t).toContain('Why September is not compared')
    expect(t).toContain('Not a change we can stand behind yet: 206 of September’s 625 videos came from searches we added in September (read with the 27 Sep update).')
    assertCopyContract(render(lead))
  })

  it('without a measured row (MF1 not applied) says the refusal in its own words, never a zero', () => {
    const t = read(<WhatWeChangedLead block={whatWeChangedFixture({ measured: false }).block} />)
    expect(t).toContain('Not read as a change: we changed our searches in September.')
    expect(t).not.toMatch(/\b0 of\b/)
  })
})

describe('The record: the dated list', () => {
  const f = whatWeChangedFixture()
  const list = <TheRecord lines={f.lines} month="2026-09-01" prevMonth="2026-08-01" />

  it('prints each change once, with the terms it moved and its reach in each month, read with its update', () => {
    const t = read(list)
    expect((t.match(/search terms added/g) ?? []).length).toBe(2)
    expect(t).toContain('in: handmade bag, sustainable fashion, travel gear')
    expect(t).toContain('187 of 625')
    expect(t).toContain('read with the 27 Sep update')
    expect(t).toContain('not measured yet')
    assertCopyContract(render(list))
  })

  it('says so plainly when nothing is on record', () => {
    expect(read(<TheRecord lines={[]} month="2026-09-01" prevMonth="2026-08-01" />)).toContain('No change of ours is on record for this workspace yet.')
  })
})

describe('When two months are compared', () => {
  const f = whatWeChangedFixture()
  const rules = <WhenCompared rules={f.rules} block={f.block} asAt={f.asAt} />

  it('prints decision D’s four rules and how August against September stands on each', () => {
    const t = read(rules)
    expect(t).toContain('Only when both were read the same way. All four must hold.')
    expect(t).toContain('August against September, as at 27 Sep')
    expect(t).toContain('September has ended and was read past it')
    expect(t).toContain('206 of 625')
    expect(t).toContain('15 against 23')
    assertCopyContract(render(rules))
  })
})

describe('the 25 Sep rulings on the section (§5.12)', () => {
  it('each header is its title alone: no meta and no note', () => {
    const f = whatWeChangedFixture()
    for (const node of [
      <WhatWeChangedLead key="a" block={f.block} />,
      <TheRecord key="b" lines={f.lines} month="2026-09-01" prevMonth="2026-08-01" />,
      <WhenCompared key="c" rules={f.rules} block={f.block} asAt={f.asAt} />,
    ]) {
      const header = render(node).match(/<header[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? ''
      // The eyebrow and nothing beside it.
      expect((header.match(/<span/g) ?? []).length).toBe(0)
      expect(render(node).toLowerCase()).not.toContain('how sound')
    }
  })
})
