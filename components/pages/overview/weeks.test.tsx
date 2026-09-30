import { describe, expect, it } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { weekVolumesBlock } from '@/lib/pages/overview-market/weeks'
import type { OverviewData } from '@/lib/pages/overview'
import { changesFromLog } from '@/lib/reading/comparability'
import type { WeekLineBlock } from '@/lib/reading/week-line'
import { assertCopyContract, directionRe } from '@/lib/test/copy-contract'
import { markupText, render, renderText } from '@/lib/test/render'
import { SEALAND_NEXT_UPDATE, STAGING_CHANGES, STAGING_RIVALS, STAGING_WEEK_VOLUMES, standInSundayRuns } from '@/lib/test/week-fixture'
import {
  WEEK_LINE_FIXTURE_FIRST_PAIR_AXIS, WEEK_LINE_FIXTURE_FIRST_PAIR_KEPT, WEEK_LINE_FIXTURE_FIRST_PAIR_NOW,
} from '@/lib/test/week-line-fixture'
import { WEEK_LINE } from '@/lib/week-line-config'
import { SEALAND_CLIENT_ID } from '@/lib/config'
import { overviewArrivals } from './arrivals'
import { marketArrivalsFixture, ossurArrivalsFixture, sealandWeeks } from './fixture'

// Your market's "Read at the same age" once the line prints (WP3.13 display,
// deploy 3w), inside "With this update" under WP2.9's bars. The first print:
// the weeks of 28 Sep and 5 Oct, kept with the 18 and 25 Oct updates, read on
// Tue 27 Oct (HYPOTHETICAL dates, staging's real weeks of 7 and 14 Sep:
// lib/test/week-line-fixture.ts). The bars are staging's own weeks, which hold
// nothing after 20 Sep, so the weeks from 21 Sep read "none gathered" here.

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const PROD_UPDATES = standInSundayRuns(['2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25']).map((r) => r.finishedAt!)

/** Your market on Tue 27 Oct with the line printed (Heinrich's word, deploy 3w). */
function printedFixture() {
  const weeks = weekVolumesBlock({
    reading: { month: '2026-10-01' },
    now: WEEK_LINE_FIXTURE_FIRST_PAIR_NOW,
    updates: PROD_UPDATES,
    rows: STAGING_WEEK_VOLUMES,
    rivalAudiences: STAGING_RIVALS,
    changes: changesFromLog(STAGING_CHANGES),
    cfg: { ...WEEK_LINE[SEALAND_CLIENT_ID], print: true },
    line: WEEK_LINE_FIXTURE_FIRST_PAIR_KEPT,
    nextUpdateAfter: SEALAND_NEXT_UPDATE,
  })
  return { ...marketArrivalsFixture(), weeks }
}

const html = (data: OverviewData = printedFixture(), mode: RenderMode = 'app') => render(overviewArrivals.render(data, mode, ctx))

describe('Read at the same age, printed (WP3.13 display)', () => {
  it('draws the kept weeks as rows under the bars, on the bars\' own week axis, with no "pending" tag', () => {
    const data = printedFixture()
    expect(data.weeks?.weeks.map((w) => w.week)).toEqual(WEEK_LINE_FIXTURE_FIRST_PAIR_AXIS)
    const m = html(data)
    const text = markupText(m)
    // T0a (mechanism 3): the bars would span our changes on staging's rows,
    // so "Each week, as counts" is omitted; the same-age line stays.
    expect(text).not.toContain('Each week, as counts')
    expect(text).toContain('Read at the same age')
    expect(text).not.toMatch(/Read at the same age\s*pending/)
    expect(text).not.toContain('Kept points')
    // The six kinds (WP3.13's six kind rows): Looks & style's weeks are Subjects' strip.
    expect(m.split('data-week-line-row="').length - 1).toBe(6)
    expect(text).not.toContain('Looks & style')
    // The rows' plot takes the bars' gutter: the same grid as WeekBarsHover's 'wide'.
    expect(m).toContain('grid-cols-[88px_minmax(0,1fr)] xl:grid-cols-[116px_minmax(0,1fr)]')
    // Nine weeks, 31 Aug to 26 Oct: the week of 28 Sep is the fifth, at 4.5 / 9, as its bar.
    expect(m).toContain(`x="${((4.5 / 9) * 100).toFixed(3)}%"`)
  })

  it('ends each row with its latest share and "of N", "no clear change" muted', () => {
    const text = markupText(html())
    expect(text).toContain('Praising it 61% · 195 of 318 no clear change')
    expect(text).toContain('Pushing back 16% · 50 of 318 no clear change')
    expect(text).toContain('due 1 Nov 12 due 8 Nov 19 due 15 Nov 26')
    expect(text).toContain('left out')
  })

  it('renders in all three modes, keeps the copy contract, and prints no direction word and no footnote', () => {
    for (const mode of MODES) {
      const m = html(printedFixture(), mode)
      assertCopyContract(m)
      expect(markupText(m)).not.toMatch(directionRe())
      expect(m).not.toContain('—')
      expect(markupText(m)).not.toMatch(/follow our searches|counts in both|two updates old/i)
    }
    expect(renderText(overviewArrivals.render(printedFixture(), 'email', ctx))).toContain('Praising it 62% · 250 of 404 61% · 195 of 318 no clear change')
  })

  it('stays the pending row while the line is kept and not shown, and gives Össur no row at all', () => {
    const pending = { ...marketArrivalsFixture(), weeks: sealandWeeks('2026-10-11T06:00:00.000Z') }
    const t = markupText(html(pending))
    expect(t).toContain('Kept points')
    expect(t).not.toContain('Praising it 61%')
    expect(pending.weeks?.line && 'state' in pending.weeks.line).toBe(true)
    const ossur = markupText(html(ossurArrivalsFixture()))
    expect(ossur).not.toContain('Read at the same age')
  })

  it('carries the printed line as a stored block renders it: no state field, rows and due weeks', () => {
    const line = printedFixture().weeks?.line as WeekLineBlock
    expect('state' in line).toBe(false)
    // The block holds what the builder read; the page draws its kinds alone.
    expect(line.rows.map((r) => r.label)).toEqual([
      'Praising it', 'Asking how it works', 'Ready to buy', 'Hitting a problem', 'Asking for something', 'Pushing back', 'Looks & style',
    ])
    expect(line.due.map((d) => d.date)).toEqual(['2026-11-01', '2026-11-08', '2026-11-15'])
  })
})
