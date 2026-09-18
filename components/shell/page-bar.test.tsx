import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { SurfacePageBar, HorizonControl } from './page-bar'
import { SURFACES, hasHorizon, hasRecord } from '@/lib/nav'

// The page bar is what tells a reader which page they are on, what it answers
// and when it was read. These are the three things it must never get wrong:
// the title and the sidebar label are one string, a horizon appears only where
// a horizon means something, and a surface that is not a reading prints no
// month.

const CONTEXT = { brand: 'Össur', month: '2026-09-01', status: 'filling' as const, readingAt: '2026-09-15T18:00:00Z' }

describe('SurfacePageBar', () => {
  it('prints the label and the question the sidebar promised', () => {
    const text = renderText(<SurfacePageBar nav="subjects" context={CONTEXT} />)
    expect(text).toContain('Subjects')
    expect(text).toContain('How are we seen on this subject?')
  })

  it('carries the month context on a reading surface', () => {
    expect(renderText(<SurfacePageBar nav="overview" context={CONTEXT} />))
      .toContain('Össur · September 2026 · still filling · as at 15 Sep')
  })

  it('dates This week by its updates and offers no horizon', () => {
    const markup = render(<SurfacePageBar nav="week" updates={{ update: '2026-09-14T04:00:00Z', previous: '2026-09-07T04:00:00Z' }} />)
    expect(markup).toContain('update of 14 Sep · previous 7 Sep')
    expect(markup).not.toContain('Last 3 months')
  })

  it('gives Reports a title and nothing else to read', () => {
    const markup = render(<SurfacePageBar nav="reports" />)
    expect(markup).toContain('Reports')
    expect(markup).not.toContain('Last 12 months')
    expect(markup).not.toContain('Sep 2026')
  })

  it('shows no month on a reading surface that has not been given one', () => {
    // An honest blank, not a fabricated date: WP11 onward supplies the
    // context, and until a loader does, the bar says nothing about when.
    expect(render(<SurfacePageBar nav="market" />)).not.toContain('reading as at')
  })

  it('prints the whole basis sentence in the open, not in a tooltip', () => {
    // The mock draws the band with every clause visible. A `title` attribute
    // is nothing on a phone, nothing in a screenshot and nothing on paper, and
    // the video count and the non-English share are the reading's own basis.
    const record = {
      line: '4 updates · 2,359 videos · 27% of what was said on camera was not in English · 1 tracking change',
      lines: ['Four updates were delivered in this window.'],
    }
    const text = renderText(<SurfacePageBar nav="overview" context={CONTEXT} record={record} />)
    expect(text).toContain('2,359 videos')
    expect(text).toContain('27% of what was said on camera was not in English')
    expect(text).toContain('1 tracking change')
    expect(text).toContain('the record →')
  })

  it('offers the horizon on exactly the five surfaces the table says', () => {
    for (const s of SURFACES) {
      const markup = render(<SurfacePageBar nav={s.key} context={CONTEXT} updates={{ update: '2026-09-14T04:00:00Z' }} />)
      expect(markup.includes('Since we started')).toBe(hasHorizon(s))
    }
  })

  it('states a basis on exactly the surfaces that make a reading', () => {
    // Handed a record, Ask, Reports and Settings must print none: the table
    // decides, not the caller. They used to print "How sound is this · 2
    // updates" on a page that reads no period at all.
    for (const s of SURFACES) {
      const markup = render(
        <SurfacePageBar nav={s.key} context={CONTEXT} updates={{ update: '2026-09-14T04:00:00Z' }}
          record={{ line: '2 updates · 394 videos', lines: ['Two updates were delivered.'] }} />,
      )
      expect(markup.includes('How sound is this')).toBe(hasRecord(s))
    }
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
})
