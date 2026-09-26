import { describe, expect, it } from 'vitest'

import { MOVEMENT_WORDS } from '../../components/delta-badge'
import { changesFromLog } from '../reading/comparability'
import { firstComparisonDue, pendingWeekLine } from '../reading/week-line'
import { pooledWeekVolumes, weekRules } from '../reading/weeks'
import { directionRe } from '../test/copy-contract'
import { SEALAND_NEXT_UPDATE, STAGING_CHANGES, STAGING_RIVALS, STAGING_UPDATES, STAGING_WEEK_VOLUMES } from '../test/week-fixture'
import { WEEK_LINE } from '../week-line-config'
import { SEALAND_CLIENT_ID } from '../config'
import {
  dayList, pendingBlankLabel, pendingRowGeometry, pendingWaitingLine, WEEK_BARS, weekBarsAriaLabel, weekBarsGeometry,
  weekBarsTable, weekHover, weekRuleKey,
} from './week-bars'

// The weekly volume bars' geometry and words (WP2.9 "Design"), on staging's
// real weeks at its last update (20 Sep), at the width the preview draws
// This week's chart (696 px, row names in the first 96).

const AXIS = ['2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14']
const WEEKS = pooledWeekVolumes(STAGING_WEEK_VOLUMES, STAGING_RIVALS, AXIS, { now: '2026-09-20T12:00:00.000Z', updates: STAGING_UPDATES })
const RULES = weekRules(changesFromLog(STAGING_CHANGES), AXIS)
const G = weekBarsGeometry(WEEKS, RULES, { width: 696 })
const col = (w: string) => G.columns.find((c) => c.week === w)!

describe('weekBarsGeometry', () => {
  it('gives each week a slot, and bars 56% of it', () => {
    expect(G.plotW).toBe(600)
    expect(G.slot).toBe(75)
    expect(G.barW).toBe(42)
    expect(G.columns.map((c) => c.x)).toEqual([96, 171, 246, 321, 396, 471, 546, 621])
    expect(G.targets.every((t) => t.w === 75 && t.h === G.height)).toBe(true)
  })

  it('scales videos to 64 px and comments to 40 px, each on its own scale', () => {
    expect(G.comments.top - G.videos.baseline).toBe(WEEK_BARS.rowGap)
    expect(G.videos.baseline - G.videos.top).toBe(64)
    expect(G.comments.baseline - G.comments.top).toBe(40)
    expect(col('2026-09-07').videos).toMatchObject({ h: 64, y: G.videos.baseline - 64, label: '404' })
    expect(col('2026-08-10').videos?.h).toBe(38.7)
    expect(col('2026-09-07').comments).toMatchObject({ h: 40, label: '7,851' })
  })

  it('labels every videos bar, and only the largest comments bar', () => {
    expect(G.columns.map((c) => c.videos?.label ?? null)).toEqual([null, null, '244', '226', '187', '229', '404', '318'])
    expect(G.columns.map((c) => c.comments?.label ?? null)).toEqual([null, null, null, null, null, null, '7,851', null])
  })

  it('draws a week still being read at 40% with its word under the bar', () => {
    expect(G.columns.map((c) => c.stateWord)).toEqual([null, null, null, null, null, null, 'filling', 'so far'])
    expect(G.columns.filter((c) => c.dim).map((c) => c.week)).toEqual(['2026-09-07', '2026-09-14'])
  })

  it('draws no bar in a week with nothing gathered, and one label spans the run', () => {
    expect(col('2026-07-27').videos).toBeNull()
    expect(G.gaps).toEqual([{ from: '2026-07-27', to: '2026-08-03', cx: 171, label: 'none gathered' }])
  })

  it('puts the month under the first week that starts in it', () => {
    expect(G.columns.map((c) => c.monthLabel)).toEqual(['Jul', 'Aug', null, null, null, null, 'Sep', null])
    expect(G.columns.map((c) => c.dayLabel)).toEqual(['27', '3', '10', '17', '24', '31', '7', '14'])
  })

  it('thins week labels to every other week under 480 px of plot, keeping the latest', () => {
    const narrow = weekBarsGeometry(WEEKS, RULES, { width: 400 })
    expect(narrow.columns.map((c) => c.dayLabel)).toEqual([null, '3', null, '17', null, '31', null, '14'])
  })

  it("draws our changes on their own days: 17 Aug (filing), 9 Sep (search and filing), 13 Sep (search), 17 Sep (search and filing)", () => {
    expect(G.rules.map((r) => [r.date, r.groups, r.label])).toEqual([
      ['2026-08-17', ['filing'], '17 Aug'],
      ['2026-09-09', ['filing', 'search'], '9 Sep'],
      ['2026-09-13', ['search'], '13 Sep'],
      ['2026-09-17', ['filing', 'search'], '17 Sep'],
    ])
    // 9 Sep is the Wednesday of the week of 7 Sep: 2.5 of 7 days into its slot.
    expect(G.rules[1].x).toBe(572.8)
    expect(G.rules.every((r) => r.row === 0)).toBe(true)
  })

  it('staggers two tick labels that would touch', () => {
    const narrow = weekBarsGeometry(WEEKS, RULES, { width: 400 })
    expect(narrow.rules.map((r) => [r.label, r.row])).toEqual([['17 Aug', 0], ['9 Sep', 0], ['13 Sep', 1], ['17 Sep', 0]])
    expect(narrow.videos.top).toBe(2 * WEEK_BARS.ruleRow + WEEK_BARS.countRoom)
  })
})

describe('the words', () => {
  it('answers the hover with the week, its videos and their split, its comments, depth, reads and unchecked admissions', () => {
    expect(weekHover(WEEKS[6])).toBe(
      'Week of 7 Sep · 404 videos: 389 in the category, 15 filed under a brand you track · 7,851 comments, all dated in September · median 10 comments a video · read by 1 update since it ended · 27 let in before we checked relevance',
    )
    expect(weekHover(WEEKS[5])).toBe(
      'Week of 31 Aug · 229 videos: 215 in the category, 14 filed under a brand you track · 3,275 comments: 384 dated in August, 2,891 in September · median 6 comments a video · read by 3 updates since it ended · 4 let in before we checked relevance',
    )
    expect(weekHover(WEEKS[7])).toContain('· median 9.5 comments a video · so far · 54 let in before we checked relevance')
    expect(weekHover(WEEKS[0])).toBe('Week of 27 Jul · none gathered')
  })

  it('keys our changes in one line', () => {
    expect(weekRuleKey(RULES)).toBe('our search changes, 9, 13 and 17 Sep · how we file videos, 17 Aug, 9 and 17 Sep')
    expect(dayList(['2026-09-13', '2026-08-30', '2026-09-09'])).toBe('30 Aug, 9 and 13 Sep')
    expect(dayList(['2026-09-26'])).toBe('26 Sep')
    expect(weekRuleKey([])).toBe('')
  })

  it('reads the latest four weeks in the text alternative', () => {
    expect(weekBarsAriaLabel(WEEKS, RULES)).toBe(
      'Your market’s videos and comments by week. Latest four weeks: 24 Aug 187 videos and 1,831 comments; 31 Aug 229 and 3,275; 7 Sep 404 and 7,851, filling; 14 Sep 318 and 5,462, so far. The weeks of 27 Jul and 3 Aug: none gathered. Our changes: our search changes, 9, 13 and 17 Sep · how we file videos, 17 Aug, 9 and 17 Sep.',
    )
  })

  it('gives the email a row of week labels and two rows of counts', () => {
    expect(weekBarsTable(WEEKS)).toEqual({
      head: ['27 Jul', '3 Aug', '10 Aug', '17 Aug', '24 Aug', '31 Aug', '7 Sep, filling', '14 Sep, so far'],
      videos: ['none gathered', 'none gathered', '244', '226', '187', '229', '404', '318'],
      comments: ['', '', '5,809', '2,646', '1,831', '3,275', '7,851', '5,462'],
    })
  })
})

describe('the pending row', () => {
  const axis = [...AXIS, '2026-09-21', '2026-09-28', '2026-10-05']
  const pending = pendingWeekLine(WEEK_LINE[SEALAND_CLIENT_ID], axis, SEALAND_NEXT_UPDATE)!
  const row = pendingRowGeometry(axis, pending, { width: 921 })

  it('puts "due 18 Oct" and "due 25 Oct" in the slots from 28 Sep, and no mark anywhere', () => {
    expect(row.slots.map((s) => [s.week, s.label])).toEqual([['2026-09-28', 'due 18 Oct'], ['2026-10-05', 'due 25 Oct']])
    expect(Object.keys(row).sort()).toEqual(['blank', 'height', 'lineY', 'slots', 'x1', 'x2'])
  })

  it('leaves the weeks before 28 Sep blank, with one label spanning them', () => {
    expect(row.blank).toMatchObject({ from: '2026-07-27', to: '2026-09-21', label: 'Weeks before 28 Sep were read on changing searches, so they get no point.' })
  })

  it('says what is pending, and when', () => {
    expect(pendingWaitingLine(firstComparisonDue(WEEK_LINE[SEALAND_CLIENT_ID], SEALAND_NEXT_UPDATE))).toBe(
      'Pending: the first comparison is due with the 25 Oct update, if a check on real data passes.',
    )
  })
})

describe('counts only', () => {
  const axis = [...AXIS, '2026-09-21', '2026-09-28', '2026-10-05']
  const pending = pendingWeekLine(WEEK_LINE[SEALAND_CLIENT_ID], axis, SEALAND_NEXT_UPDATE)!
  const strings = [
    ...WEEKS.map(weekHover),
    weekRuleKey(RULES),
    weekBarsAriaLabel(WEEKS, RULES),
    ...Object.values(weekBarsTable(WEEKS)).flat(),
    ...G.columns.flatMap((c) => [c.videos?.label, c.comments?.label, c.dayLabel, c.monthLabel, c.stateWord]),
    ...G.gaps.map((g) => g.label),
    ...G.rules.map((r) => r.label),
    ...pendingRowGeometry(axis, pending, { width: 921 }).slots.map((s) => s.label),
    pendingBlankLabel('2026-09-28'),
    pendingWaitingLine('2026-10-25'),
  ].filter((s): s is string => typeof s === 'string')

  it('prints no share, no arrow, no movement word and no direction word, in any mode', () => {
    for (const s of strings) {
      expect(s).not.toMatch(/%|▲|▼|—/)
      expect(s).not.toMatch(directionRe())
      for (const word of Object.values(MOVEMENT_WORDS)) expect(s.toLowerCase()).not.toContain(word)
    }
  })
})
