import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { CatalogueShelf, ShelfLegend, shelfTone } from './catalogue-shelf'
import { SHELF } from './fixture'

const shelf = (selected: string | null = 'liners') => <CatalogueShelf columns={SHELF} selected={selected} panelId="group-panel" />

describe('CatalogueShelf', () => {
  it('shades each product by its videos: quiet, one or two, three to five, six or more', () => {
    expect([0, 1, 2, 3, 5, 6, 40].map(shelfTone)).toEqual([0, 1, 1, 2, 2, 3, 3])
    const m = render(shelf())
    // Next's Link writes `href` last.
    expect(m).toMatch(/<a data-tone="3" class="[^"]*bg-brand text-brand-foreground" href="\?product=seal-in-x"/)
    expect(m).toMatch(/<a data-tone="2" class="[^"]*bg-brand\/65 text-brand-foreground" href="\?product=comfort"/)
    expect(m).toMatch(/<a data-tone="1" class="[^"]*bg-accent text-accent-foreground" href="\?product=synergy"/)
    expect(m).toMatch(/<a data-tone="0" class="[^"]*border-dashed[^"]*" href="\?product=dermo"/)
  })

  it('prints every count, a quiet product a dash a screen reader hears as none', () => {
    const text = renderText(shelf())
    expect(text).toContain('Liners 52 videos Iceross Seal-In X 6 Iceross Comfort 3 Iceross Synergy 2 Iceross Seal-In V – no videos')
    expect(text).toContain('Couldn’t tell which · 11')
    // The quiet category prints its zero and no "couldn't tell" link.
    expect(text).toContain('Sockets & suspension 0 videos Direct Socket – no videos Icelock 200 – no videos')
    assertCopyContract(shelf())
  })

  it('says "not read yet" for a product or a category the period holds no reading for, never a quiet zero', () => {
    const cols = SHELF.map((c, i) => (i === 0 ? { ...c, products: c.products.map((p, j) => (j === 0 ? { ...p, videos: null } : p)) } : i === 1 ? { ...c, videos: null } : c))
    const node = <CatalogueShelf columns={cols} />
    const text = renderText(node)
    expect(text).toContain('Iceross Seal-In X not read yet')
    expect(text).toMatch(/Not read yet/)
    assertCopyContract(node)
  })

  it('a whole period not read says so once a column, and its tiles print their names alone (the parity pass)', () => {
    const cols = SHELF.map((c) => ({ ...c, videos: null, line: null, note: null, unclear: null, products: c.products.map((p) => ({ ...p, videos: null, flag: null })) }))
    const node = <CatalogueShelf columns={cols} unread />
    const text = renderText(node)
    expect(text.match(/Not read yet/g)).toHaveLength(SHELF.length)
    expect(text).not.toContain('not read yet')
    expect(text).toContain('Liners Not read yet Iceross Seal-In X Iceross Comfort')
    expect(render(node)).not.toMatch(/data-tone="[123]"/)
    assertCopyContract(node)
  })

  it('cuts a long column to a "+N more" tile into its category\'s panel', () => {
    const cols = SHELF.map((c, i) => (i === 0 ? { ...c, products: c.products.slice(0, 2), more: { count: 6, href: '?group=liners#group-panel' } } : c))
    const node = <CatalogueShelf columns={cols} />
    const m = render(node)
    expect(m).toMatch(/<a data-more="" class="[^"]*border-dashed[^"]*" href="\?group=liners#group-panel"><span>\+<span data-copy="figure"[^>]*>6<\/span> more<\/span>/)
    expect(m.match(/data-more=""/g)).toHaveLength(1)
    assertCopyContract(node)
  })

  it('rings the open column\'s head and ties it to the panel', () => {
    const m = render(shelf('liners'))
    expect(m).toMatch(/<a aria-expanded="true" aria-controls="group-panel" aria-current="true" class="[^"]*ring-2 ring-foreground" href="\?group=liners#group-panel"/)
    expect(m.match(/ring-2 ring-foreground/g)).toHaveLength(1)
    expect(render(shelf(null))).not.toContain('ring-2 ring-foreground')
  })

  it('flags a product through its verdict, never a word passed in', () => {
    const m = render(shelf())
    expect(m).toMatch(/Navii<\/span><span data-copy="verdict" data-flag="new"[^>]*>New<\/span>/)
  })

  it('keys the shades in its legend', () => {
    expect(renderText(<ShelfLegend />)).toBe('1–2 3–5 6+ quiet')
    assertCopyContract(<ShelfLegend />)
  })
})
