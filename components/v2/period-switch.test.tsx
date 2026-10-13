import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { PERIODS, PeriodSwitch, parsePeriod, type Period } from './period-switch'

const href = (p: Period) => `/dashboard/market?period=${p}`

describe('PeriodSwitch', () => {
  it('draws the three periods as links, each one an address', () => {
    const m = render(<PeriodSwitch value="week" options={PERIODS} hrefFor={href} />)
    expect(renderText(<PeriodSwitch value="week" options={PERIODS} hrefFor={href} />)).toBe('This week This month Over time')
    for (const p of ['week', 'month', 'time']) expect(m).toContain(`href="/dashboard/market?period=${p}"`)
    expect(m).toMatch(/^<nav aria-label="Period"/)
    expect(m).not.toContain('<button')
  })

  it('marks the selected period pale yellow with ink and weight, and aria-current', () => {
    const m = render(<PeriodSwitch value="month" options={PERIODS} hrefFor={href} />)
    expect(m).toMatch(/<a aria-current="page" class="[^"]*bg-accent font-semibold text-accent-foreground" href="\/dashboard\/market\?period=month">This month<\/a>/)
    expect(m.match(/aria-current=/g)).toHaveLength(1)
    // A segmented control on a hairline ring: no hand-written shadow.
    expect(m).not.toMatch(/shadow-\[/)
    assertCopyContract(<PeriodSwitch value="month" options={PERIODS} hrefFor={href} />)
  })

  it('reads ?period= and falls back to the page\'s default', () => {
    expect(parsePeriod('month')).toBe('month')
    expect(parsePeriod(['time', 'week'])).toBe('time')
    expect(parsePeriod('quarter')).toBe('week')
    expect(parsePeriod(undefined, 'month')).toBe('month')
  })

  it('takes any option set, for a page with its own', () => {
    const m = render(<PeriodSwitch value="b" options={[{ value: 'a', label: 'One' }, { value: 'b', label: 'Two' }]} hrefFor={(v) => `?x=${v}`} label="Show" />)
    expect(m).toContain('aria-label="Show"')
    expect(m).toMatch(/<a aria-current="page" [^>]*href="\?x=b">Two<\/a>/)
  })
})
