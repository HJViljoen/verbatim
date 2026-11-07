import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { ossurProductsFixture, PRODUCTS_FIXTURES } from '@/lib/pages/v2/products-fixture'
import { productsBasis, PRODUCTS_NO_CATALOGUE, PRODUCTS_NOT_APPLIED, PRODUCTS_NOT_ON } from '@/lib/pages/v2/products'
import { StatStrip } from '@/components/v2'
import { ProductsEmpty, ProductsPage, productsStats } from '.'

const strip = (d: Parameters<typeof productsStats>[0]) => renderText(<StatStrip items={productsStats(d)} />)

describe('the Your products page (boards E4-Products and G4-Products)', () => {
  it('keeps the copy contract on every fixture, every state', () => {
    for (const f of Object.values(PRODUCTS_FIXTURES)) assertCopyContract(<ProductsPage data={f()} />)
  })

  it('says "this month" nowhere: the page reads a named month', () => {
    for (const f of Object.values(PRODUCTS_FIXTURES)) expect(renderText(<ProductsPage data={f()} />)).not.toMatch(/this month/i)
  })

  it('prints no quote at level 1 (quotes are the level pages\'), and opens no panel: every head, tile and card is a page', () => {
    for (const f of Object.values(PRODUCTS_FIXTURES)) {
      const m = render(<ProductsPage data={f()} />)
      expect(m).not.toContain('data-copy="quote"')
      expect(m).not.toContain('data-panel')
      expect(m).not.toMatch(/href="\/dashboard\/products\?(?:[^"]*&amp;)?(?:group|product)=/)
    }
  })

  it('each category is a row whose name opens its page, with no arrow (the audit design)', () => {
    const m = render(<ProductsPage data={PRODUCTS_FIXTURES.ossur()} />)
    expect(m.match(/data-column="/g)).toHaveLength(6)
    expect(m).not.toContain('data-head-opens')
    expect(m.match(/<h3 class="[^"]*"><a [^>]*href="\/dashboard\/products\/[^"/]+"/g)).toHaveLength(6)
    expect(renderText(<ProductsPage data={PRODUCTS_FIXTURES.ossur()} />)).not.toMatch(/[→↗↓]/)
  })

  it('prints no en or em dash: the legend reads "1 to 2" and "3 to 5", a quiet tile a drawn rule', () => {
    for (const f of Object.values(PRODUCTS_FIXTURES)) expect(render(<ProductsPage data={f()} />)).not.toMatch(/[\u2013\u2014]/)
    expect(renderText(<ProductsPage data={PRODUCTS_FIXTURES.ossur()} />)).toContain('Videos in September 1 to 2 3 to 5 6 or more Quiet, no videos')
  })

  it('the figures row: the month, the products that came up of the catalogue, those quiet, the categories, the videos about them; the board\'s switch in months', () => {
    const d = PRODUCTS_FIXTURES.ossur()
    const quiet = d.shelf.reduce((s, c) => s + c.products.filter((p) => p.videos === 0).length, 0)
    expect(strip(d)).toBe(`The last full month September Your products that came up 15 of your ${d.catalogue.products} Quiet in September ${quiet} products Categories 6 About them or their categories 412 videos`)
    // Quiet counts the products read at none, never one not read yet.
    const withUnread = { ...d, shelf: d.shelf.map((c, i) => (i === 0 ? { ...c, products: c.products.map((p, j) => (j === c.products.length - 1 ? { ...p, videos: null } : p)) } : c)) }
    expect(strip(withUnread)).toContain(`Quiet in September ${quiet - 1} products`)
    const m = render(<ProductsPage data={d} />)
    expect(m).toContain('data-stat-strip=""')
    expect(m).not.toContain('data-bar-meta')
    expect(m).toContain('>Your products</h1>')
    expect(m).not.toContain('aria-label="Period"')
    // THE SWITCH (the parity pass): the board's control, in the months the
    // page reads by; the page's month marked; each option an address.
    expect(m).toContain('aria-label="Month"')
    const today = render(<ProductsPage data={PRODUCTS_FIXTURES['ossur-today']()} />)
    expect(today).toMatch(/<a aria-current="page" [^>]*href="\/dashboard\/products\?month=2026-09">September<\/a>/)
    expect(renderText(<ProductsPage data={PRODUCTS_FIXTURES['ossur-today']()} />)).toContain('August September October so far')
    // A month not read yet keeps the switch: the way back to one that is.
    const unread = render(<ProductsPage data={PRODUCTS_FIXTURES.unread()} />)
    expect(unread).toMatch(/<a aria-current="page" [^>]*href="\/dashboard\/products\?month=2026-10">October so far<\/a>/)
    expect(unread).toContain('href="/dashboard/products?month=2026-09"')
    // No switch, no empty wrapper; and the switch is drawn once, never a
    // second copy for a phone.
    expect(render(<ProductsPage data={PRODUCTS_FIXTURES.sealand()} />)).not.toContain('-mt-2')
    expect(m.match(/aria-label="Month"/g)).toHaveLength(1)
  })

  // Decision 3: the month's label on the bar only where the page reads a
  // month that is not the current calendar month.
  it('labels the month in the figures row only where it is not the current calendar month', () => {
    expect(strip(ossurProductsFixture({}, { now: '2026-10-13T08:00:00.000Z' }))).toMatch(/^The last full month September Your products that came up 15 of your/)
    expect(strip(ossurProductsFixture({}, { now: '2026-12-02T08:00:00.000Z' }))).toMatch(/^An earlier month September /)
    expect(strip(ossurProductsFixture({}, { now: '2026-09-20T08:00:00.000Z', soFar: true }))).toMatch(/^Month September so far Your products that came up 15 of your/)
    expect(strip(ossurProductsFixture({}, { now: undefined }))).toMatch(/^Month September Your products that came up 15 of your/)
    // The current month, not read yet: "October so far", no label.
    expect(strip(PRODUCTS_FIXTURES.unread())).toMatch(/^Month October so far Your products \d+ products in 6 categories$/)
    // A state that reads no month names none, label or not.
    expect(strip(PRODUCTS_FIXTURES['not-on']())).not.toMatch(/month/i)
    for (const d of [ossurProductsFixture(), PRODUCTS_FIXTURES['ossur-today']()]) assertCopyContract(<ProductsPage data={d} />)
  })

  it('draws the standouts, then the catalogue, then the Settings link', () => {
    const text = renderText(<ProductsPage data={PRODUCTS_FIXTURES.ossur()} />)
    const at = (s: string) => text.indexOf(s)
    expect(at('Navii came up for the first time')).toBeGreaterThan(-1)
    expect(at('Navii came up for the first time')).toBeLessThan(at('Your catalogue'))
    expect(at('Your catalogue')).toBeLessThan(at('Edit your products in Settings'))
    expect(text).toContain(productsBasis('Össur'))
    expect(text).toContain('Counted on every video in your market, including creators’ videos about Össur and the comments on your own posts. What your own posts say (captions, hashtags, voice-over, on-screen text) is never counted.')
  })

  it('the honest states keep the board\'s frame: the four places, the catalogue card with its line, the catalogue where there is one (the parity pass)', () => {
    for (const key of ['not-applied', 'sealand', 'not-on', 'unread'] as const) {
      const m = render(<ProductsPage data={PRODUCTS_FIXTURES[key]()} />)
      expect(m, key).toContain('data-frames=""')
      expect(m.match(/data-standout="/g), key).toHaveLength(4)
      expect(m, key).toContain('id="catalogue-title"')
      // No count of talk: no shaded tile, no "Open" into a reading.
      expect(m, key).not.toMatch(/data-tone="[123]"/)
      expect(renderText(<ProductsPage data={PRODUCTS_FIXTURES[key]()} />), key).not.toMatch(/Open [A-Z]/)
      assertCopyContract(<ProductsPage data={PRODUCTS_FIXTURES[key]()} />)
    }
    // No catalogue: the shelf's empty shape, no name. A catalogue not read:
    // every category a column, every product its name alone.
    expect(render(<ProductsPage data={PRODUCTS_FIXTURES.sealand()} />)).toContain('data-empty-shelf=""')
    const notOn = render(<ProductsPage data={PRODUCTS_FIXTURES['not-on']()} />)
    expect(notOn.match(/data-column=/g)).toHaveLength(6)
    expect(renderText(<ProductsPage data={PRODUCTS_FIXTURES['not-on']()} />)).toContain('Liners Not read yet Iceross Seal-In X')
    expect(renderText(<ProductsPage data={PRODUCTS_FIXTURES['not-on']()} />)).not.toContain('not read yet')
    expect(strip(PRODUCTS_FIXTURES.sealand())).toBe('Your products None added yet')
    // The state's line in the dashed box (decision 4).
    expect(render(<ProductsPage data={PRODUCTS_FIXTURES['not-on']()} />)).toContain('data-empty-box=""')
  })

  it('the honest states print their line and no count, and a missing catalogue links to Settings', () => {
    const cases = [
      ['not-applied', PRODUCTS_NOT_APPLIED, null],
      ['sealand', PRODUCTS_NO_CATALOGUE, 'Add your products in Settings'],
      ['not-on', PRODUCTS_NOT_ON, 'Review your products in Settings'],
      ['unread', 'Your products have not been read for October yet.', 'Review your products in Settings'],
    ] as const
    for (const [key, line, link] of cases) {
      const d = PRODUCTS_FIXTURES[key]()
      const text = renderText(<ProductsPage data={d} />)
      expect(text, key).toContain(line)
      if (link) expect(text, key).toContain(link)
      assertCopyContract(<ProductsEmpty data={d} />)
    }
    expect(render(<ProductsPage data={PRODUCTS_FIXTURES.sealand()} />)).toContain('href="/dashboard/settings/products"')
    // Not switched on: the catalogue's size, never a count of talk.
    // Not switched on: no month over a page that reads none (Phase 4 fix round).
    expect(strip(PRODUCTS_FIXTURES['not-on']())).toMatch(/^Your products \d+ products in 6 categories$/)
    expect(strip(PRODUCTS_FIXTURES['not-applied']())).not.toMatch(/September|October/)
    expect(strip(PRODUCTS_FIXTURES.sealand())).not.toMatch(/September|October/)
    // Read but not yet for the month: the month is what is missing, so it stays.
    expect(strip(PRODUCTS_FIXTURES.unread())).toMatch(/^Month October/)
  })
})
