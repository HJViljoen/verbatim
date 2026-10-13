import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { ossurProductsFixture, PRODUCTS_FIXTURES } from '@/lib/pages/v2/products-fixture'
import { productsBasis, PRODUCTS_NO_CATALOGUE, PRODUCTS_NOT_APPLIED, PRODUCTS_NOT_ON } from '@/lib/pages/v2/products'
import { ProductsEmpty, ProductsMeta, ProductsPage } from '.'

describe('the Your products page (boards E4-Products and E4-Products-Liners)', () => {
  it('keeps the copy contract on every fixture, open or not, every state', () => {
    for (const f of Object.values(PRODUCTS_FIXTURES)) assertCopyContract(<ProductsPage data={f()} />)
  })

  it('says "this month" nowhere: the page reads a named month', () => {
    for (const f of Object.values(PRODUCTS_FIXTURES)) expect(renderText(<ProductsPage data={f()} />)).not.toMatch(/this month/i)
  })

  it('prints no quote at level 1 (quotes are the panels\'), and no quote in a panel above its own section', () => {
    expect(render(<ProductsPage data={PRODUCTS_FIXTURES.ossur()} />)).not.toContain('data-copy="quote"')
    const open = render(<ProductsPage data={PRODUCTS_FIXTURES['ossur-liners']()} />)
    expect(open.indexOf('data-copy="quote"')).toBeGreaterThan(open.indexOf('id="category-panel"'))
  })

  it('the bar: the month, the products that came up of the catalogue, the videos about them; the board\'s switch in months', () => {
    const d = PRODUCTS_FIXTURES.ossur()
    expect(renderText(<ProductsMeta data={d} />)).toBe('September · the last full month · 15 of your 66 products came up · 412 videos about them or their categories'.replace('66', String(d.catalogue.products)))
    const m = render(<ProductsPage data={d} />)
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
    // No switch, no empty wrapper.
    expect(render(<ProductsPage data={PRODUCTS_FIXTURES.sealand()} />)).not.toContain('-mt-2')
  })

  // Decision 3: the month's label on the bar only where the page reads a
  // month that is not the current calendar month.
  it('labels the month on the bar only where it is not the current calendar month', () => {
    expect(renderText(<ProductsMeta data={ossurProductsFixture({}, { now: '2026-10-13T08:00:00.000Z' })} />)).toMatch(/^September · the last full month · 15 of your/)
    expect(renderText(<ProductsMeta data={ossurProductsFixture({}, { now: '2026-12-02T08:00:00.000Z' })} />)).toMatch(/^September · an earlier month · /)
    expect(renderText(<ProductsMeta data={ossurProductsFixture({}, { now: '2026-09-20T08:00:00.000Z', soFar: true })} />)).toMatch(/^September so far · 15 of your/)
    expect(renderText(<ProductsMeta data={ossurProductsFixture({}, { now: undefined })} />)).toMatch(/^September · 15 of your/)
    // The current month, not read yet: "October so far", no label.
    expect(renderText(<ProductsMeta data={PRODUCTS_FIXTURES.unread()} />)).toMatch(/^October so far · \d+ products in 6 categories$/)
    // A state that reads no month names none, label or not.
    expect(renderText(<ProductsMeta data={PRODUCTS_FIXTURES['not-on']()} />)).not.toMatch(/month/)
    for (const d of [ossurProductsFixture(), PRODUCTS_FIXTURES['ossur-liners']()]) assertCopyContract(<ProductsPage data={d} />)
  })

  it('draws the standouts, then the catalogue, then the open panel under it, then the Settings link', () => {
    const text = renderText(<ProductsPage data={PRODUCTS_FIXTURES['ossur-liners']()} />)
    const at = (s: string) => text.indexOf(s)
    expect(at('Navii came up for the first time')).toBeGreaterThan(-1)
    expect(at('Navii came up for the first time')).toBeLessThan(at('Your catalogue'))
    expect(at('Your catalogue')).toBeLessThan(at('About one of your products, but we couldn’t tell which'))
    expect(at('About one of your products')).toBeLessThan(at('Edit your products in Settings'))
    expect(text).toContain(productsBasis('Össur'))
    expect(text).toContain('Counted on every video in your market, including creators’ videos about Össur and the comments on your own posts. What your own posts say (captions, hashtags, voice-over, on-screen text) is never counted.')
  })

  it('one panel at a time: a product\'s panel and no category\'s', () => {
    const m = render(<ProductsPage data={PRODUCTS_FIXTURES['ossur-product']()} />)
    expect(m).toContain('id="product-panel"')
    expect(m).not.toContain('id="category-panel"')
  })

  it('the honest states keep the board\'s frame: the four places, the catalogue card with its line, the catalogue where there is one (the parity pass)', () => {
    for (const key of ['not-applied', 'sealand', 'not-on', 'unread'] as const) {
      const m = render(<ProductsPage data={PRODUCTS_FIXTURES[key]()} />)
      expect(m, key).toContain('data-frames=""')
      expect(m.match(/data-standout="/g), key).toHaveLength(4)
      expect(m, key).toContain('id="catalogue-title"')
      // No count of talk: no shaded tile, no "Open" into a reading.
      expect(m, key).not.toMatch(/data-tone="[123]"/)
      expect(renderText(<ProductsPage data={PRODUCTS_FIXTURES[key]()} />), key).not.toContain('Open →')
      assertCopyContract(<ProductsPage data={PRODUCTS_FIXTURES[key]()} />)
    }
    // No catalogue: the shelf's empty shape, no name. A catalogue not read:
    // every category a column, every product its name alone.
    expect(render(<ProductsPage data={PRODUCTS_FIXTURES.sealand()} />)).toContain('data-empty-shelf=""')
    const notOn = render(<ProductsPage data={PRODUCTS_FIXTURES['not-on']()} />)
    expect(notOn.match(/data-column=/g)).toHaveLength(6)
    expect(renderText(<ProductsPage data={PRODUCTS_FIXTURES['not-on']()} />)).toContain('Liners Not read yet Iceross Seal-In X')
    expect(renderText(<ProductsPage data={PRODUCTS_FIXTURES['not-on']()} />)).not.toContain('not read yet')
    expect(renderText(<ProductsMeta data={PRODUCTS_FIXTURES.sealand()} />)).toBe('No products added yet')
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
    expect(renderText(<ProductsMeta data={PRODUCTS_FIXTURES['not-on']()} />)).toMatch(/^\d+ products in 6 categories$/)
    expect(renderText(<ProductsMeta data={PRODUCTS_FIXTURES['not-applied']()} />)).not.toMatch(/September|October/)
    expect(renderText(<ProductsMeta data={PRODUCTS_FIXTURES.sealand()} />)).not.toMatch(/September|October/)
    // Read but not yet for the month: the month is what is missing, so it stays.
    expect(renderText(<ProductsMeta data={PRODUCTS_FIXTURES.unread()} />)).toMatch(/^October/)
  })
})
