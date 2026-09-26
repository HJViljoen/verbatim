import { describe, expect, it } from 'vitest'

import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { WHAT_WE_CHANGED_HREF } from '@/components/pages/overview/change'

import { TheRecord, WHAT_WE_CHANGED_ID, WhatWeChangedLead, WhenCompared } from './what-we-changed'
import { recordFixture, whatWeChangedFixture } from './fixture'

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

  it('says why September is not compared in the preview’s three cells: each figure with its base and what it counts, the update once', () => {
    const t = read(lead)
    expect(t).toContain('Why September is not compared')
    // WP1.8's one figure over the market (the 26 Sep ruling), never the strict count (376 of 625).
    expect(t).not.toContain('376')
    // The update the three were read with, said once beside the heading
    // (R-a: the preview prints no "read with" in a cell).
    expect(t).toContain('Why September is not compared read with the 27 Sep update 356 of 654')
    expect(t.match(/read with the 27 Sep update/g) ?? []).toHaveLength(1)
    expect(t).toContain('356 of 654 September videos came from searches we added in September 65 of 654')
    expect(t).toContain('65 of 654 September videos had been let in without our relevance check 15 against 23')
    expect(t).toContain('15 against 23 Dated comments a video: September’s median, against August’s')
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

describe('The record: the dated list, grouped as the preview groups it (R-a)', () => {
  const f = recordFixture()
  const list = <TheRecord view={f.view} />

  it('prints the search changes under "What we search" and the rest under "How we check, mark and file videos", one line per change', () => {
    const t = read(list)
    expect(t.indexOf('What we search')).toBeLessThan(t.indexOf('17 Sep'))
    expect(t.indexOf('How we check, mark and file videos')).toBeGreaterThan(t.indexOf('13 Sep'))
    expect(f.view.groups.map((g) => [g.key, g.lines.map((l) => l.line.date.slice(0, 10))])).toEqual([
      ['search', ['2026-09-17', '2026-09-17', '2026-09-13']],
      ['check', ['2026-09-26', '2026-09-26', '2026-09-20']],
    ])
    // One line per change (§4.2): the 17 Sep script's terms and rivals stay
    // two lines inside the group.
    expect((t.match(/search terms added/g) ?? []).length).toBe(2)
    expect(t).toContain('4 rivals added')
    assertCopyContract(render(list))
  })

  it('draws the preview’s columns, the comparisons column last', () => {
    const t = read(list)
    expect(t).toContain('Date What we changed August September Comparisons it stops')
  })

  it('names the terms a change only added as the preview does, without "in:"', () => {
    const t = read(list)
    expect(t).toContain('handmade bag, sustainable fashion and travel gear')
    expect(t).not.toContain('in: handmade bag')
  })

  it('says "read with …" once: in the search aside’s figure sentence, and beside the other group’s heading, never in every cell', () => {
    const t = read(list)
    expect(t.match(/read with the 27 Sep update/g) ?? []).toHaveLength(2)
    expect(t).toContain('356 of 654 September videos came from searches we added in September, read with the 27 Sep update.')
    expect(t).not.toContain('376 of 625')
    expect(t).toContain('How we check, mark and file videos read with the 27 Sep update')
    expect(t).toContain('182 of 654')
  })

  it('prints a measured zero as "none", an unmeasured month as "not measured yet", and nothing for the capped update, which moves no video', () => {
    const gate = f.view.groups[1].lines.find((l) => l.line.surface === 'gate_rule')!
    expect(gate.cells.map((c) => c.state)).toEqual(['none', 'measured'])
    const capped = f.view.groups[1].lines.find((l) => l.line.surface === 'other')!
    expect(capped.cells.map((c) => c.state)).toEqual(['blank', 'blank'])
    expect(read(list)).toContain('not measured yet')
  })

  it('says what each change stops, the search group together in one aside', () => {
    const t = read(list)
    expect(t).toContain('Together, these stop')
    expect(t).toContain('Stops August against September')
    expect(t).toContain('Since 17 Sep nothing we search has changed.')
    expect(t).toContain('Stops August against September, for themes')
    expect(t).toContain('Stops Pairs with August or September, for brands and themes, until measured')
    // The capped update is a gather flag: it stops nothing, and says so.
    expect(t).toContain('An update gathered less than usual because a spending cap was reached.')
    expect(t).toMatch(/Comparisons it stops none no pair is refused for it/)
  })

  it('lays out on the table’s own width, never the window’s, so it cannot scroll the page sideways', () => {
    const markup = render(list)
    expect(markup).toContain('@container/rec')
    expect(markup).toContain('@min-[760px]/rec:grid-cols-[76px_minmax(0,1fr)_104px_104px_240px]')
    expect(markup).toContain('@min-[560px]/rec:grid-cols-[76px_minmax(0,1fr)_104px_104px]')
    expect(markup).not.toMatch(/\b(lg|xl):grid-cols/)
  })

  it('without a judge says nothing about what a change stops', () => {
    const t = read(<TheRecord view={recordFixture({ judged: false }).view} />)
    expect(t).not.toContain('Together, these stop')
    expect(t).not.toContain('Stops ')
    expect(t).toContain('Since 17 Sep nothing we search has changed.')
  })

  it('without a measure prints every cell as not measured, never a zero', () => {
    const t = read(<TheRecord view={recordFixture({ measured: false }).view} />)
    expect(t).not.toMatch(/\b0 of\b/)
    expect(t).not.toContain('read with the')
  })

  it('says so plainly when nothing is on record', () => {
    expect(read(<TheRecord view={{ months: [], groups: [], aside: null }} />)).toContain('No change of ours is on record for this workspace yet.')
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
      <TheRecord key="b" view={recordFixture().view} />,
      <WhenCompared key="c" rules={f.rules} block={f.block} asAt={f.asAt} />,
    ]) {
      const header = render(node).match(/<header[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? ''
      // The eyebrow and nothing beside it.
      expect((header.match(/<span/g) ?? []).length).toBe(0)
      expect(render(node).toLowerCase()).not.toContain('how sound')
    }
  })
})
