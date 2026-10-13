import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { StatCell, StatRow } from './stat-cell'
import { UnitSquares } from './unit-squares'

describe('StatCell', () => {
  it('prints a big mono number over its label on the inner ground', () => {
    const m = render(<StatCell value={6} label="in a usual month, over the last three" />)
    expect(m).toContain('bg-inner')
    expect(m).toMatch(/<div data-copy="figure" class="[^"]*font-mono[^"]*text-\[30px\][^"]*">6<\/div>/)
    expect(m).not.toMatch(/shadow-/)
    assertCopyContract(<StatCell value={6} label="in a usual month, over the last three" />)
  })

  it('becomes a level, "of N" printed by the cell, when it says what it is out of', () => {
    const node = <StatCell value={1203} of={3912} label="comments in October so far" />
    expect(renderText(node)).toBe('1,203 of 3,912 comments in October so far')
    expect(copyNodes(render(node)).map((n) => n.kind)).toEqual(['level'])
    assertCopyContract(node)
  })

  it('takes a formatted value and the boards\' three sizes', () => {
    expect(renderText(<StatCell value="9.7%" label="of the market" />)).toBe('9.7% of the market')
    expect(render(<StatCell value={23} label="asked" size="md" />)).toContain('text-[24px]')
    expect(render(<StatCell value={9} label="updates in a row" size="sm" />)).toContain('text-[20px]')
  })

  it('holds a small chart under its label', () => {
    const m = render(<StatCell value={4} label="updates in a row" size="sm"><UnitSquares k={4} n={9} shape="dot" label="4 of the last 9 updates" /></StatCell>)
    expect(m).toContain('data-units="4/9"')
  })

  it('lays four across at xl and two below', () => {
    expect(render(<StatRow><StatCell value={1} label="a" /></StatRow>)).toContain('grid-cols-2 gap-3 xl:grid-cols-4')
  })
})
