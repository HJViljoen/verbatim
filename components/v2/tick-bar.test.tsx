import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { TickBar, TickBarRow, TickKey } from './tick-bar'
import { MOVED, NO_CLEAR, REFUSED } from './fixture'

describe('TickBar', () => {
  it('fills the track by whose videos it counts, with an ink tick at the comparison', () => {
    const m = render(<TickBar pct={34} tick={29} size="lg" label="34% this month, against 29% last month" />)
    expect(m).toMatch(/^<div role="img" aria-label="34% this month, against 29% last month" class="relative min-w-0 bg-track h-2\.5 rounded-full">/)
    expect(m).toContain('bg-brand" style="width:34%"')
    expect(m).toMatch(/<div data-tick="" class="absolute w-0\.5 rounded-\[1px\] bg-foreground -inset-y-\[3px\]" style="left:calc\(29% - 1px\)">/)
    expect(renderText(<TickBar pct={34} tick={29} label="x" />)).toBe('')
  })

  it('takes the colour roles and the ink, four heights, and no tick', () => {
    expect(render(<TickBar pct={17} tone="you" label="x" />)).toContain('bg-you')
    expect(render(<TickBar pct={17} tone="rival" label="x" />)).toContain('bg-comp')
    expect(render(<TickBar pct={58} tone="ink" size="sm" label="x" />)).toContain('h-1.5')
    expect(render(<TickBar pct={58} label="x" />)).not.toContain('data-tick')
    expect(render(<TickBar pct={140} label="x" />)).toContain('width:100%')
    expect(render(<TickBar pct={0} label="x" />)).not.toContain('style="width')
  })

  it('prints a figure past the fill where one is given, marked', () => {
    const node = <TickBar pct={77.5} tick={25} size="xl" figure="3.1×" label="x" />
    expect(render(node)).toMatch(/<span data-copy="figure" class="[^"]*font-mono[^"]*" style="left:calc\(77\.5% \+ 6px\)">3\.1×<\/span>/)
    expect(render(node)).toContain('rounded-[4px]')
    assertCopyContract(node)
  })
})

describe('TickBarRow and TickKey', () => {
  it('lays out a name, the bar and its figure, a verdict beside the name through the one badge', () => {
    const node = <TickBarRow name="Complained" value="32%" pct={32} tick={27} verdict={MOVED} label="x" />
    const m = render(node)
    expect(renderText(node)).toBe('Complained ▲ 7 pts 32%')
    expect(m).toContain('data-copy="verdict"')
    expect(m).toContain('font-semibold')
    assertCopyContract(node)
    expect(renderText(<TickBarRow name="Asked" value="45%" pct={45} verdict={NO_CLEAR} label="x" />)).toBe('Asked no clear change · +0.1 pts 45%')
    expect(renderText(<TickBarRow name="Asked" value="45%" pct={45} verdict={REFUSED} label="x" />)).toBe('Asked 45%')
  })

  it('keys the fill and the tick in words', () => {
    expect(renderText(<TickKey fill="this month" tick="last month" />)).toBe('this month last month')
    assertCopyContract(<TickKey fill="this month" tick="last month" />)
  })
})
