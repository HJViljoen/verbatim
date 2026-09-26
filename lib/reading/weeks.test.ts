import { describe, expect, it } from 'vitest'

import {
  STAGING_CHANGES, STAGING_CLIENT_WEEKS, STAGING_RIVALS, STAGING_UPDATES, STAGING_WEEK_VOLUMES,
} from '../test/week-fixture'
import { changesFromLog } from './comparability'
import {
  isoWeekOf, marketWeekRowOf, pooledWeekVolumes, updatesSinceWeek, WEEK_AXIS_MAX, weekAxis, weekEndInstant, weekRuleGroupOf,
  weekRules, weekStateOf,
} from './weeks'

// Week by week (decision M, part 1; WP2.9). The volumes are staging's real rows
// (lib/test/week-fixture.ts); the clock is staging's last update, 20 Sep.

const STAGING_AXIS = ['2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14']
const AT_STAGING_END = '2026-09-20T12:00:00.000Z'

describe('isoWeekOf', () => {
  it('puts a comment dated Sun 20 Sep in the week of 14 Sep, and Mon 28 Sep starts a week', () => {
    expect(isoWeekOf('2026-09-20')).toBe('2026-09-14')
    expect(isoWeekOf('2026-09-28')).toBe('2026-09-28')
    expect(isoWeekOf('2026-09-27')).toBe('2026-09-21')
  })

  it('reads instants at UTC, and Postgres text form', () => {
    expect(isoWeekOf('2026-09-20 00:00:00+00')).toBe('2026-09-14')
    expect(isoWeekOf('2026-10-04T23:59:59.999Z')).toBe('2026-09-28')
    expect(isoWeekOf('2026-10-05T00:00:00Z')).toBe('2026-10-05')
    // A month that starts inside a week: 1 Sep is a Tuesday.
    expect(isoWeekOf('2026-09-01')).toBe('2026-08-31')
  })

  it('refuses something that is not a date', () => {
    expect(() => isoWeekOf('not a date')).toThrow(/not a date/)
  })

  it('ends a week at the next Monday, 00:00 UTC', () => {
    expect(weekEndInstant('2026-09-28')).toBe('2026-10-05T00:00:00.000Z')
  })
})

describe('weekAxis', () => {
  it('reading September on 11 Oct gives the weeks of 27 Jul to 5 Oct (11 columns)', () => {
    const axis = weekAxis({ month: '2026-09-01' }, '2026-10-11T12:00:00.000Z')
    expect(axis).toEqual([
      '2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31',
      '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05',
    ])
  })

  it('reading October so far on 20 Oct gives 31 Aug to 19 Oct (8)', () => {
    expect(weekAxis({ month: '2026-10-01' }, '2026-10-20T09:00:00.000Z')).toEqual([
      '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19',
    ])
  })

  it('keeps at most 14 columns, the latest, so the current week is always drawn (a paused tenant reading September on 7 Dec)', () => {
    const axis = weekAxis({ month: '2026-09-01' }, '2026-12-07T09:00:00.000Z')
    expect(axis).toHaveLength(WEEK_AXIS_MAX)
    expect(axis[0]).toBe('2026-09-07')
    expect(axis[axis.length - 1]).toBe('2026-12-07')
  })

  it("reading September on staging's last update draws the weeks of 27 Jul to 14 Sep", () => {
    expect(weekAxis({ month: '2026-09-01' }, AT_STAGING_END)).toEqual(STAGING_AXIS)
  })
})

describe('weekStateOf', () => {
  it('the current week is so far; an ended week with one update after it is filling; two or more, settled (staging, 20 Sep)', () => {
    expect(weekStateOf('2026-09-14', AT_STAGING_END, STAGING_UPDATES)).toBe('so_far')
    // The 15 Sep run failed, so only the 20 Sep update read the week of 7 Sep after it ended.
    expect(updatesSinceWeek('2026-09-07', AT_STAGING_END, STAGING_UPDATES)).toBe(1)
    expect(weekStateOf('2026-09-07', AT_STAGING_END, STAGING_UPDATES)).toBe('filling')
    // 9 Sep, 10 Sep and 20 Sep.
    expect(updatesSinceWeek('2026-08-31', AT_STAGING_END, STAGING_UPDATES)).toBe(3)
    expect(weekStateOf('2026-08-31', AT_STAGING_END, STAGING_UPDATES)).toBe('settled')
  })

  it('counts only updates that finished by the clock', () => {
    expect(updatesSinceWeek('2026-08-31', '2026-09-09T23:00:00.000Z', STAGING_UPDATES)).toBe(1)
    expect(weekStateOf('2026-08-31', '2026-09-09T23:00:00.000Z', STAGING_UPDATES)).toBe('filling')
  })

  it('an ended week no update has read yet is filling, never settled', () => {
    expect(weekStateOf('2026-08-10', '2026-08-17T05:00:00.000Z', STAGING_UPDATES)).toBe('filling')
  })
})

describe('pooledWeekVolumes', () => {
  const weeks = pooledWeekVolumes(STAGING_WEEK_VOLUMES, STAGING_RIVALS, STAGING_AXIS, { now: AT_STAGING_END, updates: STAGING_UPDATES })
  const by = (w: string) => weeks.find((x) => x.week === w)!
  const measured = STAGING_AXIS.slice(2)

  it("reproduces decision M's market counts to the video and the comment", () => {
    expect(measured.map((w) => by(w).videos)).toEqual([244, 226, 187, 229, 404, 318])
    expect(measured.map((w) => by(w).comments)).toEqual([5809, 2646, 1831, 3275, 7851, 5462])
    expect(measured.map((w) => by(w).category)).toEqual([233, 210, 174, 215, 389, 306])
    expect(measured.map((w) => by(w).rivalFiled)).toEqual([11, 16, 13, 14, 15, 12])
  })

  it('takes the median from the rollup (the market), never a mix of audience medians', () => {
    expect(measured.map((w) => by(w).medianDated)).toEqual([17, 6.5, 5, 6, 10, 9.5])
    // The category alone reads 7 in the week of 31 Aug; the market reads 6.
    expect(STAGING_WEEK_VOLUMES.find((r) => r.week === '2026-08-31' && r.audience === 'industry-other')?.medianDated).toBe(7)
  })

  it('carries videos under 5 dated comments (9 · 35 · 47 · 40 · 29 · 29% of each week) and the unchecked admissions', () => {
    expect(measured.map((w) => Math.round((by(w).under5 / by(w).videos) * 100))).toEqual([9, 35, 47, 40, 29, 29])
    expect(measured.map((w) => by(w).unchecked)).toEqual([0, 0, 0, 4, 27, 54])
    expect(measured.map((w) => by(w).olderVideos)).toEqual([0, 0, 80, 89, 74, 39])
  })

  it("gives a week that spans two months its next month's comments (31 Aug: 2,891 of 3,275 dated in September)", () => {
    expect(by('2026-08-31').commentsNextMonth).toBe(2891)
    expect(measured.filter((w) => w !== '2026-08-31').every((w) => by(w).commentsNextMonth === 0)).toBe(true)
  })

  it('keeps the weeks of 27 Jul and 3 Aug as none gathered, never dropped', () => {
    expect(weeks.map((w) => w.week)).toEqual(STAGING_AXIS)
    for (const w of ['2026-07-27', '2026-08-03']) {
      expect(by(w)).toMatchObject({ state: 'none_gathered', videos: 0, comments: 0, medianDated: null })
    }
  })

  it('states each week on the clock', () => {
    expect(weeks.map((w) => w.state)).toEqual([
      'none_gathered', 'none_gathered', 'settled', 'settled', 'settled', 'settled', 'filling', 'so_far',
    ])
  })

  it("leaves the client's own posts out (2, 4 and 3 videos in the weeks of 31 Aug, 7 Sep and 14 Sep)", () => {
    const withClient = pooledWeekVolumes([...STAGING_WEEK_VOLUMES, ...STAGING_CLIENT_WEEKS], STAGING_RIVALS, STAGING_AXIS,
      { now: AT_STAGING_END, updates: STAGING_UPDATES })
    expect(withClient).toEqual(weeks)
  })

  it('leaves out an audience that is not a tracked rival, and then prints no median rather than a wrong one', () => {
    const noPatagonia = STAGING_RIVALS.filter((a) => a !== 'competitor:Patagonia')
    const w = pooledWeekVolumes(STAGING_WEEK_VOLUMES, noPatagonia, ['2026-09-14'], { now: AT_STAGING_END, updates: STAGING_UPDATES })[0]
    expect(w.videos).toBe(314)
    expect(w.rivalFiled).toBe(8)
    expect(w.medianDated).toBeNull()
  })

  it('prints no median without a rollup when two audiences hold videos, and the one audience median when one holds them all', () => {
    const noRollup = STAGING_WEEK_VOLUMES.filter((r) => r.audience != null)
    const w = pooledWeekVolumes(noRollup, STAGING_RIVALS, ['2026-08-31'], { now: AT_STAGING_END, updates: STAGING_UPDATES })[0]
    expect(w.medianDated).toBeNull()
    const categoryOnly = noRollup.filter((r) => r.week === '2026-08-10' && r.audience === 'industry-other')
    expect(pooledWeekVolumes(categoryOnly, [], ['2026-08-10'], { now: AT_STAGING_END, updates: STAGING_UPDATES })[0].medianDated).toBe(17)
  })

  it('counts a repeated audience row once', () => {
    const doubled = [...STAGING_WEEK_VOLUMES, ...STAGING_WEEK_VOLUMES.filter((r) => r.week === '2026-09-07')]
    expect(pooledWeekVolumes(doubled, STAGING_RIVALS, STAGING_AXIS, { now: AT_STAGING_END, updates: STAGING_UPDATES })).toEqual(weeks)
  })

  it('refuses a market row whose count is not a count', () => {
    const bad = STAGING_WEEK_VOLUMES.map((r) => (r.week === '2026-09-07' && r.audience === 'industry-other' ? { ...r, comments: Number.NaN } : r))
    expect(() => pooledWeekVolumes(bad, STAGING_RIVALS, STAGING_AXIS, { now: AT_STAGING_END, updates: STAGING_UPDATES })).toThrow(/comments is not a count/)
  })

  it('reads PostgREST rows, numeric strings included', () => {
    expect(marketWeekRowOf({
      week: '2026-09-14', audience: null, videos: 318, comments: 5462, comments_next_month: 0, under_5: 91,
      median_dated: '9.5', mean_dated: '17.18', older_videos: 39, unchecked: 54,
    })).toEqual({
      week: '2026-09-14', audience: null, videos: 318, comments: 5462, commentsNextMonth: 0, under5: 91,
      medianDated: 9.5, meanDated: 17.18, olderVideos: 39, unchecked: 54,
    })
  })
})

describe('weekRules', () => {
  const changes = changesFromLog(STAGING_CHANGES)

  it("draws our search changes on 9, 13 and 17 Sep, on their weeks (staging's change log)", () => {
    const rules = weekRules(changes, STAGING_AXIS)
    const search = rules.filter((r) => weekRuleGroupOf(r.surface) === 'search')
    expect([...new Set(search.map((r) => r.date))]).toEqual(['2026-09-09', '2026-09-13', '2026-09-17'])
    expect(search.find((r) => r.date === '2026-09-13')?.week).toBe('2026-09-07')
    expect(search.find((r) => r.date === '2026-09-17')?.week).toBe('2026-09-14')
    expect(search.every((r) => r.words === 'our search changes')).toBe(true)
  })

  it('draws a community change only when the active set moved (9 Sep: backpacks and travelgear made active)', () => {
    const rules = weekRules(changes, STAGING_AXIS)
    const communities = rules.filter((r) => r.surface === 'subreddits')
    expect(communities.map((r) => r.date)).toEqual(['2026-09-09'])
  })

  it('draws the filing changes, and nothing for a capped gather, a cadence or a change off the axis', () => {
    const rules = weekRules(changes, STAGING_AXIS)
    expect(rules.filter((r) => weekRuleGroupOf(r.surface) === 'filing').map((r) => r.date)).toEqual([
      '2026-08-17', '2026-09-09', '2026-09-09', '2026-09-09', '2026-09-17', '2026-09-17', '2026-09-17',
    ])
    expect(rules.some((r) => r.surface === 'other')).toBe(false)
    // The gate fix and attribution v3 are dated 26 Sep: the week of 21 Sep, not on this axis.
    expect(rules.some((r) => r.surface === 'gate_rule')).toBe(false)
    const later = weekRules(changes, [...STAGING_AXIS, '2026-09-21'])
    expect(later.filter((r) => r.week === '2026-09-21').map((r) => [r.surface, r.words])).toEqual([
      ['attribution', 'how we file videos'], ['gate_rule', 'how we check relevance'],
    ])
  })
})
