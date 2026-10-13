import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { ossurVoicesFixture, sealandVoicesFixture } from '@/lib/pages/v2/voices-fixture'
import type { BrandPanel } from '@/lib/pages/v2/voices'
import { BrandPanelView, BrandsCard, VerdictNote } from './brands'

describe('Brands in your market', () => {
  it('Sealand: named unprompted with its verdict, praised and complained over every video naming it, the top subject', () => {
    const d = sealandVoicesFixture()
    const node = <BrandsCard brands={d.brands} monthWords={d.monthWords} />
    const text = renderText(node)
    expect(text).toContain('Sealand You 1 of 743 videos too few to compare')
    expect(text).toContain('Patagonia 13 of 743 videos too few to compare 50 · 43 of 65 Durability · 19 of 65')
    // (renderText spaces every tag: on the page the comma sits on the link.)
    expect(text).toContain('Not named without being asked in September: Freedom of Movement , Rareform')
    expect(text).toContain('Praised, complained and talked about are September’s alone: each brand’s videos are too few to set against August')
    expect(text).not.toContain('this month')
    // What the 743 are, said where the table starts.
    expect(text).toContain('Brand Named in Praised · complained Talked about for Named in: of the 743 videos in September we did not find by searching for a brand')
    const m0 = render(node)
    // The board's header is drawn at every width (two rows of two below lg).
    expect(m0).not.toContain('max-lg:hidden')
    expect(m0).toContain('href="/dashboard/voices?brand=Freedom+of+Movement#brand-panel"')
    expect(text).toContain('Patagonia: Patagonia is praised for lasting for years')
    const m = render(node)
    expect(m).toMatch(/data-copy="verdict"[^>]*><span class="text-xs font-medium text-muted-foreground"[^>]*>too few to compare/)
    expect(m).toContain('data-copy="stored" data-slot="pass_c_finding"')
    expect(m).not.toContain('data-copy="quote"')
    // You first, then the most named.
    expect(text.indexOf('Sealand You')).toBeLessThan(text.indexOf('Patagonia 13'))
    expect(text.indexOf('Patagonia 13')).toBeLessThan(text.indexOf('The North Face'))
    assertCopyContract(node)
  })

  it('Össur: rules and no month row yet, so the card says the brands are not counted and names them', () => {
    const d = ossurVoicesFixture()
    const node = <BrandsCard brands={d.brands} monthWords={d.monthWords} />
    expect(renderText(node)).toContain('Brands are not counted for this workspace yet. The brands this workspace tracks: Össur , Ottobock .')
    expect(renderText(node)).not.toMatch(/\d+ of \d+/)
    // Each tracked brand still opens, and the latest finding is the note.
    const m = render(node)
    expect(m).toContain('href="/dashboard/voices?brand=Ottobock#brand-panel"')
    expect(renderText(node)).toContain('Ottobock: Ottobock’s talk turns on getting a knee paid for Open Ottobock →')
    assertCopyContract(node)
  })

  it('a refused comparison prints nothing beside the level', () => {
    const d = sealandVoicesFixture()
    const v = d.brands.rows[1].verdict!
    expect(render(<VerdictNote verdict={{ ...v, state: 'refused', refusedReason: 'tracking_change' }} you={false} />)).toBe('')
    expect(render(<VerdictNote verdict={null} you={false} />)).toBe('')
  })
})

describe('a brand\'s panel', () => {
  it('a rival not counted yet (Össur today): the count half says so, the Competitive half stands', () => {
    const d = ossurVoicesFixture({ brand: 'Ottobock' })
    const p = d.panel as BrandPanel
    const node = <BrandPanelView panel={p} monthWords={d.monthWords} />
    const text = renderText(node)
    expect(text).toContain('Ottobock in September: not counted yet.')
    expect(text).toContain('Asked under its content, 3 Jul to 30 Sep Insurance refusals for powered knees 7 videos')
    expect(text).toContain('Said about Ottobock, 3 Jul to 30 Sep')
    expect(text).not.toMatch(/named it without being asked|named it at all/)
    // No empty stats row where nothing is counted.
    expect(render(node)).not.toContain('xl:grid-cols-4')
    assertCopyContract(node)
  })

  const d = sealandVoicesFixture({ brand: 'Patagonia' })
  const panel = d.panel as BrandPanel

  it('the brand\'s month in full, and the Competitive pane re-laid: asked, where its talk differs, said about it', () => {
    const node = <BrandPanelView panel={panel} monthWords={d.monthWords} />
    const text = renderText(node)
    expect(text).toContain('13 of 743 videos named it without being asked too few to compare August: 4 of 250')
    expect(text).toContain('65 of 940 videos named it at all')
    expect(text).toContain('50 of 65 videos naming it, where people praised something')
    expect(text).toContain('What people did in the comments · of its 65 Praised a bag 50 Asked a question 45')
    expect(text).toContain('What they talk about · of its 65 Durability 19')
    expect(text).toContain('Asked under its content, 30 Jun to 27 Sep Is the Black Hole worth it 9 videos')
    expect(text).toContain('Where its talk differs from the rest of the market · the latest update how the talk differs')
    expect(text).toContain('Said about Patagonia, 30 Jun to 27 Sep')
    expect(text).toContain('Ask the Agent about Patagonia')
    const m = render(node)
    expect(m.match(/data-copy="quote"/g)?.length).toBe(2)
    assertCopyContract(node)
  })

  it('your own brand has no rival pane: its month alone', () => {
    const you = sealandVoicesFixture({ brand: 'you' })
    const p = you.panel as BrandPanel
    expect(p.you).toBe(true)
    const node = <BrandPanelView panel={p} monthWords={you.monthWords} />
    const text = renderText(node)
    expect(text).toContain('Brand You Sealand')
    expect(text).not.toMatch(/Asked under|Said about|differs/)
    expect(text).toContain('Ask the Agent about your brand')
    assertCopyContract(node)
  })
})
