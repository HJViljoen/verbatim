import { describe, expect, it } from 'vitest'

import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { PAIR_REFUSED_SEARCHES } from '@/lib/calibration'
import { pairOn, refusedSteps } from '@/lib/reading/pairs'
import type { MonthSeries } from '@/lib/reading/series'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { markupText, render } from '@/lib/test/render'
import { sealandJudge } from '@/lib/test/sealand-pairs'
import type { SubjectsData } from '@/lib/pages/subjects'
import { subjectsLine } from './line'
import { subjectsFixture } from './fixture'

// SU2 under the month-pair rule (market-first decision D, WP1.3; plan §2.3 S6):
// "a segment between two months whose pair is refused is drawn broken (points
// only, no joining line), and the reason is in the figure line. So Aug→Sep and
// Sep→Oct stay unjoined." The figure line is now the chart's one chip, "lines
// join only months read the same way" (the lead's R11, deploy 1 review); each
// step's own reason is on its month's hover."
//
// The fixture's lines are the mock's (Apr to Sep); the judge is Sealand's own,
// over its real change log (GC F2) with no pair row measured yet, which is
// deploy 1's state on production: every step is refused, and the newest one,
// August against September, for our September search changes.

const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const WHY = PAIR_REFUSED_SEARCHES('2026-09-01')
const CHIP = 'lines join only months read the same way'
/** The drawn text without the hovers, which carry each step's own reason. */
const drawnText = (markup: string): string => markupText(markup.replace(/<title[^>]*>[^<]*<\/title>/g, ''))

function judged(data: SubjectsData, steps: (line: MonthSeries) => Record<string, string>): SubjectsData {
  const pane = data.selected!
  const mark = (line: MonthSeries): MonthSeries => ({ ...line, refusedSteps: steps(line) })
  return {
    ...data,
    selected: { ...pane, series: pane.series.map(mark), ...(pane.chartSeries ? { chartSeries: pane.chartSeries.map(mark) } : {}) },
  }
}

/** The x of every segment's points, per polyline. */
const segments = (markup: string): number[][] =>
  [...markup.matchAll(/<polyline[^>]*points="([^"]+)"/g)].map((m) => m[1].split(' ').map((pt) => Number(pt.split(',')[0])))

describe('SU2 · the monthly line, under the month-pair rule', () => {
  // T0a (plan §0a, the one condition; PR-11): nothing is drawn across a
  // refused step. The months before a series' latest refused step are not
  // plotted, listed or hovered, and no chip says why.
  it('draws nothing before September where August against September is refused, and says nothing about it', () => {
    const pair = pairOn(sealandJudge('2026-10-02T06:00:00.000Z'))
    const data = judged(subjectsFixture(), (line) => refusedSteps(line.points.map((p) => p.month), (a, b) => pair(a, b, line.audience)))
    for (const mode of ['app', 'print'] as const) {
      const markup = render(subjectsLine.render(data, mode, ctx))
      assertCopyContract(markup)
      // Every step on Sealand's axis is refused today, so each line is its
      // newest month alone: no segment, and under three months no chart.
      expect(markup).not.toContain('<polyline')
      expect(drawnText(markup)).not.toContain(CHIP)
      expect(markup).not.toContain(WHY)
      expect(markupText(markup)).not.toMatch(/in Aug\b/)
    }
  })

  it('where only August against September is refused, September stands alone and nothing before it is drawn', () => {
    const data = judged(subjectsFixture(), () => ({ '2026-09-01': WHY }))
    const markup = render(subjectsLine.render(data, 'app', ctx))
    const plain = render(subjectsLine.render(subjectsFixture(), 'app', ctx))
    expect(segments(plain).length).toBeGreaterThan(0)
    expect(segments(markup)).toHaveLength(0)
    expect(drawnText(markup)).not.toContain(CHIP)
    expect(markup).not.toContain(WHY)
    expect(markupText(markup)).not.toMatch(/in Aug\b/)
  })

  it('in an email, neither the picture nor the month table carries a chip or a month across the refusal', () => {
    const pair = pairOn(sealandJudge('2026-10-02T06:00:00.000Z'))
    const data = judged(subjectsFixture(), (line) => refusedSteps(line.points.map((p) => p.month), (a, b) => pair(a, b, line.audience)))
    const withImage = { ...ctx, image: () => 'cid:subjects-line' }
    for (const c of [ctx, withImage]) {
      const markup = render(subjectsLine.render(data, 'email', c))
      assertCopyContract(markup)
      expect(markupText(markup)).not.toContain(WHY)
      expect(markupText(markup)).not.toContain(CHIP)
      expect(markupText(markup)).not.toMatch(/in Aug\b/)
    }
    expect(markupText(render(subjectsLine.render(subjectsFixture(), 'email', withImage)))).not.toContain(CHIP)
  })

  it('a pane read before the rule draws as it was sent', () => {
    const markup = render(subjectsLine.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('<polyline')
    expect(markupText(markup)).not.toContain(WHY)
    expect(markupText(markup)).not.toContain(CHIP)
  })
})
