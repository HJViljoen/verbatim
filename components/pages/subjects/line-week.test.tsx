import { describe, expect, it } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { WEEK_LINE_EMPTY } from '@/lib/charts/week-line'
import type { SubjectsData } from '@/lib/pages/subjects'
import { WEEK_STRIP_TOO_FEW, type WeekStrip } from '@/lib/pages/overview-market/weeks'
import { assertCopyContract, directionRe } from '@/lib/test/copy-contract'
import { markupText, render } from '@/lib/test/render'
import { STAGING_LOOKS_ID } from '@/lib/test/week-fixture'
import { WEEK_LINE_FIXTURE_FIRST_PAIR, WEEK_LINE_FIXTURE_FIRST_PAIR_AXIS } from '@/lib/test/week-line-fixture'
import { marketLineFixture, marketSubjectsFixture, ossurMarketFixture } from './fixture'
import { subjectsLine } from './line'

// Subjects' week strip (WP3.13 display, §2.3 S6): Looks & style's weeks read
// at the same age, under the months, once the line prints (deploy 3w at the
// earliest). The first print: the weeks of 28 Sep and 5 Oct, read on Tue 27
// Oct (HYPOTHETICAL dates, staging's real weeks of 7 and 14 Sep:
// lib/test/week-line-fixture.ts); Looks & style 65 of 404 and 38 of 318,
// provisional.

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

const looksStrip = (): WeekStrip => ({
  axis: [...WEEK_LINE_FIXTURE_FIRST_PAIR_AXIS],
  line: { ...WEEK_LINE_FIXTURE_FIRST_PAIR, rows: WEEK_LINE_FIXTURE_FIRST_PAIR.rows.filter((r) => r.objectId === STAGING_LOOKS_ID) },
})

const withStrip = (strip: WeekStrip | null, over: Partial<SubjectsData> = {}): SubjectsData => {
  const data = marketSubjectsFixture(over)
  return { ...data, selected: { ...data.selected!, weekStrip: strip } }
}

const html = (data: SubjectsData, mode: RenderMode = 'app') => render(subjectsLine.render(data, mode, ctx))

describe('Subjects: the week strip (WP3.13, §2.3 S6)', () => {
  it('draws no strip at deploy 3, nor while the line is kept and not shown', () => {
    for (const data of [marketSubjectsFixture(), withStrip(null), ossurMarketFixture()]) {
      expect(markupText(html(data))).not.toContain('Read at the same age')
    }
  })

  it('draws the subject\'s weeks under the months, on the strip\'s own week axis: points and no verdict while provisional', () => {
    const m = html(withStrip(looksStrip()))
    const text = markupText(m)
    expect(text).toContain('Read at the same age')
    expect(text).toContain('Looks & style 12% · 38 of 318 provisional')
    expect(m.split('data-week-line-row="').length - 1).toBe(1)
    expect(m.split('data-week-line-strip')[1]).not.toContain('data-copy="verdict"')
    // The week axis, not the month axis: nine weeks, 31 Aug to 26 Oct, with the due dates.
    expect(text).toContain('31 Aug 7 Sep 14 left out 21 28 5 Oct due 1 Nov 12 due 8 Nov 19 due 15 Nov 26')
    expect(text).toContain('weeks read on changing searches: no point')
    // The pair is joined (read the same way), and no week pair is refused.
    expect(m.split('data-week-line-strip')[1]).not.toContain('data-pair-chip')
    // Under the months: after the month cards.
    expect(m.indexOf('Read at the same age')).toBeGreaterThan(m.indexOf('September'))
  })

  it('also draws it under the monthly line, once three months are read', () => {
    // market.test.tsx's three months: July added before staging's August and September.
    const data = withStrip(looksStrip())
    const line = marketLineFixture('s-looks', 'Looks & style', [
      { ...data.selected!.marketLine!.points[0], month: '2026-07-01', k: 30, videos: 300, pct: 10 },
      ...data.selected!.marketLine!.points,
    ], data.selected!.marketLine!.refusedSteps)
    const m = html({ ...data, chartAxis: ['2026-07-01', '2026-08-01', '2026-09-01'], selected: { ...data.selected!, marketLine: line } })
    expect(m).not.toContain('not yet a line')
    expect(markupText(m)).toContain('Read at the same age')
    expect(m.split('data-week-line-row="').length - 1).toBe(1)
  })

  it('prints one line for a subject too few videos a week to read, and says when no week is kept yet', () => {
    const tooFew = html(withStrip({ ...looksStrip(), line: { ...looksStrip().line, rows: [] } }))
    expect(markupText(tooFew)).toContain(`Read at the same age ${WEEK_STRIP_TOO_FEW}`)
    const none = html(withStrip({ ...looksStrip(), line: { ...looksStrip().line, rows: [], reads: [] } }))
    expect(markupText(none)).toContain(WEEK_LINE_EMPTY)
  })

  it('renders in all three modes and keeps the copy contract, with no direction word', () => {
    for (const mode of MODES) {
      for (const data of [withStrip(looksStrip()), withStrip({ ...looksStrip(), line: { ...looksStrip().line, rows: [] } })]) {
        const m = html(data, mode)
        assertCopyContract(m)
        expect(markupText(m)).not.toMatch(directionRe())
        expect(m).not.toContain('—')
      }
    }
    expect(markupText(html(withStrip(looksStrip()), 'email'))).toContain('Looks & style 16% · 65 of 404 12% · 38 of 318 provisional')
  })
})
