import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { ossurVoicesFixture, sealandVoicesFixture, VOICES_FIXTURES } from '@/lib/pages/v2/voices-fixture'
import { BrandsCard, VerdictNote } from './brands'

describe('Brands in your market: ruling U6', () => {
  it('a counted brand\'s top subject counts the ready subjects alone', () => {
    const d = VOICES_FIXTURES['ossur-counted']()
    const card = renderText(<BrandsCard brands={d.brands} monthWords={d.monthWords} />)
    // A bare count: its base is the row's own "Videos naming it" (decision 2).
    expect(card).toContain('Ottobock Named without being asked 12 of 402 videos too few to compare Videos naming it 37 Praised it 12 Complained 18 Talked about most for Cost & access, 21')
    expect(card).not.toContain('Fit & comfort')
  })

  it('with no subject ready, the table never says "no subject"', () => {
    const d = VOICES_FIXTURES['ossur-counted']()
    const brands = { ...d.brands, rows: d.brands.rows.map((r) => ({ ...r, topSubject: null, subjectsPending: 6 })) }
    const t = renderText(<BrandsCard brands={brands} monthWords={d.monthWords} />)
    expect(t).not.toMatch(/no subject yet/i)
    expect(t).toContain('Not measured yet')
  })
})

describe('Brands in your market', () => {
  it('Sealand: named unprompted with its verdict, praised and complained over every video naming it, the top subject', () => {
    const d = sealandVoicesFixture()
    const node = <BrandsCard brands={d.brands} monthWords={d.monthWords} />
    const text = renderText(node)
    expect(text).toContain('Sealand You Named without being asked 1 of 743 videos too few to compare')
    // Named without being asked, then the videos naming it, praised and
    // complained in them, and the subject most of them carry (the board's
    // six columns, no bars).
    expect(text).toContain('Patagonia Named without being asked 13 of 743 videos too few to compare Videos naming it 65 Praised it 50 Complained 43 Talked about most for Durability, 19')
    // (renderText spaces every tag: on the page the comma sits on the link.)
    expect(text).toContain('Not named without being asked in September: Freedom of Movement , Rareform')
    expect(text).toContain('Praised, complained and talked about are September’s alone: each brand’s videos are too few to set against August')
    expect(text).not.toContain('this month')
    // The six heads; what the 743 are, said once in the note under the
    // table with why the crosses carry no change (the board's one note).
    expect(text).toContain('Brand Named without being asked Videos naming it Praised it Complained Talked about most for Sealand You')
    expect(text).toContain('Named without being asked counts the 743 videos in September we did not find by searching for a brand, so a brand named in them was named without being asked. Praised, complained and talked about are September’s alone')
    const m0 = render(node)
    // The board's header is drawn at every width (two rows of two below lg).
    expect(m0).not.toContain('max-lg:hidden')
    expect(m0).toContain('href="/dashboard/voices/brands/c-fom"')
    // Each row opens the brand's page by its name (17 Oct), with no chevron
    // (the audit design).
    expect(m0).toContain('href="/dashboard/voices/brands/c0000000-0000-0000-0000-000000000003"')
    expect(m0).not.toContain('data-row-chevron')
    expect(m0.match(/<tr data-brand="/g)?.length).toBe(d.brands.rows.length)
    // The finding, and its brand's page named in the link.
    expect(text).toContain('Patagonia is praised for lasting for years, and the repair promise is what people repeat Open Patagonia')
    const m = render(node)
    expect(m).toMatch(/data-copy="verdict"[^>]*><span class="text-xs font-medium text-muted-foreground"[^>]*>too few to compare/)
    expect(m).toContain('data-copy="stored" data-slot="pass_c_finding"')
    expect(m).not.toContain('data-copy="quote"')
    // You first, then the most named.
    expect(text.indexOf('Sealand You')).toBeLessThan(text.indexOf('Patagonia Named without being asked 13'))
    expect(text.indexOf('Patagonia Named without being asked 13')).toBeLessThan(text.indexOf('The North Face'))
    // On a phone each brand stacks (decision 14): the head hides, and each
    // figure says what it is, the labels a phone's alone.
    expect(m).toMatch(/<thead class="max-sm:hidden">/)
    expect(m).toMatch(/<span class="[^"]*sm:hidden[^"]*">Praised it <\/span>/)
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
    expect(text).toContain('Brand Named without being asked Videos naming it Praised it Complained Talked about most for Brands are not counted for this workspace yet. Össur You Ottobock')
    expect(text.match(/not counted/g)).toHaveLength(1)
    expect(text).not.toMatch(/\d+ of \d+/)
    const m = render(node)
    expect(m.match(/data-brand="/g)).toHaveLength(2)
    // The names stay, their cells empty: no empty tracks (decision 4).
    expect(m).not.toContain('data-empty-track')
    // The key names the bars' colours: no bar, no key.
    expect(text).not.toContain('videos where people praised')
    // Each tracked brand still opens, and the latest finding is the note.
    expect(m).toContain('href="/dashboard/voices/brands/5ecfa431"')
    expect(text).toContain('Ottobock’s talk turns on getting a knee paid for Open Ottobock')
    expect(text).not.toContain('→')
    assertCopyContract(node)
  })

  it('Össur after its back-read: your row first, not counted yet, and the rivals counted', () => {
    const d = VOICES_FIXTURES['ossur-counted']()
    const node = <BrandsCard brands={d.brands} monthWords={d.monthWords} />
    const text = renderText(node)
    expect(text).toContain('Össur You Not counted yet Ottobock Named without being asked 12 of 402 videos')
    expect(text).toContain('Videos naming it 37 Praised it 12 Complained 18 Talked about most for Cost & access, 21')
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
    expect(text).toContain('Sealand You Named without being asked 0 of 743 videos')
    expect(text).toContain('Sealand You Named without being asked 0 of 743 videos too few to compare Videos naming it 1 Praised it 0 Complained 0 Talked about most for Durability, 1')
    expect(text).not.toMatch(/not read/i)
    assertCopyContract(node)
  })

  it('a table with nothing named unprompted keeps its heads and says so inside it', () => {
    const d = sealandVoicesFixture()
    const quiet = { ...d.brands, rows: [], all: d.brands.all.filter((r) => !r.you), notNamed: [] }
    const text = renderText(<BrandsCard brands={quiet} monthWords={d.monthWords} />)
    expect(text).toContain('Brand Named without being asked Videos naming it Praised it Complained Talked about most for No brand you track was named without being asked in September.')
    assertCopyContract(<BrandsCard brands={quiet} monthWords={d.monthWords} />)
  })

  it('a refused comparison prints nothing beside the level', () => {
    const d = sealandVoicesFixture()
    const v = d.brands.rows[1].verdict!
    expect(render(<VerdictNote verdict={{ ...v, state: 'refused', refusedReason: 'tracking_change' }} you={false} />)).toBe('')
    expect(render(<VerdictNote verdict={null} you={false} />)).toBe('')
  })
})
