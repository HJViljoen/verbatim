import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { SlopePair } from './slope-pair'
import { SLOPE_ROWS } from './fixture'

const chart = (highlight: string | null = 'caregivers') => (
  <SlopePair fromLabel="Sep" toLabel="Oct" rows={SLOPE_ROWS} highlight={highlight} label="Each group's share of the market's videos" />
)

describe('SlopePair', () => {
  it('draws one line a row between its two readings, labelled directly at both ends', () => {
    const text = renderText(chart())
    expect(text).toContain('Sep Oct')
    expect(text).toContain('31% 30% New amputees')
    expect(text).toContain('14% Caregivers')
    expect(render(chart())).toContain('aria-label="Each group&#x27;s share of the market&#x27;s videos, Sep to Oct: New amputees 31% to 30%, ')
  })

  it('picks one row out in the orange, drawn last, the rest in the category grey', () => {
    const m = render(chart())
    expect(m.match(/class="stroke-cat"/g)).toHaveLength(4)
    expect(m).toMatch(/<g data-row="picked"><line [^>]*stroke-width="2.5" class="stroke-orange"/)
    expect(m.lastIndexOf('data-row="picked"')).toBeGreaterThan(m.lastIndexOf('stroke-cat'))
    expect(render(chart(null))).not.toContain('orange')
  })

  it('marks every value a figure and every group name with the slot that wrote it', () => {
    const nodes = copyNodes(render(chart()))
    expect(nodes.filter((n) => n.kind === 'figure')).toHaveLength(10)
    expect(nodes.filter((n) => n.kind === 'subject').every((n) => n.slot === 'pass_e_persona')).toBe(true)
    assertCopyContract(chart())
  })

  it('nudges colliding labels apart rather than drawing them over each other', () => {
    const rows = [
      { key: 'a', label: 'A', from: 10, to: 10 },
      { key: 'b', label: 'B', from: 10, to: 10.2 },
    ]
    const ys = [...render(<SlopePair fromLabel="Sep" toLabel="Oct" rows={rows} label="x" />).matchAll(/<text x="158" y="([\d.]+)"/g)].map((x) => Number(x[1]))
    expect(Math.abs(ys[0] - ys[1])).toBeGreaterThanOrEqual(13)
  })

  it('draws nothing with no readings', () => {
    expect(render(<SlopePair fromLabel="Sep" toLabel="Oct" rows={[{ key: 'a', label: 'A', from: null, to: null }]} label="x" />)).toBe('')
  })
})
