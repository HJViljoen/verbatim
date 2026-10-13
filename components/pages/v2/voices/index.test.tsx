import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { VOICES_FIXTURES } from '@/lib/pages/v2/voices-fixture'
import { readingMonthLabel } from '@/lib/reading/month-label'
import { VOICES_ONE_MONTH } from '@/lib/pages/v2/voices'
import { MonthSwitch, VoicesMeta, VoicesPage } from '.'

describe('the Voices page (boards E3-Voices and E3-Voices-Open)', () => {
  it('keeps the copy contract on every fixture, open or not', () => {
    for (const f of Object.values(VOICES_FIXTURES)) assertCopyContract(<VoicesPage data={f()} />)
  })

  it('says "this month" nowhere: the page reads a named month', () => {
    for (const f of Object.values(VOICES_FIXTURES)) expect(renderText(<VoicesPage data={f()} />)).not.toMatch(/this month/i)
  })

  it('prints no quote at level 1: quotes are the panels\'', () => {
    for (const key of ['ossur', 'sealand'] as const) {
      expect(render(<VoicesPage data={VOICES_FIXTURES[key]()} />)).not.toContain('data-copy="quote"')
    }
  })

  it('the bar: the month, the market\'s videos, the groups, the regular creators, the brands; the board\'s switch with the month on', () => {
    const d = VOICES_FIXTURES.ossur()
    expect(renderText(<VoicesMeta data={d} />)).toBe('September · the last full month · 487 videos · 5 groups · 6 regular creators · 2 brands')
    const m = render(<VoicesPage data={d} />)
    expect(m).toContain('>Voices</h1>')
    expect(m).toContain('aria-label="Period"')
    // The parity pass (13 Oct): the board's three, the month on and named as
    // decision 3 names a month column; the week and over time shown, not
    // offered (no link), each saying why.
    // Drawn by the kit's `PeriodSwitch` (its `disabled` option): the month is
    // the one link; the week and over time are not links.
    const sw = render(<MonthSwitch data={d} />)
    expect(renderText(<MonthSwitch data={d} />)).toBe(`This week (${VOICES_ONE_MONTH}) September Over time (${VOICES_ONE_MONTH})`)
    expect(sw).toContain('aria-current="page"')
    expect(sw.match(/<a /g)).toHaveLength(1)
    expect(sw).toContain('href="/dashboard/voices"')
    expect(sw.match(/aria-disabled="true"/g)).toHaveLength(2)
    expect(sw).toContain(`title="${VOICES_ONE_MONTH}"`)
    // The current month reads "This month", as the board's switch does.
    expect(renderText(<MonthSwitch data={{ month: '2026-10-01', monthLabel: null, params: {} }} />)).toContain('This month')
  })

  // Decision 3: a whole-month reading of a month that is not the current one
  // says so on the bar; the current month says nothing extra.
  it('labels the month on the bar only where it is not the current calendar month', () => {
    const d = VOICES_FIXTURES.ossur()
    expect(renderText(<VoicesMeta data={{ ...d, monthLabel: readingMonthLabel(d.month, '2026-10-13T08:00:00.000Z') }} />)).toMatch(/^September · the last full month · /)
    const current = { ...d, month: '2026-10-01', soFar: true, monthWords: 'October so far', monthLabel: readingMonthLabel('2026-10-01', '2026-10-17T08:00:00.000Z') }
    expect(renderText(<VoicesMeta data={current} />)).toMatch(/^October so far · 487 videos/)
    const older = { ...d, monthLabel: readingMonthLabel(d.month, '2026-12-02T08:00:00.000Z') }
    expect(renderText(<VoicesMeta data={older} />)).toMatch(/^September · an earlier month · /)
    // A dump from before the label carries none, and reads as it did.
    expect(renderText(<VoicesMeta data={{ ...d, monthLabel: undefined }} />)).toMatch(/^September · 487 videos/)
    for (const x of [d, current, older]) assertCopyContract(<VoicesPage data={x} />)
  })

  it('draws the sections in the board\'s order, the mix card the groups\' last', () => {
    const text = renderText(<VoicesPage data={VOICES_FIXTURES.sealand()} />)
    const at = (s: string) => text.indexOf(s)
    expect(at('Who’s in your market')).toBeLessThan(at('One-bag travellers Pack light'))
    expect(at('One-bag travellers Pack light')).toBeLessThan(at('The mix in September'))
    expect(at('The mix in September')).toBeLessThan(at('Brands in your market'))
    expect(text).not.toContain('How the mix changed')
    expect(at('Brands in your market')).toBeLessThan(at('Creators who drive the talk'))
  })

  // The parity pass (13 Oct; Heinrich: "the page shouldn't look too different
  // if everything isn't as populated as the design"): Össur's thin states keep
  // every component of the board in its place.
  it('keeps the board\'s shape in Össur\'s thin states, before and after its brand back-read', () => {
    for (const key of ['ossur-thin', 'ossur-counted', 'ossur', 'sealand'] as const) {
      const d = VOICES_FIXTURES[key]()
      const m = render(<VoicesPage data={d} />)
      const text = renderText(<VoicesPage data={d} />)
      // The switch, the who card, five group cards and the mix card, the
      // brands table (its four heads, you first) and the creators card.
      expect(m, key).toContain('aria-label="Period"')
      expect(m, key).toContain('id="cast"')
      expect(m.match(/data-group="/g)?.length, key).toBe(d.groups.cards.length)
      expect(m.match(/data-mix=""/g), key).toHaveLength(1)
      expect(text, key).toContain('Brand Named in Praised · complained Talked about for')
      expect(m.match(/data-brand="/g)?.length ?? 0, key).toBeGreaterThanOrEqual(2)
      expect(m.indexOf('data-brand="client"'), key).toBe(m.indexOf('data-brand="'))
      expect(text, key).toContain('Creators who drive the talk')
      expect(m, key).not.toContain('data-copy="quote"')
      assertCopyContract(<VoicesPage data={d} />)
    }
  })

  it('a brand\'s or a creator\'s panel opens under its card, one at a time (T9)', () => {
    const m = render(<VoicesPage data={VOICES_FIXTURES['sealand-brand']()} />)
    // In the markup between the two cards: under Brands on a phone, under
    // the pair from 1280 with its notch over Brands (7 of 12).
    expect(m.indexOf('id="brand-panel"')).toBeGreaterThan(m.indexOf('Brands in your market'))
    expect(m.indexOf('id="brand-panel"')).toBeLessThan(m.indexOf('Creators who drive the talk'))
    expect(m).toContain('--panel-o-base:1;--panel-o-sm:1;--panel-o-md:1;--panel-o-lg:1;--panel-o-w1180:1;--panel-o-xl:3')
    expect(m).toContain('--notch-xl:29.17%')
    expect(m).not.toContain('id="creator-panel"')
    expect(m).not.toContain('id="group-panel"')
    const c = render(<VoicesPage data={VOICES_FIXTURES['ossur-creator']()} />)
    expect(c).toContain('id="creator-panel"')
  })
})
