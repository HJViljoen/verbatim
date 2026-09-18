import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { Tile, TileBlock, StripCell, TileEmpty } from './tile'
import { PageGrid, TileColumns } from './page-grid'

// The grid's unit, tested at the level it is a promise: what a tile PRINTS.
//
// Two of Tile's paths shipped with no reader (Block D wave 1, P0 item 2).
// `variant="hero"` carries the page's one sentence in the serif face, and
// `distribute="between"` is MASTER §0 rule 8 ("tiles spread their content") —
// both existed, neither was asserted anywhere, and the seventeen artboards
// bind to both. A path with no test is a path the next port is free to lose.

describe('Tile, variant="hero"', () => {
  const LEAD = 'Repairability is the conversation your market keeps having, and nobody is answering it.'

  it('sets the lead in the serif face at the ramp\'s 17px', () => {
    const markup = render(<Tile col={7} row={3} variant="hero" eyebrow="In one sentence" lead={LEAD}><p>body</p></Tile>)
    expect(markup).toContain('font-serif')
    expect(markup).toContain('text-[17px]')
    expect(renderText(markup)).toContain(LEAD)
  })

  it('carries the rest of the hero ramp — 500, 1.35, -0.005em, pretty, three lines', () => {
    const markup = render(<Tile col={7} row={3} variant="hero" lead={LEAD} />)
    expect(markup).toContain('font-medium')
    expect(markup).toContain('leading-[1.35]')
    expect(markup).toContain('tracking-[-0.005em]')
    expect(markup).toContain('[text-wrap:pretty]')
    // A lead that runs past three lines has stopped being one sentence.
    expect(markup).toContain('line-clamp-3')
  })

  it('takes the hero\'s own padding, not the default tile\'s', () => {
    expect(render(<Tile col={7} row={3} variant="hero" lead={LEAD} />)).toContain('px-5 py-4')
    expect(render(<Tile col={7} row={3}><p>body</p></Tile>)).toContain('px-4 py-3.5')
  })

  // The trap this test exists to mark: `lead` is a hero-only slot and every
  // other variant drops it without a word.
  it('prints no lead on a tile that is not a hero', () => {
    expect(renderText(<Tile col={5} row={2} eyebrow="Audience sentiment" lead={LEAD}><p>body</p></Tile>)).not.toContain(LEAD)
  })
})

describe('Tile, distribute', () => {
  it('spreads its body on "between" — MASTER rule 8', () => {
    expect(render(<Tile col={5} row={2} distribute="between"><p>body</p></Tile>)).toContain('justify-between')
  })

  it('centres on "center" and packs to the top by default', () => {
    expect(render(<Tile col={5} row={2} distribute="center"><p>body</p></Tile>)).toContain('justify-center')
    const packed = render(<Tile col={5} row={2}><p>body</p></Tile>)
    expect(packed).not.toContain('justify-between')
    expect(packed).not.toContain('justify-center')
  })

  // A strip's cells ARE its layout: it renders its children raw, with no body
  // wrapper for a distribution to apply to.
  it('is ignored by a strip, which has no body to distribute', () => {
    const markup = render(
      <Tile col={12} row={1} variant="strip" distribute="between">
        <StripCell eyebrow="Videos read">1,388</StripCell>
      </Tile>,
    )
    expect(markup).not.toContain('justify-between')
    expect(renderText(markup)).toContain('1,388')
  })
})

describe('Tile chrome', () => {
  it('prints the eyebrow, the meta and both ends of the footer', () => {
    const words = renderText(
      <Tile col={5} row={2} eyebrow="Audience sentiment" meta="1,221 rated" footer="Hear these voices →" footerNote="all-time">
        <p>body</p>
      </Tile>,
    )
    expect(words).toContain('Audience sentiment')
    expect(words).toContain('1,221 rated')
    expect(words).toContain('Hear these voices')
    expect(words).toContain('all-time')
  })

  it('keeps its size when it is empty — the grid never collapses', () => {
    const markup = render(<Tile col={5} row={2} eyebrow="Audience sentiment"><TileEmpty>Counted with the first update.</TileEmpty></Tile>)
    expect(markup).toContain('min-h-[248px]')
    expect(renderText(markup)).toContain('Counted with the first update.')
  })

  it('nests exactly two levels — a tile and a flat inner block', () => {
    const markup = render(<Tile col={5} row={2}><TileBlock>inner</TileBlock></Tile>)
    expect(markup).toContain('shadow-tile')
    expect(markup).toContain('bg-inner')
    // The inner block carries no shadow and no border of its own.
    expect(markup).not.toContain('border border-')
  })
})

describe('TileColumns', () => {
  it('sits two-up above xl and stacks below it', () => {
    const markup = render(<TileColumns of={2}><div>left</div><div>right</div></TileColumns>)
    expect(markup).toContain('grid-cols-1')
    expect(markup).toContain('xl:grid-cols-2')
    const words = renderText(markup)
    expect(words).toContain('left')
    expect(words).toContain('right')
  })

  it('sits three-up on request', () => {
    expect(render(<TileColumns of={3}><div>a</div><div>b</div><div>c</div></TileColumns>)).toContain('xl:grid-cols-3')
  })

  it('carries the artboard\'s 16px gutter and a hairline between columns', () => {
    const markup = render(<TileColumns of={2}><div>a</div><div>b</div></TileColumns>)
    expect(markup).toContain('gap-4')
    expect(markup).toContain('divide-border/70')
    // The rule is vertical between columns and horizontal once they stack, so
    // it never draws a line beside a column that is no longer beside anything.
    expect(markup).toContain('divide-y')
    expect(markup).toContain('nth-child(2n+1))]:border-l')
    expect(markup).toContain('xl:divide-y-0')
  })

  // `divide-x` is a sibling selector and knows nothing about grid position:
  // with four children two-up it ruled children 2, 3 and 4, so the first cell
  // of the SECOND row drew a vertical hairline against the container's edge,
  // beside nothing. The rule is keyed to the column a child lands in instead,
  // so any child count is safe and a caller does not have to know that the
  // count must equal `of`.
  it('rules between columns, not between siblings — a second row starts clean', () => {
    const four = render(<TileColumns of={2}><div>a</div><div>b</div><div>c</div><div>d</div></TileColumns>)
    expect(four).not.toContain('divide-x')
    expect(four).toContain('nth-child(2n+1)')
    expect(render(<TileColumns of={3}><div>a</div><div>b</div><div>c</div><div>d</div></TileColumns>)).toContain('nth-child(3n+1)')
  })

  it('takes a caller class without losing its own', () => {
    const markup = render(<TileColumns of={2} className="items-start"><div>a</div><div>b</div></TileColumns>)
    expect(markup).toContain('items-start')
    expect(markup).toContain('xl:grid-cols-2')
  })
})

describe('PageGrid', () => {
  it('is twelve columns of 116px rows above xl, and one column below', () => {
    const markup = render(<PageGrid><Tile col={5} row={2}><p>body</p></Tile></PageGrid>)
    expect(markup).toContain('xl:grid-cols-12')
    expect(markup).toContain('xl:auto-rows-[116px]')
    expect(markup).toContain('grid-cols-1')
    expect(markup).toContain('gap-4')
    expect(markup).toContain('xl:col-span-5')
    expect(markup).toContain('xl:row-span-2')
  })
})
