import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { ossurVoicesFixture, sealandVoicesFixture, VOICES_FIXTURES } from '@/lib/pages/v2/voices-fixture'
import { BrandsCard, VerdictNote } from './brands'

describe('Brands in your market: ruling U6', () => {
  it('a counted brand\'s top subject counts the ready subjects alone', () => {
    const d = VOICES_FIXTURES['ossur-counted']()
    const card = renderText(<BrandsCard brands={d.brands} monthWords={d.monthWords} />)
    expect(card).toContain('Cost & access · 21 of 37')
    expect(card).not.toContain('Fit & comfort')
  })

  it('with no subject ready, the table never says "no subject"', () => {
    const d = VOICES_FIXTURES['ossur-counted']()
    const brands = { ...d.brands, rows: d.brands.rows.map((r) => ({ ...r, topSubject: null, subjectsPending: 6 })) }
    const t = renderText(<BrandsCard brands={brands} monthWords={d.monthWords} />)
    expect(t).not.toContain('no subject yet')
    expect(t).toContain('Not measured yet')
  })
})

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
    expect(m0).toContain('href="/dashboard/voices/brands/c-fom"')
    // Each row opens the brand's page and ends in the chevron (17 Oct).
    expect(m0).toContain('href="/dashboard/voices/brands/c0000000-0000-0000-0000-000000000003"')
    expect(m0.match(/data-row-chevron=""/g)?.length).toBe(d.brands.rows.length)
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

  // The parity pass (13 Oct): the board's table in every state. Össur today
  // has rules and no month row: the table keeps its heads, draws every
  // tracked brand as a row (you first) with its cells empty, and says once,
  // under the heads, that brands are not counted yet.
  it('Össur: rules and no month row yet, so the table keeps its rows and says once that nothing is counted', () => {
    const d = ossurVoicesFixture()
    const node = <BrandsCard brands={d.brands} monthWords={d.monthWords} />
    const text = renderText(node)
    expect(text).toContain('Brand Named in Praised · complained Talked about for Brands are not counted for this workspace yet. Össur You Ottobock')
    expect(text.match(/not counted/g)).toHaveLength(1)
    expect(text).not.toMatch(/\d+ of \d+/)
    const m = render(node)
    expect(m.match(/data-brand="/g)).toHaveLength(2)
    expect(m.match(/data-empty-track=""/g)).toHaveLength(2 * 3)
    // The key names the bars' colours: no bar, no key.
    expect(text).not.toContain('videos where people praised')
    // Each tracked brand still opens, and the latest finding is the note.
    expect(m).toContain('href="/dashboard/voices/brands/5ecfa431"')
    expect(text).toContain('Ottobock: Ottobock’s talk turns on getting a knee paid for Open Ottobock →')
    assertCopyContract(node)
  })

  it('Össur after its back-read: your row first, not counted yet, and the rivals counted', () => {
    const d = VOICES_FIXTURES['ossur-counted']()
    const node = <BrandsCard brands={d.brands} monthWords={d.monthWords} />
    const text = renderText(node)
    expect(text).toContain('Össur You not counted yet Ottobock 12 of 402 videos')
    expect(text).toContain('12 · 18 of 37 Cost & access · 21 of 37')
    // Your row is drawn, so the lines under the table do not name it again.
    expect(text.match(/Össur/g)).toHaveLength(1)
    const m = render(node)
    expect(m.indexOf('data-brand="client"')).toBeLessThan(m.indexOf('data-brand="5ecfa431"'))
    assertCopyContract(node)
  })

  it('your row named only when asked prints its 0 and how people treat it, never "not read"', () => {
    const d = VOICES_FIXTURES['sealand-you-quiet']()
    const node = <BrandsCard brands={d.brands} monthWords={d.monthWords} />
    const text = renderText(node)
    expect(text).toContain('Sealand You 0 of 743 videos')
    expect(text).toContain('0 · 0 of 1 Durability · 1 of 1')
    expect(text).not.toContain('not read')
    assertCopyContract(node)
  })

  it('a table with nothing named unprompted keeps its heads and says so inside it', () => {
    const d = sealandVoicesFixture()
    const quiet = { ...d.brands, rows: [], all: d.brands.all.filter((r) => !r.you), notNamed: [] }
    const text = renderText(<BrandsCard brands={quiet} monthWords={d.monthWords} />)
    expect(text).toContain('Brand Named in Praised · complained Talked about for No brand you track was named without being asked in September.')
    assertCopyContract(<BrandsCard brands={quiet} monthWords={d.monthWords} />)
  })

  it('a refused comparison prints nothing beside the level', () => {
    const d = sealandVoicesFixture()
    const v = d.brands.rows[1].verdict!
    expect(render(<VerdictNote verdict={{ ...v, state: 'refused', refusedReason: 'tracking_change' }} you={false} />)).toBe('')
    expect(render(<VerdictNote verdict={null} you={false} />)).toBe('')
  })
})
