import { describe, it, expect } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { BarLegend, ProportionBar, type Segment } from './proportion-bar'

// The first test of the component-render tier (Phase 1 WP0, decision X), and
// for now its only job: prove the tier runs end to end — the
// `components/**/*.test.{ts,tsx}` include, JSX under vitest, a real component
// rendered statically, and the copy contract asserted on the result. Every
// block from WP10 on gets a file like this one.
//
// What it does NOT prove: these two components carry no `data-copy` marker, so
// rules (a) and (b) are vacuous on them as shipped and only (c) runs. The last
// test closes that by marking the rendered output itself, which is also the
// most honest measure of what WP10's marking pass has to fix.

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
    // Honest about what this proves: neither component carries a `data-copy`
    // marker, so rules (a) and (b) have nothing to check and only (c), which
    // reads the whole block, actually runs against shipped markup.
    expect(() => assertCopyContract(<BarLegend segments={SEGMENTS} />)).not.toThrow()
    expect(copyViolations(<ProportionBar segments={SEGMENTS} of="conversations" />)).toEqual([])
  })

  it('shows what marking a shipped component will cost — rules (a) and (b) on real output', () => {
    // The size of WP10's marking pass, pinned rather than described. BarLegend
    // prints "Positive 58%": a share with no denominator, so the moment
    // someone marks it `level` it owes an "of N", and inside `prose` its
    // digits are the model's until code's figure is wrapped. Both rules fire
    // here on markup a shipped component produced.
    const legend = render(<BarLegend segments={SEGMENTS} />)
    expect(copyViolations(`<span data-copy="level">${legend}</span>`).map((v) => v.rule)).toEqual(['level-denominator'])
    expect(copyViolations(`<p data-copy="prose">${legend}</p>`).map((v) => v.rule)).toEqual(['prose-digit'])
    // And with the denominator the product's copy rules ask for, it passes.
    expect(copyViolations('<span data-copy="level">Positive · 21 of 36 conversations</span>')).toEqual([])
  })
})
