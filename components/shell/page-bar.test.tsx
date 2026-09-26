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
const CONTEXT = { brand: 'Sealand', reading: READING, other: { month: '2026-08-01', isDefault: false } }
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

  it('puts the month\'s state in the selector\'s tooltip and the other month one click away', () => {
    const markup = render(<SurfacePageBar nav="overview" context={CONTEXT} params={{ horizon: 'last_3' }} />)
    expect(markup).toContain('title="September so far · 24 days · 4 updates"')
    expect(markup).toContain('href="/dashboard?horizon=last_3&amp;month=2026-08"')
  })

  it('draws no link where there is no other month to offer', () => {
    const markup = render(<SurfacePageBar nav="competitive" context={{ ...CONTEXT, other: null }} />)
    expect(markup).toContain('September 2026')
    expect(markup).not.toContain('month=')
  })

  it('draws the preview\'s selector: a 32px chip, with the chevron only where it changes month', () => {
    const linked = render(<SurfacePageBar nav="overview" context={CONTEXT} />)
    expect(linked).toMatch(/<a [^>]*class="[^"]*h-8[^"]*rounded-lg[^"]*bg-inner[^"]*"[^>]*>September 2026<svg[^>]*lucide-chevron-down/)
    // Nothing to change to (1 to 3 Oct, decision A): the month's name and its
    // tooltip, and no chevron promising a menu.
    const alone = render(<SurfacePageBar nav="overview" context={{ ...CONTEXT, other: null }} />)
    expect(alone).toMatch(/<span title="[^"]*" class="[^"]*h-8[^"]*bg-inner[^"]*">September 2026<\/span>/)
    expect(alone).not.toContain('lucide-chevron-down')
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
