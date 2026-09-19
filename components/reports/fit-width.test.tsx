import { describe, expect, it } from 'vitest'

import { render } from '@/lib/test/render'
import { FitWidth, fitZoom } from './fit-width'

// WHAT A SHARE LINK PAINTS BEFORE ANY JAVASCRIPT RUNS (Block D wave 3,
// `sales`-10).
//
// `zoom` is null until the effect measures the pane, and the unmeasured render
// used `Math.max(0.5, min)` — a guess. So the server HTML of `/r/<token>`
// painted a paid document at HALF SIZE and then jumped to ~0.86 at 1024 or to
// 1.0 at 1440: the first impression of the artefact was a layout jump. The
// server cannot measure a pane, so the fix is not a better guess — it is to
// let the browser resolve the same arithmetic at parse time, from a container
// query unit, and have the effect confirm rather than correct it.
//
// Measured in this repo's Chromium against the markup below: panes of 1440,
// 960 and 400 painted at zoom 1, 0.854853 and 0.356189, which is `fitZoom` to
// six places at all three, and 0.854853 again for a 960 pane with min 0.8.

describe('the unmeasured render', () => {
  const markup = (props: { base: number; min?: number }) =>
    render(<FitWidth {...props}>x</FitWidth>)

  it('never commits to a scale the pane has not been measured for', () => {
    expect(markup({ base: 1123 })).not.toContain('zoom:0.5')
    expect(markup({ base: 1123 })).not.toContain('zoom:0.8')
  })

  it('carries the caller’s two numbers to the browser as the container’s own', () => {
    const html = markup({ base: 1123, min: 0.8 })
    expect(html).toContain('container-type:inline-size')
    expect(html).toContain('--fw-base:1123px')
    expect(html).toContain('--fw-min:0.8')
    // The pane the `100cqw` is a percentage of, and the child that is scaled.
    expect(html).toContain('zoom:max(var(--fw-min), min(1, calc(100cqw / var(--fw-base))));width:1123px')
  })

  // ONE DEFINITION OF "FIT". The CSS above and the measurement in the effect
  // have to give the same number or the confirm IS a correction — which is the
  // jump this fix exists to remove.
  it('agrees with the measured value at every width', () => {
    expect(fitZoom(1440, 1123, 0)).toBe(1)
    expect(fitZoom(960, 1123, 0)).toBeCloseTo(0.854853, 6)
    expect(fitZoom(400, 1123, 0)).toBeCloseTo(0.356189, 6)
    // `min` is a floor and never a ceiling: a pane wider than the floor still
    // fits, and a pane narrower than it scrolls sideways at the floor.
    expect(fitZoom(960, 1123, 0.8)).toBeCloseTo(0.854853, 6)
    expect(fitZoom(400, 1123, 0.8)).toBe(0.8)
    expect(fitZoom(2000, 1123, 0.8)).toBe(1)
  })
})
