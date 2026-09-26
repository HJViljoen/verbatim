import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { SurfacePageBar, HorizonControl } from './page-bar'
import { SkeletonSurfaceBar } from './skeleton'
import { SURFACES, hasHorizon } from '@/lib/nav'
import { sealandReading } from '@/lib/test/reading-fixture'

// The page bar is what tells a reader which page they are on, which month it
// reads and how current it is. Since the 25 Sep rulings (market-first WP1.2) it
// is the title, the brand, the month selector and ONE quiet line, "as at the
// {update} update · next update {date}", and nothing else: no question, no
// "How sound is this" band.

const READING = sealandReading('2026-09-24T18:00:00.000Z')
/** What the reading view offers on 24 Sep and on 1 to 3 Oct: every earlier
 *  month with a row, newest first (default M-d). */
const EARLIER = ['2026-08-01', '2026-07-01', '2026-06-01', '2026-05-01', '2026-04-01'].map((month) => ({ month, isDefault: false }))
const CONTEXT = { brand: 'Sealand', reading: READING, others: EARLIER }
const UPDATE = {
  update: '2026-09-20T12:00:00.000Z',
  window: { from: '2026-09-10T08:00:00.000Z', to: '2026-09-20T06:00:00.000Z' },
  nextUpdate: '2026-09-27T04:00:00.000Z',
}

describe('SurfacePageBar', () => {
  it('prints the label and no question', () => {
    const text = renderText(<SurfacePageBar nav="subjects" context={CONTEXT} />)
    expect(text).toContain('Subjects')
    expect(text).not.toContain('How are we seen on this subject?') // title only, 2026-09-24
  })

  it('carries the brand, the month selector and the one line on a reading surface', () => {
    const text = renderText(<SurfacePageBar nav="overview" context={CONTEXT} />)
    expect(text).toContain('Sealand')
    expect(text).toContain('September 2026')
    expect(text).toContain('as at the 24 Sep update · next update Sun 27 Sep')
    // The month's state is the selector's tooltip, never the visible line.
    expect(text).not.toContain('so far, ')
    expect(text).not.toContain('still filling')
  })

  it('puts the month\'s state in the selector\'s tooltip, and the chip opens a menu of months', () => {
    const markup = render(<SurfacePageBar nav="overview" context={CONTEXT} params={{ horizon: 'last_3' }} />)
    expect(markup).toContain('title="September so far · 24 days · 4 updates"')
    // The months themselves are the menu's (`monthOptions`, lib/shell/bar.ts),
    // drawn when it opens; the chip says it has one.
    expect(markup).toMatch(/<button [^>]*aria-haspopup="menu"[^>]*>September 2026<svg/)
  })

  it('draws no menu where the market has no other month at all', () => {
    const markup = render(<SurfacePageBar nav="competitive" context={{ ...CONTEXT, others: [] }} />)
    expect(markup).toContain('September 2026')
    expect(markup).not.toContain('aria-haspopup')
  })

  it('draws the preview\'s selector: a 32px chip with its chevron, a button reached by keyboard', () => {
    const menu = render(<SurfacePageBar nav="overview" context={CONTEXT} />)
    expect(menu).toMatch(/<button [^>]*class="[^"]*h-8[^"]*rounded-lg[^"]*bg-inner[^"]*"[^>]*>September 2026<svg[^>]*lucide-chevron-down/)
    // A button (Tab reaches it, Enter or Space opens it) with a focus ring.
    expect(menu).toMatch(/<button type="button"[^>]*aria-haspopup="menu"[^>]*class="[^"]*focus-visible:ring-2[^"]*"/)
    // Nothing to change to: the month's name and its tooltip, and no chevron
    // promising a menu.
    const alone = render(<SurfacePageBar nav="overview" context={{ ...CONTEXT, others: [] }} />)
    expect(alone).toMatch(/<span title="[^"]*" class="[^"]*h-8[^"]*bg-inner[^"]*">September 2026<\/span>/)
    expect(alone).not.toContain('lucide-chevron-down')
  })

  it('steps back on 1 to 3 Oct too: September, ended, with the chevron, and the line unchanged (default M-d)', () => {
    const october = { brand: 'Sealand', reading: sealandReading('2026-10-02T06:00:00.000Z'), others: EARLIER }
    const markup = render(<SurfacePageBar nav="overview" context={october} />)
    expect(markup).toMatch(/aria-haspopup="menu"[^>]*>September 2026<svg[^>]*lucide-chevron-down/)
    const text = renderText(<SurfacePageBar nav="overview" context={october} />)
    expect(text).toContain('as at the 27 Sep update · next update Sun 4 Oct')
    // The state words stay the tooltip's: none in the bar (§5.1).
    expect(text).not.toContain('so far')
    expect(text).not.toContain('still filling')
  })

  it('breaks the one line at its " · " on a phone, never inside a date', () => {
    const markup = render(<SurfacePageBar nav="overview" context={CONTEXT} />)
    expect(markup).toContain('<span class="whitespace-nowrap">as at the 24 Sep update</span> · <span class="whitespace-nowrap">next update Sun 27 Sep</span>')
    expect(renderText(<SurfacePageBar nav="overview" context={CONTEXT} />)).toContain('as at the 24 Sep update · next update Sun 27 Sep')
  })

  it('dates This week by its update and its comment window, and offers no horizon', () => {
    const text = renderText(<SurfacePageBar nav="week" brand="Sealand" updates={UPDATE} />)
    expect(text).toContain('The 20 Sep update')
    expect(text).toContain('comments written 10 to 20 Sep · next update Sun 27 Sep')
    expect(text).not.toContain('Last 3 months')
  })

  it('gives Reports a title and nothing else to read', () => {
    const markup = render(<SurfacePageBar nav="reports" context={CONTEXT} />)
    expect(markup).toContain('Reports')
    expect(markup).not.toContain('Last 12 months')
    expect(markup).not.toContain('September 2026')
  })

  it('shows no month on a reading surface that has not been given one', () => {
    // An honest blank, not a fabricated date.
    const text = renderText(<SurfacePageBar nav="market" />)
    expect(text).not.toContain('as at')
    expect(text).not.toContain('2026')
  })

  it('offers the horizon on exactly the surfaces the table says', () => {
    for (const s of SURFACES) {
      const markup = render(<SurfacePageBar nav={s.key} context={CONTEXT} updates={UPDATE} />)
      expect(markup.includes('Since we started')).toBe(hasHorizon(s))
    }
  })

  it('says "how sound" on no surface, in any case (25 Sep rulings)', () => {
    for (const s of SURFACES) {
      const markup = render(<SurfacePageBar nav={s.key} context={CONTEXT} updates={UPDATE} brand="Sealand" />)
      expect(markup.toLowerCase(), s.key).not.toContain('how sound')
      expect(markup, s.key).not.toContain('the record →')
    }
  })
})

describe('SkeletonSurfaceBar', () => {
  it('holds Your market\'s bar at the height it lands at: the 40px Export button and the 24px line', () => {
    const markup = render(<SkeletonSurfaceBar nav="overview" button />)
    expect(markup).toContain('h-10 w-[98px] rounded-lg')
    expect(markup).not.toContain('rounded-full')
    expect(markup).toContain('my-1.5 h-3')
    // A page whose bar still pairs the pills keeps their bones.
    expect(render(<SkeletonSurfaceBar nav="subjects" pills={2} />).match(/h-\[26px\] w-20 rounded-full/g)?.length).toBe(2)
  })
})

describe('HorizonControl', () => {
  it('is four addresses, with the current one marked', () => {
    const markup = render(<HorizonControl basePath="/dashboard/voice" params={{ theme: 't1' }} current="last_12" />)
    expect(markup).toContain('href="/dashboard/voice?theme=t1"')
    expect(markup).toContain('href="/dashboard/voice?theme=t1&amp;horizon=last_3"')
    expect(markup).toContain('aria-current="page"')
    // The selection travels with the horizon — changing how far back you look
    // must not drop the theme you were reading.
    expect(markup.match(/theme=t1/g)?.length).toBe(4)
  })

  it('never prints itself into an export', () => {
    expect(render(<HorizonControl basePath="/dashboard" params={{}} current="this_month" />)).toContain('data-print-hide')
  })

  it('wraps on a phone rather than widening the page (390px: the four pills are about 404px)', () => {
    const markup = render(<HorizonControl basePath="/dashboard/subjects" params={{}} current="this_month" />)
    expect(markup).toMatch(/<nav aria-label="How far back" class="[^"]*\bflex-wrap\b[^"]*"/)
    expect(markup).not.toMatch(/<nav aria-label="How far back" class="[^"]*\bshrink-0\b/)
  })
})
