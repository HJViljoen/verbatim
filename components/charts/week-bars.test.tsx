import { describe, expect, it } from 'vitest'
import { markInView, WeekBarsHover, wholeWeeksWidth } from './week-bars-hover'

import type { RenderMode } from '@/lib/blocks/types'
import { MOVEMENT_WORDS } from '@/components/delta-badge'
import { changesFromLog } from '@/lib/reading/comparability'
import { assertCopyContract, directionRe } from '@/lib/test/copy-contract'
import { markupText, render, renderText } from '@/lib/test/render'
import { weekVolumesBlock } from '@/lib/pages/overview-market/weeks'
import { SEALAND_NEXT_UPDATE, STAGING_CHANGES, STAGING_RIVALS, STAGING_UPDATES, STAGING_WEEK_VOLUMES } from '@/lib/test/week-fixture'
import { WEEK_LINE } from '@/lib/week-line-config'
import { SEALAND_CLIENT_ID } from '@/lib/config'
import { dueHasPassed, passedBeforeOf, type PendingWeekLine } from '@/lib/reading/week-line'
import { WeekBars, WeekPendingRow } from './week-bars'
import { weekBarsLayout, weekDetail, weekName, weekPlotMin } from '@/lib/charts/week-bars'
import { weekRuleGroupOf, weeksSinceOurChanges } from '@/lib/reading/weeks'

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

// T0a (mechanism 3): the bars never span our changes, and never draw a week
// counting videos let in before we checked relevance. On staging's own rows
// (search changes 9, 13 and 17 Sep, the relevance check 26 Sep, nothing
// gathered after 20 Sep, and pre-check videos in the weeks of 31 Aug to 14
// Sep) no week is left, so the chart is not drawn. HYPOTHETICAL: the same
// rows with no change on the axis and every video checked, to show the
// drawing itself.
const clean = (now: string) => weekVolumesBlock({
  reading: { month: '2026-09-01' },
  now,
  updates: STAGING_UPDATES,
  rows: STAGING_WEEK_VOLUMES.map((r) => ({ ...r, unchecked: 0 })),
  rivalAudiences: STAGING_RIVALS,
  changes: [],
  cfg: WEEK_LINE[SEALAND_CLIENT_ID],
  nextUpdateAfter: SEALAND_NEXT_UPDATE,
})
const CLEAN11 = clean('2026-10-11T06:00:00.000Z')
const CLEAN02 = clean('2026-10-02T06:00:00.000Z')

const all = (mode: RenderMode, b = OCT11): string => render(<>
  <WeekBars block={b} mode={mode} variant="front" surface="inner" />
  <WeekPendingRow weeks={b.weeks} pending={b.line as PendingWeekLine} mode={mode} surface="inner" />
  <WeekBars block={b} mode={mode} variant="week" surface="tile" />
</>)

describe('the weekly volume bars', () => {
  it('draw every week on the axis, and keep the copy contract in every mode', () => {
    expect(OCT11.weeks.map((w) => w.week)).toEqual([
      '2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31',
      '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05',
    ])
    for (const mode of MODES) {
      assertCopyContract(all(mode))
      assertCopyContract(all(mode, CLEAN11))
    }
  })

  it('print decision M’s counts: videos and comments, week by week, and no week with nothing gathered', () => {
    const t = renderText(<WeekBars block={CLEAN11} mode="app" variant="front" surface="inner" />)
    for (const n of ['244', '226', '187', '229', '404', '318', '5,809', '2,646', '1,831', '3,275', '7,851', '5,462']) expect(t).toContain(n)
    // T0a (OV-33, WK-14): the weeks of 27 Jul and 3 Aug, and 21 Sep on, held
    // nothing; they are off the axis, never an empty slot or a word.
    expect(t).not.toContain('none gathered')
    expect(t).toContain('filling')
  })

  it('carry no share, no arrow and no movement or direction word, in the bars or the pending row, in any mode', () => {
    for (const mode of MODES) {
      for (const b of [OCT11, OCT02, CLEAN11, CLEAN02]) {
        const t = renderText(<>
          <WeekBars block={b} mode={mode} variant="front" surface="inner" />
          <WeekPendingRow weeks={b.weeks} pending={b.line as PendingWeekLine} mode={mode} surface="inner" />
          <WeekBars block={b} mode={mode} variant="week" surface="tile" />
        </>)
        expect(t).not.toMatch(/%|▲|▼/)
        for (const w of Object.values(MOVEMENT_WORDS)) expect(t.toLowerCase()).not.toMatch(new RegExp(`\\b${w}\\b`))
        expect(t).not.toMatch(directionRe())
      }
    }
  })

  // T0a (mechanism 3; OV-31, WK-12/13): a step after our change is our
  // bookkeeping, and a mark saying so is an annotation. The chart draws only
  // the weeks after the week of our latest search or relevance change.
  it('never span our changes: on staging’s rows no week is left and the chart is not drawn', () => {
    for (const mode of MODES) {
      for (const b of [OCT11, OCT02]) {
        expect(render(<WeekBars block={b} mode={mode} variant="front" surface="inner" />), mode).toBe('')
        expect(render(<WeekBars block={b} mode={mode} variant="week" surface="tile" />), mode).toBe('')
      }
    }
  })

  it('start after the week of the latest change, with no "Our changes" row, mark, key or gap word', () => {
    // HYPOTHETICAL: staging's changes (9, 13 and 17 Sep; relevance 26 Sep)
    // and weeks gathered after them, every video checked.
    const after = weekVolumesBlock({
      reading: { month: '2026-09-01' },
      now: '2026-10-14T06:00:00.000Z',
      updates: [...STAGING_UPDATES, '2026-10-04T08:00:00.000Z', '2026-10-11T08:00:00.000Z'],
      rows: [
        ...STAGING_WEEK_VOLUMES.map((r) => ({ ...r, unchecked: 0 })),
        ...(['2026-09-28', '2026-10-05', '2026-10-12'] as const).map((week) => ({ ...STAGING_WEEK_VOLUMES[2], week, unchecked: 0 })),
      ],
      rivalAudiences: STAGING_RIVALS,
      changes: changesFromLog(STAGING_CHANGES),
      cfg: WEEK_LINE[SEALAND_CLIENT_ID],
      nextUpdateAfter: SEALAND_NEXT_UPDATE,
    })
    expect(after.rules.map((r) => r.date)).toEqual(expect.arrayContaining(['2026-09-09', '2026-09-26']))
    for (const variant of ['front', 'week'] as const) {
      for (const mode of MODES) {
        const markup = render(<WeekBars block={after} mode={mode} variant={variant} surface="inner" />)
        const t = renderText(<WeekBars block={after} mode={mode} variant={variant} surface="inner" />)
        expect(t, `${variant} ${mode}`).not.toContain('Our changes')
        expect(t, `${variant} ${mode}`).not.toContain('none gathered')
        for (const d of ['9 Sep', '13 Sep', '17 Sep', '26 Sep']) expect(t, `${variant} ${mode}`).not.toContain(d)
        expect(markup).not.toContain('data-edge-x')
        // The weeks of 28 Sep, 5 and 12 Oct only: nothing from the week of the
        // relevance change (21 Sep) or before.
        expect(t, `${variant} ${mode}`).not.toContain('14 Sep')
        expect(t, `${variant} ${mode}`).not.toContain('21 Sep')
      }
    }
    expect(renderText(<WeekBars block={after} mode="email" variant="front" surface="inner" />)).toMatch(/^Week of\s*28 Sep, filling\s*5 Oct, filling\s*12 Oct, so far\s*Videos/)
  })

  it('draw a week still being read outlined, with its word under the axis (the preview)', () => {
    const markup = render(<WeekBars block={CLEAN11} mode="app" variant="front" surface="inner" />)
    // Two filling weeks (7 and 14 Sep), each outlined in both rows.
    expect((markup.match(/stroke:var\(--foreground\);stroke-width:1.5/g) ?? []).length).toBe(4)
    expect(renderText(<WeekBars block={CLEAN11} mode="app" variant="front" surface="inner" />).match(/filling/g)).toHaveLength(2)
  })

  it('give the chart a text alternative that reads the latest weeks, with no "Our changes" and no gap word', () => {
    const markup = render(<WeekBars block={CLEAN02} mode="app" variant="front" surface="inner" />)
    expect(markup).toContain('role="img"')
    expect(markup).toMatch(/aria-label="Your market’s videos and comments by week\. Latest four weeks: 24 Aug 187 videos and 1,831 comments/)
    expect(markup).toMatch(/14 Sep 318 and 5,462, filling\./)
    expect(markup).not.toContain('Our changes')
    expect(markup).not.toContain('none gathered')
  })

  it('scroll sideways under the plot’s narrowest width, and open at the latest week', () => {
    const markup = render(<WeekBars block={CLEAN11} mode="app" variant="front" surface="inner" />)
    // THE SCROLL BOX IS THE REVERSED ROW, with the plot its direct child: a
    // reversed row nested INSIDE the scroll box overflowed to the left of its
    // origin, where no browser scrolls (the deploy-3 review, 390 and 768 px).
    const box = markup.match(/<div class="([^"]*overflow-x-auto[^"]*)"><div class="([^"]*)" style="([^"]*)"/)
    expect(box, 'the scroll box, then its first child').not.toBeNull()
    expect(box![1].split(' ')).toEqual(expect.arrayContaining(['flex', 'flex-row-reverse', 'min-w-0', 'overflow-x-auto']))
    expect(box![2].split(' ')).toContain('@container')
    // Six weeks (10 Aug to 14 Sep): the plot's floor of 520px (weekPlotMin).
    expect(box![3]).toContain('min-width:520px')
  })

  it('show This week’s panel on the latest week that is no longer so far (the preview’s)', () => {
    const t = renderText(<WeekBars block={CLEAN11} mode="app" variant="week" surface="tile" />)
    expect(t).toContain('Week of 14 Sep')
    expect(t).toMatch(/318\s*videos/)
    expect(t).toContain('of them 306 in the category and 12 filed under a brand you track')
    expect(t).toContain('all dated in September')
    // T0a: no week drawn holds a video let in before we checked relevance,
    // and there is no "Our changes" row.
    expect(t).not.toContain('before we checked relevance')
    expect(t).not.toContain('Our changes')
  })

  it('are a table of week labels and counts in an email', () => {
    const markup = render(<WeekBars block={CLEAN11} mode="email" variant="front" surface="inner" />)
    expect(markup).toContain('<table')
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
    const t = renderText(<WeekBars block={CLEAN11} mode="email" variant="front" surface="inner" />)
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
    expect(t).toContain('first week-on-week comparison, with the 25 Oct update')
    expect(t).toContain('Kept points none yet')
    expect(t).toContain('Each week is kept for Praising it · Asking how it works · Ready to buy · Hitting a problem · Asking for something · Pushing back.')
  })

  it('on 2 Oct, when the week of 5 Oct is not on the axis yet, still names the first comparison’s update', () => {
    const t = renderText(<WeekPendingRow weeks={OCT02.weeks} pending={OCT02.line as PendingWeekLine} mode="app" surface="inner" />)
    expect(t).toContain('due 18 Oct')
    expect(t).not.toContain('due 25 Oct')
    expect(t).toContain('first week-on-week comparison, with the 25 Oct update')
    // No bracket with one leg running off the plot: it waits for both weeks.
    const bracketLines = (m: string) => (m.match(/<line[^>]*y1="26"/g) ?? []).length
    expect(bracketLines(render(<WeekPendingRow weeks={OCT02.weeks} pending={OCT02.line as PendingWeekLine} mode="app" surface="inner" />))).toBe(0)
    // With both weeks on the axis (11 Oct): the span and both legs.
    expect(bracketLines(render(<WeekPendingRow weeks={OCT11.weeks} pending={OCT11.line as PendingWeekLine} mode="app" surface="inner" />))).toBe(3)
  })

  it('says a week was kept once it is, and draws no reading for it', () => {
    const pending = { ...(OCT11.line as PendingWeekLine), kept: ['2026-09-28'] }
    const t = renderText(<WeekPendingRow weeks={OCT11.weeks} pending={pending} mode="app" surface="inner" />)
    expect(t).toContain('kept 18 Oct')
    expect(t).toContain('Kept points 1 kept')
  })

  it('is one waiting line in an email', () => {
    const t = renderText(<WeekPendingRow weeks={OCT11.weeks} pending={OCT11.line as PendingWeekLine} mode="email" surface="inner" />)
    expect(t).toBe('Read at the same age: pending. The first week-on-week comparison is due with the 25 Oct update, if a check on real data passes.')
  })

  // THE DATES EXPIRE (the deploy-3 review): as at an update after a due date,
  // a week is kept or not kept, never still "due", and the first comparison's
  // promise is not repeated once its update has come.
  const asAt = (at: string, extra: Partial<PendingWeekLine> = {}): PendingWeekLine => ({ ...(OCT11.line as PendingWeekLine), passedBefore: at, ...extra })

  it('as at the 18 Oct update, the week due that day is still due, and so is the next', () => {
    const t = renderText(<WeekPendingRow weeks={OCT11.weeks} pending={asAt('2026-10-18T08:30:00.000Z', { keptRead: true })} mode="app" surface="inner" />)
    expect(t).toContain('due 18 Oct')
    expect(t).toContain('due 25 Oct')
    expect(t).toContain('first week-on-week comparison, with the 25 Oct update')
  })

  it('as at the 1 Nov update, a week missing from the kept reads is not kept, and the bracket\'s promise is gone', () => {
    const t = renderText(<WeekPendingRow weeks={OCT11.weeks} pending={asAt('2026-11-01T08:30:00.000Z', { keptRead: true, kept: ['2026-09-28'] })} mode="app" surface="inner" />)
    expect(t).toContain('kept 18 Oct')
    expect(t).toContain('not kept 25 Oct')
    expect(t).not.toMatch(/due \d/)
    expect(t).not.toContain('first comparison')
    const mail = renderText(<WeekPendingRow weeks={OCT11.weeks} pending={asAt('2026-11-01T08:30:00.000Z', { keptRead: true })} mode="email" surface="inner" />)
    expect(mail).toBe('Read at the same age: pending.')
  })

  it('counts a due date as passed from the latest update after it, or two days on where no update came (passedBeforeOf)', () => {
    // Paused after 20 Sep, read on 1 Nov: the 18 and 25 Oct updates never came.
    expect(passedBeforeOf('2026-09-20T08:33:47.358Z', '2026-11-01T06:00:00.000Z')).toBe('2026-10-30')
    // The Monday after the 18 Oct update, before its capture: still due.
    expect(passedBeforeOf('2026-10-18T08:30:00.000Z', '2026-10-19T06:00:00.000Z')).toBe('2026-10-18')
    expect(dueHasPassed('2026-10-18', passedBeforeOf('2026-10-18T08:30:00.000Z', '2026-10-19T06:00:00.000Z'))).toBe(false)
    expect(dueHasPassed('2026-10-18', passedBeforeOf('2026-10-25T08:30:00.000Z', '2026-10-25T09:00:00.000Z'))).toBe(true)
    expect(dueHasPassed('2026-10-18', undefined)).toBe(false)
  })

  it('says nothing it cannot know where the kept weeks were not read', () => {
    const t = renderText(<WeekPendingRow weeks={OCT11.weeks} pending={asAt('2026-11-01T08:30:00.000Z')} mode="app" surface="inner" />)
    expect(t).not.toContain('not kept')
    expect(t).not.toContain('first comparison')
  })
})

describe('wholeWeeksWidth (sw-2 item 3)', () => {
  // At 390 the strip's box held four and a half of the 52 px slots, and the
  // week at its start edge was cut through its labels (",872", "108").
  it('widens the slots until a whole number of weeks fills the box', () => {
    const w = wholeWeeksWidth(238, 520, 10)!
    expect(w).toBeCloseTo(595, 5)
    // The box's start edge, scrolled to the end, falls between two weeks.
    const slot = w / 10
    expect(((w - 238) / slot) % 1).toBeCloseTo(0, 9)
    expect(238 / slot).toBe(4)
  })

  it('leaves a plot that fits alone, and never shows fewer than one week', () => {
    expect(wholeWeeksWidth(700, 520, 10)).toBeNull()
    expect(wholeWeeksWidth(0, 520, 10)).toBeNull()
    expect(wholeWeeksWidth(30, 520, 10)).toBeCloseTo(300, 5)
  })
})

describe('markInView (sw-3 item 3)', () => {
  // At 390 the front page's strip opened on the week of 14 Sep, and "13 Sep",
  // drawn to the right of its mark in the week of 7 Sep, sat at the box's
  // start edge with no mark. A mark shows while the mark itself is in view.
  it('hides 9 and 13 Sep (the week of 7 Sep, scrolled out) and shows 17 Sep, at the strip\'s opening view', () => {
    const rules = OCT11.rules.filter((r) => weekRuleGroupOf(r.surface) !== 'filing')
    const L = weekBarsLayout(OCT11.weeks, rules, { size: 'large', ticks: 'top' })
    const box = { left: 0, right: 238 }
    const width = wholeWeeksWidth(238, weekPlotMin(L.n), L.n)!
    // The strip opens at its end: the plot's right edge on the box's.
    const plot = { left: box.right - width, width }
    const seen = Object.fromEntries(L.ticks.map((t) => [t.label, markInView(t.x, plot, box)]))
    expect(seen['9 Sep']).toBe(false)
    expect(seen['13 Sep']).toBe(false)
    expect(seen['17 Sep']).toBe(true)
    // Scrolled back until the week of 7 Sep opens the box, its marks show.
    const back = { left: -(6 / L.n) * width, width }
    expect(L.ticks.filter((t) => t.label === '9 Sep' || t.label === '13 Sep').map((t) => markInView(t.x, back, box))).toEqual([true, true])
  })

  it('shows every mark where the plot fits its box', () => {
    for (const x of [0, 0.25, 0.5, 1]) expect(markInView(x, { left: 10, width: 600 }, { left: 10, right: 610 })).toBe(true)
  })

  // T0a: the geometry still places a change (above), but the bars draw no
  // change at all, over the plot or in This week's row.
  it('draws no change mark, over the plot or in This week\'s row', () => {
    const front = render(<WeekBars block={CLEAN11} mode="app" variant="front" surface="inner" />)
    const week = render(<WeekBars block={CLEAN11} mode="app" variant="week" surface="tile" />)
    expect(front).not.toContain('data-edge-x="')
    expect(week).not.toContain('data-edge-x="')
  })
})

// The tooltip, as on the Dashboard (Heinrich, 5 Oct): a week's numbers show on
// hover, on keyboard focus and on a tap, from the rows the bars draw.
describe('a week\'s numbers on hover, focus or a tap', () => {
  const weeks = weeksSinceOurChanges(CLEAN11.weeks, CLEAN11.rules)
  const L = weekBarsLayout(weeks, [], { size: 'large', ticks: 'top' })
  const details = weeks.map(weekDetail)
  const buttonsOf = (markup: string): [string, string][] =>
    [...markup.matchAll(/<button type="button" aria-label="([^"]*)" data-week="([^"]*)"/g)].map((m) => [m[2], m[1]])
  const tooltipOf = (markup: string): string | null => {
    const i = markup.indexOf('role="tooltip"')
    return i < 0 ? null : markup.slice(markup.lastIndexOf('<div', i))
  }

  it('names every week\'s button with the counts its bars print, and "still filling" where the week is drawn outlined', () => {
    for (const variant of ['front', 'week'] as const) {
      const buttons = buttonsOf(render(<WeekBars block={CLEAN11} mode="app" variant={variant} surface="inner" />))
      expect(buttons.map(([w]) => w)).toEqual(L.columns.map((c) => c.week))
      for (const [i, c] of L.columns.entries()) {
        const label = buttons[i][1]
        expect(label.startsWith(`Week of ${weekName(c.week)}, `)).toBe(true)
        expect(label).toContain(`${c.videos!.label} videos`)
        expect(label).toContain(`${c.comments!.label} comments`)
        expect(label.endsWith(', still filling')).toBe(c.outlined)
      }
    }
    // Print and email draw no button.
    expect(render(<WeekBars block={CLEAN11} mode="print" variant="front" surface="inner" />)).not.toContain('<button')
  })

  it('opens the card on a week with the figures its bars print, and the week\'s state, in the copy contract', () => {
    for (const [i, c] of L.columns.entries()) {
      const node = <WeekBarsHover details={details} labels={null} plot={null} height={L.height} minWidth={weekPlotMin(L.n)} labelWidth="wide" surface="inner" detail="card" initial={null} open={i} />
      const tip = tooltipOf(render(node))!
      expect(tip).toContain(`data-week="${c.week}"`)
      const figures = [...tip.matchAll(/data-copy="figure"[^>]*>([^<]*)</g)].map((m) => m[1])
      expect(figures).toContain(c.videos!.label)
      expect(figures).toContain(c.comments!.label)
      expect(markupText(tip).includes('still filling')).toBe(c.outlined)
      expect(markupText(tip)).not.toContain('\u2014')
      assertCopyContract(node)
    }
  })

  it('says "still filling" in This week\'s panel for a week still being read', () => {
    // The panel's default week, 14 Sep, is filling on 11 Oct.
    expect(renderText(<WeekBars block={CLEAN11} mode="app" variant="week" surface="tile" />)).toMatch(/Week of 14 Sep still filling 318 videos/)
  })
})
