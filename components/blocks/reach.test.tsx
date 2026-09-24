import { describe, expect, it } from 'vitest'
import { BlockReach } from '@/components/blocks/bars'
import { render } from '@/lib/test/render'

// The one bar that places a single reading on a printed axis.
describe('BlockReach', () => {
  it('prints the axis maximum it drew against', () => {
    expect(render(<BlockReach pct={9.4} max={15} axisLabel="share of the category videos" />))
      .toContain('axis to 15%')
  })

  it('paints nothing for a reading of nothing', () => {
    // The 1% floor kept a sliver visible for a reading too small to draw,
    // which is right for a measurement that exists and wrong for one that is
    // zero: a stripe where the number is 0.0% is the bar claiming something
    // was measured.
    const markup = render(<BlockReach pct={0} max={15} axisLabel="share of the category videos" />)
    expect(markup).toContain('width:0%')
    expect(render(<BlockReach pct={0.01} max={15} axisLabel="share of the category videos" />)).toContain('width:1%')
  })
})
