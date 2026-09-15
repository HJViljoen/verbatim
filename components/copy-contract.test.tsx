import { describe, it, expect } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { BarLegend, ProportionBar, type Segment } from './proportion-bar'

// The first test of the component-render tier (Phase 1 WP0, decision X), and
// for now its only job: prove the tier runs end to end — the
// `components/**/*.test.tsx` include, JSX under vitest, a real component
// rendered statically, and the copy contract asserted on the result. Every
// block from WP10 on gets a file like this one.

const SEGMENTS: Segment[] = [
  { label: 'Positive', count: 21, pct: 58, color: 'bg-positive' },
  { label: 'Neutral', count: 9, pct: 25, color: 'bg-neutral-seg' },
  { label: 'Negative', count: 6, pct: 17, color: 'bg-negative' },
]

describe('the component-render tier', () => {
  it('renders a real component to static markup', () => {
    const html = render(<ProportionBar segments={SEGMENTS} of="conversations" />)
    expect(html).toContain('Positive · 21 conversations (58%)')
    expect(html).toContain('width:58%')
  })

  it('reads the visible words back', () => {
    expect(renderText(<BarLegend segments={SEGMENTS} />)).toBe('Positive 58% Neutral 25% Negative 17%')
  })

  it('holds a shipped component to the copy contract', () => {
    expect(() => assertCopyContract(<BarLegend segments={SEGMENTS} />)).not.toThrow()
    expect(copyViolations(<ProportionBar segments={SEGMENTS} of="conversations" />)).toEqual([])
  })
})
