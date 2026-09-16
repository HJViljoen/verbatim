import { describe, it, expect } from 'vitest'

import { NOT_OBSERVED } from '../reading/standings'
import {
  ATTENTION_UNLOCK, CORPUS_DENOMINATOR_LINE, QUESTIONS_GROUPING_NOTE,
  buildStandingsBlock, comparabilityCaveat, competitiveSurfaceHref, competitiveUnlockRows,
  mixLine, questionsEmpty, rivalState, trackingRules, type StandingsMonthRow,
} from './competitive-surface'

const den = (over: Partial<{ month: string; audience: string; videos: number; comments: number; dual_mention: number; run_id: string | null }> = {}) => ({
  month: '2026-09-01',
  audience: 'client',
  videos: 19,
  comments: 151,
  platform_mix: { tiktok: 10, youtube: 9 },
  dual_mention: 6,
  status: 'filling' as const,
  run_id: 'run-a',
  ...over,
})

/** Össur's own September and August, as production holds them. */
const OSSUR = [
  den({ month: '2026-08-01', audience: 'client', videos: 20, comments: 237, dual_mention: 3 }),
  den({ month: '2026-08-01', audience: 'competitor:Ottobock', videos: 73, comments: 1264, dual_mention: 0 }),
  den({ month: '2026-08-01', audience: 'industry-other', videos: 628, comments: 23542, dual_mention: 0 }),
  den({ month: '2026-09-01', audience: 'client', videos: 19, comments: 151, dual_mention: 6 }),
  den({ month: '2026-09-01', audience: 'competitor:Ottobock', videos: 42, comments: 645, dual_mention: 0 }),
  den({ month: '2026-09-01', audience: 'industry-other', videos: 388, comments: 10534, dual_mention: 0 }),
]

const build = (rows = OSSUR, rivals: { name: string; retiredAt: string | null }[] = [{ name: 'Ottobock', retiredAt: null }]) =>
  buildStandingsBlock({
    brand: 'Össur',
    rivals,
    denominators: rows,
    axis: ['2026-09-01'],
    readAxis: ['2026-08-01', '2026-09-01'],
    month: '2026-09-01',
    changes: [],
  })

describe('CO2 · the standings', () => {
  it('reproduces September’s shares from the stored months', () => {
    const rows = build().rows
    const client = rows.find((r) => r.audience === 'client')!
    const rival = rows.find((r) => r.audience === 'competitor:Ottobock')!
    // 19 of 449 videos, 151 of 11,330 comments.
    expect(client.content).toEqual({ k: 19, n: 449, pct: 4.2 })
    expect(client.attention).toEqual({ k: 151, n: 11330, pct: 1.3 })
    expect(rival.content?.pct).toBe(9.4)
  })

  it('draws a row for a tracked rival the month holds nothing for, and never a 0%', () => {
    const block = build(OSSUR, [{ name: 'Ottobock', retiredAt: null }, { name: 'Rareform', retiredAt: null }])
    const quiet = block.rows.find((r) => r.audience === 'competitor:Rareform')!
    expect(quiet.observed).toBe(false)
    expect(quiet.content).toBeNull()
    expect(quiet.attention).toBeNull()
  })

  it('keeps a retired rival’s row rather than dropping its months', () => {
    const block = build(OSSUR, [{ name: 'Ottobock', retiredAt: null }, { name: 'Patagonia', retiredAt: '2026-09-09' }])
    expect(block.rows.map((r) => r.label)).toContain('Patagonia')
  })

  it('carries the dual-mention count for the client’s own row', () => {
    expect(build().dualMention).toBe(6)
  })

  it('says which denominators these are, and names the attention index it does not have', () => {
    const block = build()
    expect(block.denominatorLine).toBe(CORPUS_DENOMINATOR_LINE)
    expect(block.unlock).toBe(ATTENTION_UNLOCK)
    expect(block.source).toBe('corpus')
  })

  it('names the month the table IS, never the month in hand', () => {
    // The gap every calendar month has: `freeze-months` writes a month's rows
    // when an update lands in it, so from the 1st until that month's first
    // delivered run the newest stored month is last month's. The block used to
    // print September's 449 videos and 11,330 comments under "Oct 2026".
    const block = buildStandingsBlock({
      brand: 'Össur',
      rivals: [{ name: 'Ottobock', retiredAt: null }],
      denominators: OSSUR,
      axis: ['2026-09-01', '2026-10-01'],
      readAxis: ['2026-08-01', '2026-09-01', '2026-10-01'],
      month: '2026-10-01',
      changes: [],
    })
    expect(block.month).toBe('2026-09-01')
    expect(block.monthLabel).toBe('Sep 2026')
    expect(block.behind).toBe('Oct 2026 has not been read yet, so this table is Sep 2026.')
    // And the table is September's, so the figures and the rows agree with the
    // sentence: 19 of 449, not "not observed" under a 449.
    expect(block.denominators[block.denominators.length - 1].label).toBe('Sep 2026')
    expect(block.rows.find((r) => r.audience === 'client')!.content).toEqual({ k: 19, n: 449, pct: 4.2 })
    // August is still what September is compared with — the previous CALENDAR
    // month of the table's own month, not the previous stored one.
    expect(block.rows.find((r) => r.audience === 'client')!.contentVerdict).not.toBeNull()
  })

  it('refuses rather than borrowing another month when the horizon holds no read month', () => {
    const block = buildStandingsBlock({
      brand: 'Össur',
      rivals: [{ name: 'Ottobock', retiredAt: null }],
      denominators: OSSUR,
      axis: ['2026-10-01'],
      readAxis: ['2026-09-01', '2026-10-01'],
      month: '2026-10-01',
      changes: [],
    })
    expect(block.rows).toEqual([])
    expect(block.denominators).toEqual([])
    expect(block.month).toBe('2026-10-01')
    expect(block.empty).toBe(
      'Oct 2026 has not been read yet. A month\u2019s row is written by the first update that lands in it, and none has landed in this one.',
    )
  })

  it('never says "nothing was not observed" — the refusal is a month, not a negation', () => {
    // The sentence was `Nothing was ${NOT_OBSERVED} in ${month}.`, which
    // composes "Nothing was not observed in Oct 2026" — the opposite of what
    // it means. It could only fire where the table's month held no rows, and
    // that state now refuses by naming the month.
    const cases = [
      build(),
      buildStandingsBlock({
        brand: 'Össur', rivals: [{ name: 'Ottobock', retiredAt: null }], denominators: OSSUR,
        axis: ['2026-10-01'], readAxis: ['2026-09-01', '2026-10-01'], month: '2026-10-01', changes: [],
      }),
      buildStandingsBlock({
        brand: 'Össur', rivals: [], denominators: null,
        axis: ['2026-09-01'], readAxis: ['2026-09-01'], month: '2026-09-01', changes: [],
      }),
      // A month whose only stored audience is one nobody asked for: the row is
      // drawn (hiding it would stop the shares adding up), so the table is not
      // empty and says nothing about observation at all.
      buildStandingsBlock({
        brand: 'Sealand', rivals: [{ name: 'Cotopaxi', retiredAt: null }],
        denominators: [den({ month: '2026-09-01', audience: 'competitor:Patagonia', videos: 4, comments: 9, dual_mention: 0 })],
        axis: ['2026-09-01'], readAxis: ['2026-08-01', '2026-09-01'], month: '2026-09-01', changes: [],
      }),
    ]
    for (const block of cases) expect(block.empty ?? '').not.toMatch(/was not observed/)
    expect(cases[3].empty).toBeNull()
    expect(cases[3].rows.map((r) => r.label)).toContain('Patagonia')
  })

  it('says nothing is behind when the month in hand is the month read', () => {
    expect(build().behind).toBeNull()
    expect(build().month).toBe('2026-09-01')
  })

  it('has nothing to draw when no month has been read', () => {
    const block = buildStandingsBlock({
      brand: 'Sealand', rivals: [], denominators: null,
      axis: ['2026-09-01'], readAxis: ['2026-09-01'], month: '2026-09-01', changes: [],
    })
    expect(block.empty).toContain('no standings to draw')
    expect(block.rows).toEqual([])
  })

  it('draws a rule once per month a tracking change landed in, never once per change', () => {
    const rules = trackingRules(
      [
        { changed_at: '2026-09-02T00:00:00.000Z', surface: 'terms' as const, affects_months: null },
        { changed_at: '2026-09-09T00:00:00.000Z', surface: 'terms' as const, affects_months: null },
        { changed_at: '2026-08-04T00:00:00.000Z', surface: 'terms' as const, affects_months: null },
        { changed_at: '2025-01-04T00:00:00.000Z', surface: 'terms' as const, affects_months: null },
      ],
      ['2026-08-01', '2026-09-01'],
    )
    expect(rules).toHaveLength(2)
    expect(rules[0].text).toBe('One change to what we track landed in Aug 2026.')
    expect(rules[1].text).toBe('2 changes to what we track landed in Sep 2026.')
  })

  it('counts only the surfaces that change what a month is read from', () => {
    // Measured on production: Sealand's 39 September rows include one
    // schedule/active, one cadence/report_day and one cadence/report_period.
    // The sentence used to call a report-day change a break in the series.
    const rules = trackingRules(
      [
        { changed_at: '2026-09-02T00:00:00.000Z', surface: 'terms' as const, affects_months: null },
        { changed_at: '2026-09-03T00:00:00.000Z', surface: 'cadence' as const, affects_months: null },
        { changed_at: '2026-09-04T00:00:00.000Z', surface: 'schedule' as const, affects_months: null },
        { changed_at: '2026-09-05T00:00:00.000Z', surface: 'subjects' as const, affects_months: null },
      ],
      ['2026-09-01'],
    )
    expect(rules).toHaveLength(1)
    expect(rules[0].text).toBe('One change to what we track landed in Sep 2026.')
  })

  it('dates a rule by the months the change MOVED, not by the day it was typed', () => {
    // Sealand's 2026-09-09 re-tag moved 34 months from 2021-12 on; dating it
    // by the wall clock puts the rule on September alone and leaves every
    // month it actually reached unmarked.
    const rules = trackingRules(
      [{ changed_at: '2026-09-09T00:00:00.000Z', surface: 'entity_retag' as const, affects_months: '[2026-07-01,2026-09-01)' }],
      ['2026-07-01', '2026-08-01', '2026-09-01'],
    )
    expect(rules.map((r) => r.month)).toEqual(['2026-07-01', '2026-08-01'])
  })

  it('collapses a run of months read by different updates into ONE caveat', () => {
    const months: StandingsMonthRow[] = [
      { month: '2026-07-01', label: 'Jul 2026', status: 'frozen', videos: 1, comments: 1, platformMix: {}, runId: 'a' },
      { month: '2026-08-01', label: 'Aug 2026', status: 'frozen', videos: 1, comments: 1, platformMix: {}, runId: 'b' },
      { month: '2026-09-01', label: 'Sep 2026', status: 'filling', videos: 1, comments: 1, platformMix: {}, runId: 'b' },
    ]
    const caveat = comparabilityCaveat(months)
    expect(caveat).toContain('Jul 2026 to Sep 2026')
    expect((caveat ?? '').match(/not like for like/g)).toHaveLength(1)
    expect(comparabilityCaveat(months.map((m) => ({ ...m, runId: 'a' })))).toBeNull()
  })

  it('prints the platform mix largest first', () => {
    expect(mixLine({ youtube: 9, tiktok: 10, reddit: 0 })).toBe('TikTok 10 · YouTube 9')
  })

  it('says "not observed" and never a zero', () => {
    expect(NOT_OBSERVED).toBe('not observed')
  })
})

describe('CO1 · a rival’s state', () => {
  it('tells "never read" apart from "quiet this window" apart from "retired"', () => {
    expect(rivalState({ retiredAt: null, analysed: 319, observedThisWindow: true })).toBe('observed')
    expect(rivalState({ retiredAt: null, analysed: 31, observedThisWindow: false })).toBe('quiet')
    expect(rivalState({ retiredAt: null, analysed: 0, observedThisWindow: false })).toBe('configured')
    expect(rivalState({ retiredAt: '2026-09-09', analysed: 0, observedThisWindow: false })).toBe('retired')
  })

  it('keeps the reader’s horizon when the rival changes', () => {
    expect(competitiveSurfaceHref('Freitag', { horizon: 'last_3', vs: 'Cotopaxi' })).toBe('/dashboard/competitive?horizon=last_3&vs=Freitag')
    expect(competitiveSurfaceHref(null, {})).toBe('/dashboard/competitive')
  })
})

describe('CO5 · the floor, said in words', () => {
  it('has a real empty sentence for a rival nobody asked anything under', () => {
    const line = questionsEmpty({ rival: 'Rareform', videos: 0, floor: 10 })
    expect(line).toContain('Nothing was asked under Rareform’s content')
    expect(line).toContain('Widen the horizon')
  })

  it('shows what there is under the floor, and refuses the share rather than the rows', () => {
    const line = questionsEmpty({ rival: 'Freitag', videos: 4, floor: 10 })
    expect(line).toContain('4 of Freitag’s videos')
    expect(line).toContain('under the floor of 10')
    expect(line).toContain('no share is drawn')
  })

  it('is silent when the floor is cleared', () => {
    expect(questionsEmpty({ rival: 'Ottobock', videos: 33, floor: 10 })).toBeNull()
  })

  it('says why the questions are not grouped into themes', () => {
    expect(QUESTIONS_GROUPING_NOTE).toContain('listed as they were asked')
  })
})

describe('the sections that are not built', () => {
  it('names CO3, CO4, CO6 and CO7, each with an owner and no invented date', () => {
    const rows = competitiveUnlockRows()
    expect(rows.map((r) => r.section)).toEqual(['CO3', 'CO4', 'CO6', 'CO7'])
    for (const r of rows) {
      expect(r.owner).toBeTruthy()
      expect(r.line).not.toMatch(/\bby \d/)
      expect(r.line).not.toMatch(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d\d/)
    }
    // CO4's owner is the client's, not ours: the accounts are theirs to name.
    expect(rows.find((r) => r.section === 'CO4')?.owner).toBe('Your digital director')
  })
})
