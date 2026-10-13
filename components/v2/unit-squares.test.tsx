import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { MAX_UNITS, UnitSquares } from './unit-squares'

describe('UnitSquares', () => {
  it('draws k of n squares, nine to a row, the k in the tone and the rest the track', () => {
    const m = render(<UnitSquares k={7} n={9} tone="you" label="7 of 9 videos praise the Cheetah" />)
    expect(m).toMatch(/^<div role="img" aria-label="7 of 9 videos praise the Cheetah" data-units="7\/9"/)
    expect(m.match(/bg-you/g)).toHaveLength(7)
    expect(m.match(/bg-track/g)).toHaveLength(2)
    expect(m).toContain('grid-template-columns:repeat(9, minmax(0, 1fr));max-width:221px')
    expect(renderText(<UnitSquares k={7} n={9} label="x" />)).toBe('')
    assertCopyContract(<UnitSquares k={7} n={9} label="x" />)
  })

  it('sizes a shorter row to its own columns, so seven squares are as big as nine', () => {
    expect(render(<UnitSquares k={5} n={7} tone="ink" label="x" />)).toContain('repeat(7, minmax(0, 1fr));max-width:171px')
  })

  it('takes the three tones, and the boards\' dot and bar shapes', () => {
    expect(render(<UnitSquares k={2} n={3} tone="market" label="x" />)).toContain('bg-brand')
    expect(render(<UnitSquares k={2} n={3} tone="ink" label="x" />)).toContain('bg-foreground')
    const dots = render(<UnitSquares k={4} n={9} shape="dot" label="x" />)
    expect(dots.match(/size-2 rounded-full bg-foreground/g)).toHaveLength(4)
    expect(dots.match(/bg-border/g)).toHaveLength(5)
    const bars = render(<UnitSquares k={1} n={9} tone="you" shape="bar" label="1 of your 9 posts" />)
    expect(bars.match(/h-3\.5 w-\[9px\] rounded-\[2px\] bg-you/g)).toHaveLength(1)
  })

  it('clamps k into 0..n and draws nothing for no n or a texture-sized one', () => {
    expect(render(<UnitSquares k={12} n={3} label="x" />)).toContain('data-units="3/3"')
    expect(render(<UnitSquares k={-1} n={3} label="x" />)).toContain('data-units="0/3"')
    expect(render(<UnitSquares k={0} n={0} label="x" />)).toBe('')
    expect(render(<UnitSquares k={1} n={MAX_UNITS + 1} label="x" />)).toBe('')
  })
})
