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

  it('says the pair in one sentence and names the first pair read the same way, the pair set in weight', () => {
    const t = read(lead)
    expect(t).toContain('August and September sit side by side, not read as a change: we changed our searches in September.')
    expect(t).toContain('The first comparison read the same way: October against November, from the 6 Dec update, if nothing we search changes.')
    expect(render(lead)).toContain('<span class="font-semibold text-foreground">October against November, from the 6 Dec update</span>')
    assertCopyContract(render(lead))
  })

  it('says why September is not compared in the preview’s three cells: each figure with its base, what it counts and its update', () => {
    const t = read(lead)
    expect(t).toContain('Why September is not compared')
    // WP1.8's one figure over the market (the 26 Sep ruling), never the strict count (376 of 625).
    expect(t).toContain('356 of 654 September videos came from searches we added in September read with the 27 Sep update')
    expect(t).not.toContain('376')
    expect(t).toContain('65 of 654 September videos had been let in without our relevance check read with the 27 Sep update')
    expect(t).toContain('15 against 23 Dated comments a video: September’s median, against August’s read with the 27 Sep update')
    // Three cells, not the one sentence the front page prints.
    expect(t).not.toContain('Not a change we can stand behind yet')
    expect((render(lead).match(/data-copy="level"/g) ?? []).length).toBe(2)
  })

  it('without a measured row (MF1 not applied) says the figures are not measured yet, never a zero, and does not repeat the headline', () => {
    const t = read(<WhatWeChangedLead block={whatWeChangedFixture({ measured: false }).block} />)
    expect(t).toContain('Why September is not compared not measured yet')
    // The headline says the refusal; the section under it does not say it again.
    expect(t.match(/not read as a change: we changed our searches in September/gi) ?? []).toHaveLength(1)
    expect(t).not.toMatch(/\b0 of\b/)
    assertCopyContract(render(<WhatWeChangedLead block={whatWeChangedFixture({ measured: false }).block} />))
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

  it('opens its columns at xl, where the tile has room for the words beside three fixed tracks', () => {
    // At 1024 the tile's inside is 432px and the fixed tracks take 420: the
    // words were left 12px, one to a line (fresh design check, 26 Sep).
    const markup = render(list)
    expect(markup).toContain('xl:grid-cols-[104px_minmax(0,1fr)_128px_128px]')
    expect(markup).not.toMatch(/\blg:grid/)
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
    // Rule 2 keeps the strict count in its own words, on the category (the 26 Sep ruling), never the added-only figure.
    expect(t).toContain('does not hold: 376 of 625')
    expect(t).not.toContain('356')
    expect(t).toContain('65 of 654')
    expect(t).toContain('15 against 23')
    assertCopyContract(render(rules))
  })

  it('opens How to read from its footer, a link and nothing else', () => {
    const footer = render(rules).match(/<footer[^>]*>([\s\S]*?)<\/footer>/)?.[1] ?? ''
    expect(footer).toContain('href="/dashboard/settings/how-to-read"')
    expect(footer.replace(/<[^>]+>/g, '').trim()).toBe('How to read →')
    expect(footer.replace(/<a [^>]*>[\s\S]*?<\/a>/g, '').replace(/<[^>]+>/g, '').trim()).toBe('')
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
