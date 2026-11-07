import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { VOICES_FIXTURES } from '@/lib/pages/v2/voices-fixture'
import { readingMonthLabel } from '@/lib/reading/month-label'
import { VOICES_ONE_MONTH } from '@/lib/pages/v2/voices'
import { StatStrip } from '@/components/v2'
import { MonthSwitch, VoicesPage, voicesStats } from '.'

const strip = (d: Parameters<typeof voicesStats>[0]) => renderText(<StatStrip items={voicesStats(d)} />)

describe('the Voices root (boards E3-Voices; G3-Voices since 17 Oct)', () => {
  it('keeps the copy contract on every fixture', () => {
    for (const f of Object.values(VOICES_FIXTURES)) assertCopyContract(<VoicesPage data={f()} />)
  })

  it('says "this month" nowhere: the page reads a named month', () => {
    for (const f of Object.values(VOICES_FIXTURES)) expect(renderText(<VoicesPage data={f()} />)).not.toMatch(/this month/i)
  })

  it('prints no quote at level 1: quotes are the level pages\'', () => {
    for (const key of ['ossur', 'sealand'] as const) {
      expect(render(<VoicesPage data={VOICES_FIXTURES[key]()} />)).not.toContain('data-copy="quote"')
    }
  })

  it('the bar: the figures row (the month, the market\'s videos, the groups, the regular creators, the brands); the board\'s switch with the month on, and its one line', () => {
    const d = VOICES_FIXTURES.ossur()
    // The audit design (7 Nov): the base said once, in the figures row.
    expect(strip(d)).toBe('The last full month September Your market 487 videos Groups 5 Regular creators 6 Brands 2')
    const m = render(<VoicesPage data={d} />)
    expect(m).toContain('>Voices</h1>')
    expect(m).toContain('data-stat-strip=""')
    expect(m).not.toContain('data-bar-meta')
    expect(m).toContain('aria-label="Period"')
    // The parity pass (13 Oct): the board's three, the month on and named;
    // the week and over time shown, not offered (no link), each saying why.
    // Drawn by the kit's `PeriodSwitch` (its `disabled` option): the month is
    // the one link; the week and over time are not links.
    const sw = render(<MonthSwitch data={d} />)
    expect(renderText(<MonthSwitch data={d} />)).toBe(`This week (${VOICES_ONE_MONTH}) September Over time (${VOICES_ONE_MONTH})`)
    expect(sw).toContain('aria-current="page"')
    expect(sw.match(/<a /g)).toHaveLength(1)
    expect(sw).toContain('href="/dashboard/voices"')
    expect(sw.match(/aria-disabled="true"/g)).toHaveLength(2)
    expect(sw).toContain(`title="${VOICES_ONE_MONTH}"`)
    // The current month is named as the board names it ("November so far").
    expect(renderText(<MonthSwitch data={{ month: '2026-10-01', monthWords: 'October so far', params: {} }} />)).toContain('October so far')
    // Why the week and over time are not offered, said in a visible line
    // beside the switch, once (the board's).
    expect(m.match(/data-voices-one-month=""/g)).toHaveLength(1)
    expect(renderText(<VoicesPage data={d} />)).toContain(`September Over time (${VOICES_ONE_MONTH}) ${VOICES_ONE_MONTH}`)
  })

  // Decision 3: a whole-month reading of a month that is not the current one
  // says so in the figures row's month cell; the current month says nothing
  // extra.
  it('labels the month in the figures row only where it is not the current calendar month', () => {
    const d = VOICES_FIXTURES.ossur()
    expect(strip({ ...d, monthLabel: readingMonthLabel(d.month, '2026-10-13T08:00:00.000Z') })).toMatch(/^The last full month September Your market /)
    const current = { ...d, month: '2026-10-01', soFar: true, monthWords: 'October so far', monthLabel: readingMonthLabel('2026-10-01', '2026-10-17T08:00:00.000Z') }
    expect(strip(current)).toMatch(/^Month October so far Your market 487 videos/)
    const older = { ...d, monthLabel: readingMonthLabel(d.month, '2026-12-02T08:00:00.000Z') }
    expect(strip(older)).toMatch(/^An earlier month September Your market /)
    // A dump from before the label carries none, and reads as it did.
    expect(strip({ ...d, monthLabel: undefined })).toMatch(/^Month September Your market 487 videos/)
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
      // brands table (its six heads, you first) and the creators table.
      expect(m, key).toContain('aria-label="Period"')
      expect(m, key).toContain('id="cast"')
      expect(m.match(/data-group="/g)?.length, key).toBe(d.groups.cards.length)
      expect(m.match(/data-mix=""/g), key).toHaveLength(1)
      expect(text, key).toContain('Brand Named without being asked Videos naming it Praised it Complained Talked about most for')
      expect(m.match(/data-brand="/g)?.length ?? 0, key).toBeGreaterThanOrEqual(2)
      expect(m.indexOf('data-brand="client"'), key).toBe(m.indexOf('data-brand="'))
      expect(text, key).toContain('Creators who drive the talk')
      expect(m, key).not.toContain('data-copy="quote"')
      assertCopyContract(<VoicesPage data={d} />)
    }
  })

  // G3-Voices (17 Oct): every row opens a page; nothing opens in place. The
  // audit design (7 Nov): the row's own link, with no chevron.
  it('every row opens its page, with no chevron; no panel and no "Close"', () => {
    const d = VOICES_FIXTURES.sealand()
    const m = render(<VoicesPage data={d} />)
    for (const id of ['group-panel', 'brand-panel', 'creator-panel']) expect(m).not.toContain(`id="${id}"`)
    expect(m).not.toContain('Close ↑')
    expect(m).not.toContain('aria-expanded')
    expect(m).not.toContain('data-row-chevron')
    expect(m).toContain('href="/dashboard/voices/groups/one-bag"')
    expect(m).toContain('href="/dashboard/voices/creators/youtube/Pack%20Hacker"')
  })

  it('brands and creators are full-width sections, each headed outside its tile, the old anchors kept', () => {
    const d = VOICES_FIXTURES.sealand()
    const m = render(<VoicesPage data={d} />)
    expect(m).not.toContain('aria-label="Brands and creators"')
    expect(m.match(/data-section-head=""/g)).toHaveLength(3)
    expect(m).toMatch(/<h2 id="voices-brands"[^>]*>Brands in your market<\/h2>/)
    expect(m).toMatch(/<h2 id="voices-creators"[^>]*>Creators who drive the talk<\/h2>/)
    expect(m).toContain('id="cast"')
    expect(m).toContain('id="creators"')
    expect(m.match(/<table /g)).toHaveLength(2)
  })
})
