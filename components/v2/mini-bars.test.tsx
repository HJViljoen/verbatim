import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { MiniBars } from './mini-bars'
import { LINER_MONTHS, MONTHS, THREE_WEEKS } from './fixture'

describe('MiniBars', () => {
  it('draws three weekly counts and no word (decision 1: "9 · 14 · 23 videos")', () => {
    const node = <MiniBars bars={THREE_WEEKS} label="Videos asking how long a liner lasts" />
    const m = render(node)
    expect(renderText(node)).toBe('9 21 Sep 14 28 Sep 23 5 Oct')
    expect(m.match(/class="fill-brand"/g)).toHaveLength(2)
    expect(m).toMatch(/<g data-bar="picked"><rect [^>]*class="fill-orange"/)
    expect(m).toContain('aria-label="Videos asking how long a liner lasts: 21 Sep 9, 28 Sep 14, 5 Oct 23."')
    assertCopyContract(node)
  })

  it('prints a share over each month and its level under, the month so far outlined', () => {
    const node = <MiniBars bars={MONTHS} size="lg" label="Share of the market's videos" />
    const m = render(node)
    expect(m).toContain('viewBox="0 0 560 160"')
    expect(renderText(node)).toContain('9.7% October so far · 31 of 318')
    expect(m).toMatch(/<rect [^>]*fill-opacity="0.18" stroke-width="1.5" class="fill-orange stroke-orange" data-filling=""/)
    expect(render(<MiniBars bars={MONTHS} highlight={null} label="x" />)).toMatch(/<rect [^>]*fill-opacity="0.35" stroke-width="1.5" class="fill-brand stroke-foreground" data-filling=""/)
    expect([...m.matchAll(/data-copy="level"[^>]*>([^<]*)</g)].map((x) => x[1])).toEqual(['9 of 455', '13 of 612', '19 of 839', 'so far · 31 of 318'])
    assertCopyContract(node)
    assertCopyContract(<MiniBars bars={LINER_MONTHS} size="md" label="x" />)
  })

  it('fails the contract when a sub is not a level, which is what marking it is for', () => {
    const bad = [{ label: 'Oct', value: 3, sub: 'three a week' }]
    expect(copyViolations(<MiniBars bars={bad} label="x" />).map((v) => v.rule)).toEqual(['level-denominator'])
  })

  it('picks out another bar, or none, and draws a zero as a stub', () => {
    const none = render(<MiniBars bars={THREE_WEEKS} highlight={null} label="x" />)
    expect(none).not.toContain('fill-orange')
    const zero = render(<MiniBars bars={[{ label: 'a', value: 0 }, { label: 'b', value: 8 }]} label="x" />)
    expect(zero).toContain('class="fill-border"')
    expect(render(<MiniBars bars={[]} label="x" />)).toBe('')
  })
})
