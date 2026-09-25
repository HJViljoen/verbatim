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
// Sep→Oct stay unjoined."
//
// The fixture's lines are the mock's (Apr to Sep); the judge is Sealand's own,
// over its real change log (GC F2) with no pair row measured yet, which is
// deploy 1's state on production: every step is refused, and the newest one,
// August against September, for our September search changes.

const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const WHY = PAIR_REFUSED_SEARCHES('2026-09-01')

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
  it('draws August and September as two points with no joining segment, and says why', () => {
    const pair = pairOn(sealandJudge('2026-10-02T06:00:00.000Z'))
    const data = judged(subjectsFixture(), (line) => refusedSteps(line.points.map((p) => p.month), (a, b) => pair(a, b, line.audience)))
    for (const mode of ['app', 'print'] as const) {
      const markup = render(subjectsLine.render(data, mode, ctx))
      assertCopyContract(markup)
      // Every step on Sealand's axis is refused today, so no segment joins any
      // two months, and every point is still drawn.
      expect(markup).not.toContain('<polyline')
      const plain = render(subjectsLine.render(subjectsFixture(), mode, ctx))
      expect((markup.match(/<circle/g) ?? []).length).toBe((plain.match(/<circle/g) ?? []).length)
      expect(markupText(markup)).toContain(WHY)
    }
  })

  it('where only August against September is refused, the months before stay joined and September stands alone', () => {
    const data = judged(subjectsFixture(), () => ({ '2026-09-01': WHY }))
    const markup = render(subjectsLine.render(data, 'app', ctx))
    const plain = render(subjectsLine.render(subjectsFixture(), 'app', ctx))
    const joinedMax = Math.max(...segments(plain).flat())
    const drawn = segments(markup)
    expect(drawn.length).toBeGreaterThan(0)
    // No segment reaches September's x, which is the rightmost on the axis.
    for (const seg of drawn) expect(Math.max(...seg)).toBeLessThan(joinedMax)
    expect(markupText(markup)).toContain(WHY)
  })

  // AND IN AN EMAIL (WP1.3 review fix): the inbox gets the picture the runner
  // rendered, or the month table when it rendered none. Neither draws a join,
  // and both used to drop the sentence saying why the months are not compared.
  it('says why in an email, under the picture and under the month table', () => {
    const pair = pairOn(sealandJudge('2026-10-02T06:00:00.000Z'))
    const data = judged(subjectsFixture(), (line) => refusedSteps(line.points.map((p) => p.month), (a, b) => pair(a, b, line.audience)))
    const withImage = { ...ctx, image: () => 'cid:subjects-line' }
    for (const c of [ctx, withImage]) {
      const markup = render(subjectsLine.render(data, 'email', c))
      assertCopyContract(markup)
      expect(markupText(markup)).toContain(WHY)
    }
    expect(render(subjectsLine.render(data, 'email', withImage))).toContain('cid:subjects-line')
    expect(markupText(render(subjectsLine.render(subjectsFixture(), 'email', ctx)))).not.toContain(WHY)
  })

  it('a pane read before the rule draws as it was sent', () => {
    const markup = render(subjectsLine.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('<polyline')
    expect(markupText(markup)).not.toContain(WHY)
  })
})
