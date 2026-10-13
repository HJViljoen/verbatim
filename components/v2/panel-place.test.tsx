import { readFileSync } from 'node:fs'
import { Fragment } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { InPlacePanel, PanelSlot } from './panel'
import {
  equalColumns, NOTCH_VAR_CLASS, notchPct, packRow, PANEL_BREAKPOINTS, PANEL_SLOT_CLASS, panelItemOrder, panelPlacement,
  sameEverywhere, type PanelLayout,
} from './panel-place'

// THE PANEL'S PLACE AT EVERY WIDTH (depth v2, T9). Heinrich's rule: clicking
// an item opens its panel in place, UNDER THE ITEM, with the notch pointing
// at it. A grid whose columns change with the width has to move the panel
// with them: after the clicked card on a phone, after its row of two at 768,
// after its row of three at 1280.

const voices: PanelLayout = { base: equalColumns(1, 5), md: equalColumns(2, 5), xl: equalColumns(3, 5) }

describe('packRow: CSS grid\'s own sparse placement, as a model', () => {
  it('fills a row, then breaks where the next card does not fit', () => {
    expect(packRow(equalColumns(3, 5)).map((c) => c.row)).toEqual([0, 0, 0, 1, 1])
    expect(packRow({ spans: [6, 3, 3], of: 12 })).toEqual([
      { row: 0, start: 0, span: 6 }, { row: 0, start: 6, span: 3 }, { row: 0, start: 9, span: 3 },
    ])
    // Market from 768: the hero takes the row, the two beside it share the next.
    expect(packRow({ spans: [12, 6, 6], of: 12 }).map((c) => c.row)).toEqual([0, 1, 1])
    // A card too wide for what is left starts the next row.
    expect(packRow({ spans: [7, 6], of: 12 }).map((c) => c.row)).toEqual([0, 1])
  })

  it('stacks a 0-wide card in the cell before it (a column of two cards)', () => {
    // Content from 1280: What works (8) beside Worth a reply over Your posts (4).
    expect(packRow({ spans: [8, 4, 0], of: 12 })).toEqual([
      { row: 0, start: 0, span: 8 }, { row: 0, start: 8, span: 4 }, { row: 0, start: 8, span: 4 },
    ])
  })
})

describe('panelPlacement', () => {
  it('orders the panel after the clicked card\'s row at each breakpoint, the cards at 2 × their index', () => {
    // The fourth of five groups (index 3).
    const p = panelPlacement(3, voices)
    expect(p.order).toEqual({ base: 7, sm: 7, md: 7, lg: 7, w1180: 7, xl: 9 })
    // The first: after itself on a phone, after cards 1 and 2 at 768, after
    // the row of three at 1280.
    expect(panelPlacement(0, voices).order).toMatchObject({ base: 1, md: 3, xl: 5 })
    // The last of an unfinished row: after itself.
    expect(panelPlacement(4, voices).order).toMatchObject({ base: 9, md: 9, xl: 9 })
    expect(panelItemOrder(3)).toEqual({ order: 6 })
  })

  it('points the notch at the middle of the clicked card\'s cell', () => {
    expect(panelPlacement(3, voices).notch).toEqual({ base: 0.5, sm: 0.5, md: 0.75, lg: 0.75, w1180: 0.75, xl: 0.1667 })
    // Market's 6 · 3 · 3: the hero, then the second card beside it.
    const market: PanelLayout = { base: { spans: [12, 12, 12], of: 12 }, md: { spans: [12, 6, 6], of: 12 }, xl: { spans: [6, 3, 3], of: 12 } }
    expect(panelPlacement(0, market).notch).toMatchObject({ base: 0.5, md: 0.5, xl: 0.25 })
    expect(panelPlacement(2, market)).toMatchObject({ order: { base: 5, md: 5, xl: 5 }, notch: { base: 0.5, md: 0.75, xl: 0.875 } })
    // A stacked card points where its cell is.
    const content: PanelLayout = { base: equalColumns(1, 3), xl: { spans: [8, 4, 0], of: 12 } }
    expect(panelPlacement(1, content)).toMatchObject({ order: { base: 3, xl: 5 }, notch: { base: 0.5, xl: 0.8333 } })
    expect(panelPlacement(2, content)).toMatchObject({ order: { base: 5, xl: 5 }, notch: { xl: 0.8333 } })
  })

  it('carries a breakpoint left out from the one below it, through every breakpoint', () => {
    const moves: PanelLayout = { base: equalColumns(1, 3), w1180: equalColumns(3, 3) }
    const p = panelPlacement(1, moves)
    expect(Object.keys(p.order)).toEqual([...PANEL_BREAKPOINTS])
    expect(p.order).toEqual({ base: 3, sm: 3, md: 3, lg: 3, w1180: 5, xl: 5 })
  })

  it('places a card the model does not hold after itself, its notch in the middle', () => {
    expect(panelPlacement(7, voices).order.xl).toBe(15)
    expect(panelPlacement(7, voices).notch.xl).toBe(0.5)
  })

  it('knows a notch that is the same at every width', () => {
    expect(sameEverywhere(panelPlacement(0, { base: equalColumns(1, 2) }).notch)).toBe(true)
    expect(sameEverywhere(panelPlacement(0, voices).notch)).toBe(false)
    expect(notchPct(1 / 6)).toBe('16.67%')
    expect(notchPct(1.4)).toBe('100%')
    expect(notchPct(Number.NaN)).toBe('50%')
  })
})

describe('PanelSlot and the per-breakpoint notch (render)', () => {
  const grid = (open: number) => {
    const place = panelPlacement(open, voices)
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Fragment key={i}>
            <article data-card={i} style={panelItemOrder(i)}>Card {i}</article>
            {i === open ? (
              <PanelSlot placement={place}>
                <InPlacePanel id="group-panel" notchAt={place.notch} closeHref="/dashboard/voices">
                  <p>Open</p>
                </InPlacePanel>
              </PanelSlot>
            ) : null}
          </Fragment>
        ))}
      </div>
    )
  }

  it('is one child of the grid, after its card in the markup, spanning every column with its orders', () => {
    const m = render(grid(3))
    expect(m.match(/data-panel-slot/g)).toHaveLength(1)
    expect(m.indexOf('data-panel-slot')).toBeGreaterThan(m.indexOf('data-card="3"'))
    expect(m.indexOf('data-panel-slot')).toBeLessThan(m.indexOf('data-card="4"'))
    expect(m).toContain(`data-panel-slot="" class="${PANEL_SLOT_CLASS}"`)
    expect(PANEL_SLOT_CLASS).toContain('col-span-full')
    expect(m).toContain('style="--panel-o-base:7;--panel-o-sm:7;--panel-o-md:7;--panel-o-lg:7;--panel-o-w1180:7;--panel-o-xl:9"')
    expect(m).toContain('data-card="3" style="order:6"')
    assertCopyContract(grid(3))
  })

  it('draws a notch that moves with the width through its custom properties', () => {
    const m = render(grid(3))
    expect(m).toMatch(new RegExp(`data-notch="" class="[^"]*${NOTCH_VAR_CLASS}"`))
    expect(m).toContain('--notch-base:50%;--notch-sm:50%;--notch-md:75%;--notch-lg:75%;--notch-w1180:75%;--notch-xl:16.67%')
    expect(m).toContain('left:clamp(20px, calc(var(--notch) - 9px), calc(100% - 38px))')
  })

  it('draws a notch that is the same everywhere as a single place, as it always has', () => {
    const m = render(<InPlacePanel id="p" notchAt={panelPlacement(0, { base: equalColumns(1, 1) }).notch} closeHref="/x">x</InPlacePanel>)
    expect(m).toContain('left:clamp(20px, calc(50% - 9px), calc(100% - 38px))')
    expect(m).not.toContain(NOTCH_VAR_CLASS)
    expect(m).not.toContain('--notch-base')
  })

  it('the CSS picks each width\'s value in breakpoint order, with 1180 between lg and xl', () => {
    // Plain CSS, because Tailwind sorts `min-[1180px]:` before the named
    // breakpoints: as variants, `md:` would win at 1180 to 1279.
    const css = readFileSync('app/globals.css', 'utf8')
    const at = (q: string) => css.indexOf(q)
    const block = css.slice(at('.panel-slot { order: var(--panel-o-base); }'))
    const sizes = ['40rem', '48rem', '64rem', '1180px', '80rem'].map((w) => block.indexOf(`@media (width >= ${w})`))
    expect(sizes.every((x) => x > 0)).toBe(true)
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes)
    for (const bp of PANEL_BREAKPOINTS) {
      expect(block).toContain(`order: var(--panel-o-${bp})`)
      expect(block).toContain(`--notch: var(--notch-${bp})`)
    }
  })
})
