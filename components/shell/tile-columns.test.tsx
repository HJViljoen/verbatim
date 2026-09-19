import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { TileColumns } from './page-grid'
import { render } from '@/lib/test/render'

// PAPER GETS THE COLUMNS THE SCREEN GETS (Block D wave 3b, `decks`;
// `reports`-1 and -13).
//
// Every column in this primitive is an `xl:` column, and `xl:` never fires in
// print media — app/globals.css says so where `data-print-cols` is defined. So
// a block built on `TileColumns` drew as one very wide stack on every printed
// sheet: Overview's category block put kinds, mood and movers one under
// another down a 1,054px sheet and handed its attention chart the full width,
// which `CalendarLine` scales uniformly, pushing 528px of that sheet — the
// whole ATTENTION section — off the bottom of a paid PDF.
//
// The assertions are the attribute and the CSS rule behind it, because either
// alone is a promise: an attribute nothing styles changes no layout, and a rule
// no element carries styles nothing.

const CSS = readFileSync('app/globals.css', 'utf8')

const cols = (props: Parameters<typeof TileColumns>[0]) => render(TileColumns(props))

describe('TileColumns on paper', () => {
  it('says how many columns it has, in the attribute print media reads', () => {
    expect(cols({ of: 3, children: <p>a</p> })).toContain('data-print-cols="3"')
    expect(cols({ of: 2, children: <p>a</p> })).toContain('data-print-cols="2"')
    expect(CSS).toContain('.vb-print [data-print-cols="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }')
  })

  it('keeps a rail proportional rather than 400 pixels of whatever column it lands in', () => {
    // On screen the rail is `1fr 400px` of the app's 1168px grid (SH15). A
    // brief sheet lays out at that same width, so the pixels would be right at
    // full width and wrong the moment a section takes half a sheet.
    const markup = cols({ of: 2, rail: 400, children: <p>a</p> })
    expect(markup).toContain('data-print-cols="rail"')
    expect(markup).toContain('xl:grid-cols-[minmax(0,1fr)_400px]')
    expect(CSS).toMatch(/\.vb-print \[data-print-cols="rail"\] \{ grid-template-columns: minmax\(0, 1\.85fr\) minmax\(0, 1fr\); \}/)
  })

  it('carries the rule and the divider it replaces, together or not at all', () => {
    // On screen a ruled grid stacks with `divide-y` and swaps to a leading-edge
    // border at `xl:`. In print neither `xl:` class fires, so the divider would
    // have drawn a rule ACROSS the middle of the sheet between columns that are
    // side by side. Both halves ride one attribute, emitted only by a ruled
    // grid, so they cannot drift apart.
    const ruled = cols({ of: 2, children: <p>a</p> })
    expect(ruled).toContain('divide-y')
    expect(ruled).toContain('data-print-rule="2"')

    const bare = cols({ of: 3, rule: false, children: <p>a</p> })
    expect(bare).not.toContain('divide-y')
    expect(bare).not.toContain('data-print-rule')

    expect(CSS).toContain('.vb-print [data-print-rule] > :not(:last-child) { border-bottom-width: 0; }')
    expect(CSS).toContain('.vb-print [data-print-rule="3"] > *:not(:nth-child(3n+1))')
  })
})
