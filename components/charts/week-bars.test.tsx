import { describe, expect, it } from 'vitest'

import type { RenderMode } from '@/lib/blocks/types'
import { MOVEMENT_WORDS } from '@/components/delta-badge'
import { changesFromLog } from '@/lib/reading/comparability'
import { assertCopyContract, directionRe } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { weekVolumesBlock } from '@/lib/pages/overview-market/weeks'
import { SEALAND_NEXT_UPDATE, STAGING_CHANGES, STAGING_RIVALS, STAGING_UPDATES, STAGING_WEEK_VOLUMES } from '@/lib/test/week-fixture'
import { WEEK_LINE } from '@/lib/week-line-config'
import { SEALAND_CLIENT_ID } from '@/lib/config'
import type { PendingWeekLine } from '@/lib/reading/week-line'
import { WeekBars, WeekBarsKey, WeekPendingRow } from './week-bars'

// The weekly volume bars (WP2.9), on staging's own weeks read at the two
// clocks the renders use: 11 Oct (September read, the axis 27 Jul to 5 Oct)
// and 2 Oct (27 Jul to 28 Sep). Staging's last update is 20 Sep, so the weeks
// after 14 Sep hold nothing and the weeks of 7 and 14 Sep are still filling.

const MODES: RenderMode[] = ['app', 'print', 'email']
const block = (now: string) => weekVolumesBlock({
  reading: { month: '2026-09-01' },
  now,
  updates: STAGING_UPDATES,
  rows: STAGING_WEEK_VOLUMES,
  rivalAudiences: STAGING_RIVALS,
  changes: changesFromLog(STAGING_CHANGES),
  cfg: WEEK_LINE[SEALAND_CLIENT_ID],
  nextUpdateAfter: SEALAND_NEXT_UPDATE,
})
const OCT11 = block('2026-10-11T06:00:00.000Z')
const OCT02 = block('2026-10-02T06:00:00.000Z')

const all = (mode: RenderMode, b = OCT11): string => render(<>
  <WeekBars block={b} mode={mode} variant="front" surface="inner" />
  <WeekBarsKey block={b} mode={mode} />
  <WeekPendingRow weeks={b.weeks} pending={b.line as PendingWeekLine} mode={mode} surface="inner" />
  <WeekBars block={b} mode={mode} variant="week" surface="tile" />
</>)

describe('the weekly volume bars', () => {
  it('draw every week on the axis, and keep the copy contract in every mode', () => {
    expect(OCT11.weeks.map((w) => w.week)).toEqual([
      '2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31',
      '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05',
    ])
    for (const mode of MODES) assertCopyContract(all(mode))
  })

  it('print decision M’s counts: videos and comments, week by week', () => {
    const t = renderText(<WeekBars block={OCT11} mode="app" variant="front" surface="inner" />)
    for (const n of ['244', '226', '187', '229', '404', '318', '5,809', '2,646', '1,831', '3,275', '7,851', '5,462']) expect(t).toContain(n)
    expect(t).toContain('none gathered')
    expect(t).toContain('filling')
  })

  it('carry no share, no arrow and no movement or direction word, in the bars or the pending row, in any mode', () => {
    for (const mode of MODES) {
      for (const b of [OCT11, OCT02]) {
        const t = renderText(<>
          <WeekBars block={b} mode={mode} variant="front" surface="inner" />
          <WeekBarsKey block={b} mode={mode} />
          <WeekPendingRow weeks={b.weeks} pending={b.line as PendingWeekLine} mode={mode} surface="inner" />
          <WeekBars block={b} mode={mode} variant="week" surface="tile" />
        </>)
        expect(t).not.toMatch(/%|▲|▼/)
        for (const w of Object.values(MOVEMENT_WORDS)) expect(t.toLowerCase()).not.toMatch(new RegExp(`\\b${w}\\b`))
        expect(t).not.toMatch(directionRe())
      }
    }
  })

  it('draw our changes on their weeks: 9, 13 and 17 Sep on the weeks of 7 and 14 Sep, and name them once in the key', () => {
    const t = renderText(<WeekBars block={OCT11} mode="app" variant="front" surface="inner" />)
    for (const d of ['9 Sep', '13 Sep', '17 Sep']) expect(t).toContain(d)
    const key = renderText(<WeekBarsKey block={OCT11} mode="app" />)
    expect(key).toContain('We changed our searches on 9, 13 and 17 Sep')
    // Staging's relevance row is the MF1 rehearsal's stand-in, dated 26 Sep.
    expect(key).toContain('how we check relevance on 26 Sep')
    expect(key).not.toContain('▲')
    // A filing change moves no bar of the pooled market: not drawn, not keyed.
    expect(key).not.toContain('file')
    expect(render(<WeekBars block={OCT11} mode="app" variant="front" surface="inner" />)).not.toContain('how we file videos')
  })

  it('draw a week still being read outlined, with its word under the axis (the preview)', () => {
    const markup = render(<WeekBars block={OCT11} mode="app" variant="front" surface="inner" />)
    // Two filling weeks (7 and 14 Sep), each outlined in both rows.
    expect((markup.match(/stroke:var\(--foreground\);stroke-width:1.5/g) ?? []).length).toBe(4)
    expect(renderText(<WeekBars block={OCT11} mode="app" variant="front" surface="inner" />).match(/filling/g)).toHaveLength(2)
  })

  it('give the chart a text alternative that reads the latest weeks', () => {
    const markup = render(<WeekBars block={OCT02} mode="app" variant="front" surface="inner" />)
    expect(markup).toContain('role="img"')
    expect(markup).toMatch(/aria-label="Your market’s videos and comments by week\. Latest four weeks: 7 Sep 404 videos and 7,851 comments, filling/)
  })

  it('scroll sideways under the plot’s narrowest width, and open at the latest week', () => {
    const markup = render(<WeekBars block={OCT11} mode="app" variant="front" surface="inner" />)
    // THE SCROLL BOX IS THE REVERSED ROW, with the plot its direct child: a
    // reversed row nested INSIDE the scroll box overflowed to the left of its
    // origin, where no browser scrolls (the deploy-3 review, 390 and 768 px).
    const box = markup.match(/<div class="([^"]*overflow-x-auto[^"]*)"><div class="([^"]*)" style="([^"]*)"/)
    expect(box, 'the scroll box, then its first child').not.toBeNull()
    expect(box![1].split(' ')).toEqual(expect.arrayContaining(['flex', 'flex-row-reverse', 'min-w-0', 'overflow-x-auto']))
    expect(box![2].split(' ')).toContain('@container')
    // 11 weeks at 48px a slot at the least (weekPlotMin).
    expect(box![3]).toContain('min-width:528px')
  })

  it('show This week’s panel on the latest week that is no longer so far (the preview’s)', () => {
    const t = renderText(<WeekBars block={OCT11} mode="app" variant="week" surface="tile" />)
    expect(t).toContain('Week of 14 Sep')
    expect(t).toMatch(/318\s*videos/)
    expect(t).toContain('of them 306 in the category and 12 filed under a brand you track')
    expect(t).toContain('all dated in September')
    expect(t).toContain('before we checked relevance')
    expect(t).toContain('Our changes')
  })

  it('are a table of week labels and counts in an email', () => {
    const markup = render(<WeekBars block={OCT11} mode="email" variant="front" surface="inner" />)
    expect(markup).toContain('<table')
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
    const t = renderText(<WeekBars block={OCT11} mode="email" variant="front" surface="inner" />)
    expect(t).toContain('14 Sep, filling')
    expect(t).toContain('7,851')
  })
})

describe('read at the same age, pending', () => {
  it('draws the due dates from the week of 28 Sep, leaves the week of 21 Sep out, and brackets the first pair', () => {
    const t = renderText(<WeekPendingRow weeks={OCT11.weeks} pending={OCT11.line as PendingWeekLine} mode="app" surface="inner" />)
    expect(t).toContain('due 18 Oct')
    expect(t).toContain('due 25 Oct')
    expect(t).toContain('left out')
    expect(t).toContain('first comparison, with the 25 Oct update')
    expect(t).toContain('Kept points none yet')
    expect(t).toContain('Each week is kept for Praising it · Asking how it works · Ready to buy · Hitting a problem · Asking for something · Pushing back.')
  })

  it('on 2 Oct, when the week of 5 Oct is not on the axis yet, still names the first comparison’s update', () => {
    const t = renderText(<WeekPendingRow weeks={OCT02.weeks} pending={OCT02.line as PendingWeekLine} mode="app" surface="inner" />)
    expect(t).toContain('due 18 Oct')
    expect(t).not.toContain('due 25 Oct')
    expect(t).toContain('first comparison, with the 25 Oct update')
  })

  it('says a week was kept once it is, and draws no reading for it', () => {
    const pending = { ...(OCT11.line as PendingWeekLine), kept: ['2026-09-28'] }
    const t = renderText(<WeekPendingRow weeks={OCT11.weeks} pending={pending} mode="app" surface="inner" />)
    expect(t).toContain('kept 18 Oct')
    expect(t).toContain('Kept points 1 kept')
  })

  it('is one waiting line in an email', () => {
    const t = renderText(<WeekPendingRow weeks={OCT11.weeks} pending={OCT11.line as PendingWeekLine} mode="email" surface="inner" />)
    expect(t).toBe('Read at the same age: pending. The first comparison is due with the 25 Oct update, if a check on real data passes.')
  })
})
