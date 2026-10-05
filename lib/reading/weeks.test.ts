import { describe, expect, it } from 'vitest'

import {
  STAGING_CHANGES, STAGING_CLIENT_WEEKS, STAGING_RIVALS, STAGING_UPDATES, STAGING_WEEK_VOLUMES,
} from '../test/week-fixture'
import { changesFromLog } from './comparability'
import type { ChartRun } from './week-line'
import {
  checkedWeek, isoWeekOf, marketWeekRowOf, pooledWeekVolumes, preGatherCutBefore, updatesSinceWeek, WEEK_AXIS_MAX, weekAxis,
  weekEndInstant, weekRuleGroupOf, weekRules, weeksSinceOurChanges, weekStateOf, type MarketWeekRow, type WeekRule, type WeekVolume,
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

  it("takes the market's median as MF4 repeats it on the week's rows, never a mix of audience medians", () => {
    expect(measured.map((w) => by(w).medianDated)).toEqual([17, 6.5, 5, 6, 10, 9.5])
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

  it("prints no median when the week's rows disagree on it", () => {
    const split = STAGING_WEEK_VOLUMES.map((r) => (r.week === '2026-08-31' && r.audience === 'industry-other' ? { ...r, medianDated: 7 } : r))
    const w = pooledWeekVolumes(split, STAGING_RIVALS, ['2026-08-31'], { now: AT_STAGING_END, updates: STAGING_UPDATES })[0]
    expect(w.medianDated).toBeNull()
    expect(w.videos).toBe(229)
  })

  it('counts a repeated audience row once', () => {
    const doubled = [...STAGING_WEEK_VOLUMES, ...STAGING_WEEK_VOLUMES.filter((r) => r.week === '2026-09-07')]
    expect(pooledWeekVolumes(doubled, STAGING_RIVALS, STAGING_AXIS, { now: AT_STAGING_END, updates: STAGING_UPDATES })).toEqual(weeks)
  })

  it('refuses a market row whose count is not a count', () => {
    const bad = STAGING_WEEK_VOLUMES.map((r) => (r.week === '2026-09-07' && r.audience === 'industry-other' ? { ...r, comments: Number.NaN } : r))
    expect(() => pooledWeekVolumes(bad, STAGING_RIVALS, STAGING_AXIS, { now: AT_STAGING_END, updates: STAGING_UPDATES })).toThrow(/comments is not a count/)
  })

  it('carries the unchecked videos\' comments only where every pooled row does (migration 20261107090000), and refuses more than the week holds', () => {
    // No row carries them (the function before the migration): not known.
    expect(weeks.every((w) => w.uncheckedComments === undefined)).toBe(true)
    const withUc = STAGING_WEEK_VOLUMES.map((r) => ({ ...r, uncheckedComments: r.unchecked > 0 ? r.unchecked * 5 : 0 }))
    const known = pooledWeekVolumes(withUc, STAGING_RIVALS, STAGING_AXIS, { now: AT_STAGING_END, updates: STAGING_UPDATES })
    expect(measured.map((w) => known.find((x) => x.week === w)!.uncheckedComments)).toEqual([0, 0, 0, 20, 135, 270])
    // One row of a week without it: that week's is not known; the others are.
    const partly = withUc.map((r) => (r.week === '2026-09-14' && r.audience === 'competitor:Patagonia' ? { ...r, uncheckedComments: undefined } : r))
    const mixed = pooledWeekVolumes(partly, STAGING_RIVALS, STAGING_AXIS, { now: AT_STAGING_END, updates: STAGING_UPDATES })
    expect(mixed.find((x) => x.week === '2026-09-14')!.uncheckedComments).toBeUndefined()
    expect(mixed.find((x) => x.week === '2026-09-07')!.uncheckedComments).toBe(135)
    const over = withUc.map((r) => (r.week === '2026-09-07' && r.audience === 'industry-other' ? { ...r, uncheckedComments: r.comments + 1 } : r))
    expect(() => pooledWeekVolumes(over, STAGING_RIVALS, STAGING_AXIS, { now: AT_STAGING_END, updates: STAGING_UPDATES })).toThrow(/uncheckedComments is not a count/)
  })

  it('reads PostgREST rows, numeric strings included', () => {
    expect(marketWeekRowOf({
      week: '2026-09-14', audience: 'industry-other', videos: 306, comments: 5309, comments_next_month: 0, under_5: 88,
      median_dated: '9.5', mean_dated: '17.18', older_videos: 38, unchecked: 53,
    })).toEqual({
      week: '2026-09-14', audience: 'industry-other', videos: 306, comments: 5309, commentsNextMonth: 0, under5: 88,
      medianDated: 9.5, meanDated: 17.18, olderVideos: 38, unchecked: 53,
    })
  })

  it('reads the unchecked videos\' comments where the function returns them, and leaves them unknown where it does not', () => {
    const raw = {
      week: '2026-09-28', audience: 'industry-other', videos: 259, comments: 4930, comments_next_month: 0, under_5: 0,
      median_dated: '9', mean_dated: '18.9', older_videos: 40, unchecked: 1,
    }
    expect(marketWeekRowOf({ ...raw, unchecked_comments: '1' }).uncheckedComments).toBe(1)
    expect('uncheckedComments' in marketWeekRowOf(raw)).toBe(false)
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
    // The gate fix is a fix of failed judgements (`failOpenFix`, the release
    // fix of 1 Oct night): no rule, as on the Dashboard; `unchecked` carries it.
    const later = weekRules(changes, [...STAGING_AXIS, '2026-09-21'])
    expect(later.filter((r) => r.week === '2026-09-21').map((r) => [r.surface, r.words])).toEqual([
      ['attribution', 'how we file videos'],
    ])
  })
})

// T0a (the one condition; mechanism 3): the bars never span our changes. A
// step in the weekly counts after we changed our searches or how we check
// relevance is our bookkeeping, so the chart draws only the weeks after the
// week of our latest such change; no week with nothing gathered (never an
// empty slot); and no week counting videos let in before the relevance check.
describe('weeksSinceOurChanges', () => {
  const at = (week: string, videos: number, unchecked = 0, state: WeekVolume['state'] = 'settled'): WeekVolume => ({
    week, state: videos === 0 ? 'none_gathered' : state, updatesSince: 2, videos, comments: videos * 10, category: videos, rivalFiled: 0,
    commentsNextMonth: 0, medianDated: null, under5: 0, olderVideos: 0, unchecked,
  })
  const rule = (date: string, surface: WeekRule['surface']): WeekRule => ({ date, week: isoWeekOf(date), surface, words: '' })
  const weeks = [
    at('2026-08-24', 187), at('2026-08-31', 229), at('2026-09-07', 404), at('2026-09-14', 318), at('2026-09-21', 300),
    at('2026-09-28', 280), at('2026-10-05', 290), at('2026-10-12', 120, 0, 'so_far'),
  ]

  it('starts after the week of the latest search or relevance change (9, 13, 17 Sep; 26 Sep)', () => {
    const rules = [rule('2026-09-09', 'terms'), rule('2026-09-13', 'terms'), rule('2026-09-17', 'platforms'), rule('2026-09-26', 'gate_rule')]
    expect(weeksSinceOurChanges(weeks, rules).map((w) => w.week)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12'])
    // The search changes alone: from the week after 17 Sep's.
    expect(weeksSinceOurChanges(weeks, rules.slice(0, 3)).map((w) => w.week)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'])
  })

  it('is cut by a rival or handle change, as the same-age line reads them (the release fix, 1 Oct night), and not by the other filing changes (decision E)', () => {
    expect(weeksSinceOurChanges(weeks, [rule('2026-09-30', 'rivals')]).map((w) => w.week)).toEqual(['2026-10-05', '2026-10-12'])
    expect(weeksSinceOurChanges(weeks, [rule('2026-09-30', 'handles')]).map((w) => w.week)).toEqual(['2026-10-05', '2026-10-12'])
    expect(weeksSinceOurChanges(weeks, [rule('2026-09-30', 'rival_rename')])).toHaveLength(weeks.length)
    expect(weeksSinceOurChanges(weeks, [rule('2026-09-30', 'entity_retag')])).toHaveLength(weeks.length)
  })

  it('takes weeks with nothing gathered off the axis: the run of weeks with data that ends at the latest', () => {
    const gappy = [at('2026-08-24', 187), at('2026-08-31', 0), at('2026-09-07', 404), at('2026-09-14', 318), at('2026-09-21', 0), at('2026-09-28', 0)]
    expect(weeksSinceOurChanges(gappy, []).map((w) => w.week)).toEqual(['2026-09-07', '2026-09-14'])
  })

  it('draws no week counting videos let in before we checked relevance, nor any week before it', () => {
    const mixed = [at('2026-09-07', 404, 27), at('2026-09-14', 318), at('2026-09-21', 300, 3), at('2026-09-28', 280), at('2026-10-05', 290)]
    expect(weeksSinceOurChanges(mixed, []).map((w) => w.week)).toEqual(['2026-09-28', '2026-10-05'])
  })

  it('leaves nothing on staging’s own weeks: changes to 26 Sep, nothing gathered after 20 Sep, pre-check videos to 14 Sep', () => {
    const axis = ['2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']
    const vols = pooledWeekVolumes(STAGING_WEEK_VOLUMES, STAGING_RIVALS, axis, { now: '2026-10-11T06:00:00.000Z', updates: STAGING_UPDATES })
    expect(weeksSinceOurChanges(vols, weekRules(changesFromLog(STAGING_CHANGES), axis))).toEqual([])
  })

  it('is idempotent, and keeps the weeks in axis order', () => {
    const once = weeksSinceOurChanges(weeks, [rule('2026-09-13', 'terms')])
    expect(weeksSinceOurChanges(once, [])).toEqual(once)
    expect(once.map((w) => w.week)).toEqual([...once.map((w) => w.week)].sort())
  })
})

// The lead's ruling of 5 Oct, part 1: one unchecked video must not blank a
// week. The Dashboard's bar counts only the CHECKED videos and their comments.
describe('checkedWeek', () => {
  // Sealand, the week of 28 Sep, read 5 Oct: 266 market videos and 5,029
  // comments, one video unchecked (a heuristic default of the 20 Sep gather)
  // with one comment dated in the week.
  const sealand: WeekVolume = {
    week: '2026-09-28', state: 'filling', updatesSince: 0, videos: 266, comments: 5029, category: 259, rivalFiled: 7,
    commentsNextMonth: 0, medianDated: 9, under5: 90, olderVideos: 40, unchecked: 1, uncheckedComments: 1, cadence: null,
  }

  it('leaves the unchecked video and its comment out: 265 videos and 5,028 comments, nothing unchecked left in', () => {
    expect(checkedWeek(sealand)).toEqual({
      week: '2026-09-28', state: 'filling', cadence: null, videos: 265, comments: 5028, unchecked: 0, uncheckedLeftOut: 1,
    })
  })

  it('without the unchecked videos\' comments (the function before its migration), keeps them counted and unchecked, so the cut still drops the week', () => {
    const { uncheckedComments: _u, ...unknown } = sealand
    const w = checkedWeek(unknown)
    expect(w).toMatchObject({ videos: 266, comments: 5029, unchecked: 1, uncheckedLeftOut: 0 })
    expect(weeksSinceOurChanges([w], [])).toEqual([])
    expect(weeksSinceOurChanges([checkedWeek(sealand)], []).map((x) => x.videos)).toEqual([265])
  })

  it('a week with nothing unchecked is its own counts (Össur, the week of 28 Sep: 177 videos, 3,217 comments)', () => {
    const ossur: WeekVolume = { ...sealand, videos: 177, comments: 3217, category: 166, rivalFiled: 11, unchecked: 0, uncheckedComments: 0 }
    expect(checkedWeek(ossur)).toMatchObject({ videos: 177, comments: 3217, unchecked: 0, uncheckedLeftOut: 0 })
  })

  it('a week whose every video is unchecked has nothing checked gathered, and is not drawn', () => {
    const w = checkedWeek({ ...sealand, videos: 3, comments: 12, unchecked: 3, uncheckedComments: 12 })
    expect(w).toMatchObject({ state: 'none_gathered', videos: 0, comments: 0, unchecked: 0 })
    expect(weeksSinceOurChanges([w], [])).toEqual([])
  })

  it('is exact on the rows: per audience, comments less the unchecked videos\' comments (production, 5 Oct)', () => {
    const row = (audience: string, videos: number, comments: number, unchecked = 0, uncheckedComments = 0): MarketWeekRow => ({
      week: '2026-09-28', audience, videos, comments, commentsNextMonth: 0, under5: 0, medianDated: 9, meanDated: 18.9, olderVideos: 0, unchecked, uncheckedComments,
    })
    const rows = [
      row('competitor:Cotopaxi', 1, 1), row('competitor:Freitag', 1, 7), row('competitor:Patagonia', 2, 63),
      row('competitor:The North Face', 3, 28), row('industry-other', 259, 4930, 1, 1),
    ]
    const rivals = ['competitor:Cotopaxi', 'competitor:Freitag', 'competitor:Patagonia', 'competitor:The North Face']
    const [w] = pooledWeekVolumes(rows, rivals, ['2026-09-28'], { now: '2026-10-05T07:00:00Z', updates: [] })
    expect(w).toMatchObject({ videos: 266, comments: 5029, unchecked: 1, uncheckedComments: 1 })
    expect(checkedWeek(w)).toMatchObject({ videos: 265, comments: 5028, unchecked: 0 })
  })
})

// The lead's ruling of 5 Oct, part 2: a pipeline change made inside a run,
// before that run's gather, starts at that run.
describe('preGatherCutBefore', () => {
  // Össur's runs, as production holds them (read 5 Oct): the 13 Sep update and
  // the manual 4 Oct run, whose window reaches back to the 13 Sep update's
  // opening, and whose subreddit discovery wrote its row at 11:46:25, before
  // its searches.
  const OSSUR_RUNS: ChartRun[] = [
    { id: 'd346b0f7', status: 'completed', startedAt: '2026-09-13T04:06:38Z', finishedAt: '2026-09-13T06:26:49Z', windowStart: '2026-09-06T04:06:38Z', windowEnd: '2026-09-13T04:06:38Z' },
    {
      id: '555af400', status: 'partial', startedAt: '2026-10-04T11:45:54Z', finishedAt: '2026-10-04T14:46:27Z',
      windowStart: '2026-09-13T04:06:38Z', windowEnd: '2026-10-04T11:45:54Z', errors: ['themes: failed', 'transcribe: failed', 'pass-a: failed'],
    },
  ]
  const probe = { changedAt: '2026-10-04T11:46:25Z', preGatherRunId: '555af400' }

  it('a discovery change inside the 4 Oct run starts where every earlier gather had ended: the 13 Sep update\'s finish', () => {
    expect(preGatherCutBefore(probe, OSSUR_RUNS)).toBe('2026-09-13T06:26:49.000Z')
  })

  it('cuts only the weeks that begin before it, so the week the run gathered is drawn (28 Sep and the two before it)', () => {
    const rules = weekRules([{ id: 'p', surface: 'subreddits', changedAt: probe.changedAt, note: null, affects: [], preGatherRunId: '555af400' }],
      ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'], OSSUR_RUNS)
    expect(rules).toEqual([{ date: '2026-10-04', week: '2026-09-28', surface: 'subreddits', words: 'our search changes', cutBefore: '2026-09-13T06:26:49.000Z' }])
    const at = (week: string): WeekVolume => ({
      week, state: 'filling', updatesSince: 0, videos: 100, comments: 1000, category: 100, rivalFiled: 0,
      commentsNextMonth: 0, medianDated: null, under5: 0, olderVideos: 0, unchecked: 0,
    })
    const weeks = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'].map(at)
    expect(weeksSinceOurChanges(weeks, rules).map((w) => w.week)).toEqual(['2026-09-14', '2026-09-21', '2026-09-28'])
    // The same change with no run (an operator's edit at that instant) cuts its own week, as before.
    const own = weekRules([{ id: 'o', surface: 'subreddits', changedAt: probe.changedAt, note: null, affects: [] }], ['2026-09-28'], OSSUR_RUNS)
    expect(own[0].cutBefore).toBeUndefined()
    expect(weeksSinceOurChanges(weeks, own)).toEqual([])
    // Without the runs (a fixture), every change cuts at its own week.
    expect(weekRules([{ id: 'p', surface: 'subreddits', changedAt: probe.changedAt, note: null, affects: [], preGatherRunId: '555af400' }], ['2026-09-28'])[0].cutBefore).toBeUndefined()
  })

  it('a week that begins exactly at the instant is not cut; one that begins before it is', () => {
    const rule = (cutBefore: string): WeekRule => ({ date: '2026-10-04', week: '2026-09-28', surface: 'terms', words: '', cutBefore })
    const at = (week: string): WeekVolume => ({
      week, state: 'settled', updatesSince: 2, videos: 10, comments: 100, category: 10, rivalFiled: 0,
      commentsNextMonth: 0, medianDated: null, under5: 0, olderVideos: 0, unchecked: 0,
    })
    const weeks = ['2026-09-21', '2026-09-28'].map(at)
    expect(weeksSinceOurChanges(weeks, [rule('2026-09-28T00:00:00.000Z')]).map((w) => w.week)).toEqual(['2026-09-28'])
    expect(weeksSinceOurChanges(weeks, [rule('2026-09-28T00:00:00.001Z')])).toEqual([])
    expect(weeksSinceOurChanges(weeks, [rule('2026-09-20T06:00:00.000Z')]).map((w) => w.week)).toEqual(['2026-09-21', '2026-09-28'])
    // The latest cut of all the rules wins: an operator's change in the week of 21 Sep still cuts it.
    const operator: WeekRule = { date: '2026-09-23', week: '2026-09-21', surface: 'terms', words: '' }
    expect(weeksSinceOurChanges(weeks, [rule('2026-09-20T06:00:00.000Z'), operator]).map((w) => w.week)).toEqual(['2026-09-28'])
  })

  it('Sealand\'s shape: a change in the 4 Oct run (resumed, its started_at the resume\'s) starts after the 27 Sep update finished', () => {
    const runs: ChartRun[] = [
      { id: 'f3646446', status: 'partial', startedAt: '2026-09-27T04:03:42Z', finishedAt: '2026-09-27T07:28:35Z', windowStart: '2026-09-20T04:02:57Z', windowEnd: '2026-09-27T04:03:42Z' },
      { id: '393b95df', status: 'completed', startedAt: '2026-10-04T11:45:46Z', finishedAt: '2026-10-04T12:13:08Z', windowStart: '2026-09-27T04:03:42Z', windowEnd: '2026-10-04T04:01:17Z' },
    ]
    // Written at 04:01:40, after the run opened and hours before the resume restamped started_at.
    expect(preGatherCutBefore({ changedAt: '2026-10-04T04:01:40Z', preGatherRunId: '393b95df' }, runs)).toBe('2026-09-27T07:28:35.000Z')
  })

  it('fails closed (the change\'s own week) unless the change was written inside the run it names', () => {
    expect(preGatherCutBefore({ changedAt: probe.changedAt }, OSSUR_RUNS)).toBeNull()
    expect(preGatherCutBefore({ ...probe, preGatherRunId: 'not-a-run' }, OSSUR_RUNS)).toBeNull()
    expect(preGatherCutBefore({ ...probe, changedAt: '2026-10-04T11:40:00Z' }, OSSUR_RUNS)).toBeNull() // before it opened
    expect(preGatherCutBefore({ ...probe, changedAt: '2026-10-04T15:00:00Z' }, OSSUR_RUNS)).toBeNull() // after it finished
    expect(preGatherCutBefore(probe, OSSUR_RUNS.map((r) => (r.id === '555af400' ? { ...r, windowEnd: null } : r)))).toBeNull()
  })

  it('never earlier than a gather made before the change: an earlier run resumed after it bounds at the change itself, and an unfinished one refuses', () => {
    const resumed: ChartRun = { id: 'r1', status: 'completed', startedAt: '2026-10-04T13:00:00Z', finishedAt: '2026-10-04T13:30:00Z', windowEnd: '2026-10-04T04:00:00Z' }
    expect(preGatherCutBefore(probe, [...OSSUR_RUNS, resumed])).toBe('2026-10-04T11:46:25.000Z')
    const stuck: ChartRun = { id: 'r2', status: 'running', startedAt: '2026-09-20T04:00:00Z', finishedAt: null }
    expect(preGatherCutBefore(probe, [...OSSUR_RUNS, stuck])).toBeNull()
    // A run opened after the change gathered under it, and does not bound it.
    const later: ChartRun = { id: 'r3', status: 'completed', startedAt: '2026-10-11T04:00:00Z', finishedAt: '2026-10-11T07:00:00Z', windowEnd: '2026-10-11T04:00:00Z' }
    expect(preGatherCutBefore(probe, [...OSSUR_RUNS, later])).toBe('2026-09-13T06:26:49.000Z')
  })
})
