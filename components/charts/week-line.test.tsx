import { describe, expect, it } from 'vitest'

import { evenColumns, WEEK_LINE_EMPTY, WEEK_LINE_ROW } from '@/lib/charts/week-line'
import type { RenderMode } from '@/lib/blocks/types'
import { assertCopyContract, directionRe } from '@/lib/test/copy-contract'
import { markupText, render } from '@/lib/test/render'
import {
  WEEK_LINE_FIXTURE, WEEK_LINE_FIXTURE_AXIS, WEEK_LINE_FIXTURE_EMPTY, WEEK_LINE_FIXTURE_FIRST,
} from '@/lib/test/week-line-fixture'
import { WeekLine, weekLineEmpty } from './week-line'

// The WeekLine rows' render test (WP3.13): the fixture state (staging's weeks of
// 24 Aug to 14 Sep, re-dated to 28 Sep to 19 Oct: lib/test/week-line-fixture.ts),
// its first week alone, and the empty state, in app, print and email.

const MODES: RenderMode[] = ['app', 'print', 'email']
const COLUMNS = evenColumns(WEEK_LINE_FIXTURE_AXIS)
const html = (mode: RenderMode, block = WEEK_LINE_FIXTURE) => render(<WeekLine block={block} columns={COLUMNS} mode={mode} />)

/** Every `<line …>` the rows draw: the segments. */
const segments = (markup: string): string[] => markup.match(/<line [^>]*>/g) ?? []
const rowsOf = (markup: string): string[] => markup.split('data-week-line-row="').slice(1)

describe('WeekLine', () => {
  it('draws one row per object, 24 px tall and 8 px apart, on the axis the caller hands it', () => {
    const m = html('app')
    expect(rowsOf(m)).toHaveLength(7)
    // 8 px apart (gap-y-2) and 24 px tall (h-6), the plot 24 px at every width.
    expect(WEEK_LINE_ROW).toMatchObject({ height: 24, gap: 8 })
    expect(m).toContain('class="flex flex-col gap-y-2 ')
    for (const row of rowsOf(m)) {
      expect(row).toMatch(/^[^"]+" class="grid h-6 /)
      expect(row).toContain('height="24" role="img"')
    }
    // The week of 28 Sep is the fifth of eleven columns (31 Aug to 9 Nov): its centre at 4.5 / 11.
    expect(COLUMNS.map((c) => c.week)).toContain('2026-09-28')
    expect(m).toContain(`x="${((4.5 / 11) * 100).toFixed(3)}%"`)
  })

  it('draws a 1.5 px line in the market ink, points solid and ringed in --tile', () => {
    const m = html('app')
    for (const l of segments(m)) {
      expect(l).toContain('stroke-width="1.5"')
      expect(l).toContain('stroke:var(--foreground)')
    }
    const circles = m.match(/<circle [^>]*>/g) ?? []
    expect(circles).toHaveLength(7 * 4)
    for (const c of circles) expect(c).toMatch(/fill:var\(--foreground\);stroke:var\(--tile\)/)
  })

  it('gives each row its own y scale, with its highest and lowest shares as 9 px mono ticks', () => {
    const rows = rowsOf(html('app'))
    const ticks = (row: string) => [...row.matchAll(/font-size="9"[^>]*>([^<]+)</g)].map((x) => x[1])
    // Praising it: 42.8% (24 Aug as 28 Sep) to 61.9% (7 Sep as 12 Oct).
    expect(ticks(rows[0])).toEqual(['62%', '43%'])
    // Looks & style: 6.0% to 16.1%.
    expect(ticks(rows[6])).toEqual(['16%', '6%'])
  })

  it('joins only the pair read the same way, and says why the others are not joined', () => {
    const m = html('app')
    // 28 Sep → 5 Oct and 5 → 12 Oct are refused on depth; only 12 → 19 Oct is joined, on every row.
    expect(segments(m)).toHaveLength(7)
    const text = markupText(m)
    expect(text).toContain('28 Sep and 5 Oct not read the same way: read to different depths.')
    expect(text).toContain('5 Oct and 12 Oct not read the same way: read to different depths.')
    expect(text).toContain('Weeks before 28 Sep were read on changing searches, so they get no point.')
    expect(text).toContain('The week of 21 Sep is left out: we changed how we check relevance that week.')
  })

  it('ends each row with its latest share and "of N", and the latest verdict through MovementBadge, "no clear change" muted', () => {
    const rows = rowsOf(html('app'))
    const text = markupText(rows[0])
    expect(text).toContain('61% · 195 of 318')
    expect(text).toContain('no clear change')
    expect(rows[0]).toMatch(/class="text-xs font-medium text-muted-foreground"[^>]*>no clear change/)
    expect(rows[0]).not.toMatch(/[▲▼]/)
  })

  it('gives a provisional subject its points and no verdict', () => {
    const looks = rowsOf(html('app'))[6]
    expect(markupText(looks)).toMatch(/^.*Looks & style.*38 of 318.*provisional/)
    expect(looks).not.toContain('data-copy="verdict"')
    expect(looks.match(/<circle /g)).toHaveLength(4)
  })

  it('answers a hover on each point with the WP sentence', () => {
    const m = html('app')
    expect(markupText(m)).toContain(
      'Week of 19 Oct, read with the 8 Nov update · Praising it 195 of 318 videos (61%) · at a fixed depth mix 55% · median 9.5 comments a video · 0 of 318 let in before we checked relevance · 39 of 318 older videos',
    )
    // App carries a hover target per point; print does not.
    expect((m.match(/fill="transparent"/g) ?? []).length).toBe(28)
    expect(html('print')).not.toContain('fill="transparent"')
  })

  it('prints its first week alone as points with no segment and no verdict', () => {
    const m = html('app', WEEK_LINE_FIXTURE_FIRST)
    expect(segments(m)).toHaveLength(0)
    expect(m).not.toContain('data-copy="verdict"')
    expect(markupText(m)).toContain('Praising it')
  })

  it('draws a table in email: each week a level with its "of N", the latest verdict, the figure line', () => {
    const m = html('email')
    expect(m).not.toContain('<svg')
    const text = markupText(m)
    expect(text).toContain('Week of 28 Sep 5 Oct 12 Oct 19 Oct Latest')
    expect(text).toContain('Praising it 43% · 80 of 187 57% · 131 of 229 62% · 250 of 404 61% · 195 of 318 no clear change')
    expect(text).toContain('Looks & style')
    expect(text).toContain('28 Sep and 5 Oct not read the same way: read to different depths.')
  })

  it('has an empty state in every mode', () => {
    expect(weekLineEmpty(WEEK_LINE_FIXTURE_EMPTY)).toBe(true)
    expect(weekLineEmpty(WEEK_LINE_FIXTURE)).toBe(false)
    for (const mode of MODES) expect(markupText(html(mode, WEEK_LINE_FIXTURE_EMPTY))).toBe(WEEK_LINE_EMPTY)
  })

  it('keeps the copy contract, with no direction word on any path, in every mode and state', () => {
    for (const mode of MODES) {
      for (const block of [WEEK_LINE_FIXTURE, WEEK_LINE_FIXTURE_FIRST, WEEK_LINE_FIXTURE_EMPTY]) {
        const m = html(mode, block)
        assertCopyContract(m)
        expect(markupText(m)).not.toMatch(directionRe())
        expect(m).not.toContain('—')
      }
    }
  })
})
