import { describe, expect, it } from 'vitest'
import { MAX_FLAGS } from '../reading/anomaly'
import {
  FIRST_SCREEN_BUDGET,
  FLAG_FIGURES,
  NOTHING_UNUSUAL,
  SENTENCE_FIGURES,
  WEEKLY_BLOCK_KEYS,
  WEEKLY_EMAIL_WIDTH,
  WEEKLY_RULE,
  firstScreenCount,
  flagFigures,
  levelOf,
  section1Figures,
  weekCheck,
  weekSentence,
  weeklyPeriod,
  weeklySubject,
  withinFirstScreenBudget,
  type Section1,
  type WeekFlag,
} from './weekly'

const flag = (over: Partial<WeekFlag> = {}): WeekFlag => ({
  objectKind: 'kind',
  label: 'Objections',
  denominator: 'every audience together',
  weekK: 29,
  weekN: 205,
  baselineK: 38,
  baselineN: 1089,
  changePts: 10.7,
  bandPts: 5,
  sentences: [],
  quoteRefs: [],
  href: '/dashboard/week',
  ...over,
})

const section1 = (over: Partial<Section1> = {}): Section1 => ({
  month: '2026-09-01',
  daysIn: 18,
  window: { from: '2026-09-06', to: '2026-09-13' },
  sentence: weekSentence({
    month: '2026-09-01',
    daysIn: 18,
    label: 'Durability',
    objectId: '2418f4d7-aaaa-4bbb-8ccc-ddddeeeeffff',
    audience: 'the category’s videos',
    k: 65,
    n: 271,
    atLastMonth: { k: 44, n: 244 },
  }),
  check: weekCheck({ state: 'nothing_unusual', flags: [] }),
  ...over,
})

describe('the arrangement', () => {
  it('names six sections in the design’s order', () => {
    expect(WEEKLY_BLOCK_KEYS).toEqual([
      'weekly.week',
      'weekly.subjects',
      'weekly.incoming',
      'weekly.sales',
      'weekly.content',
      'weekly.coverage',
    ])
  })

  it('is 640 wide, the mock’s width', () => {
    expect(WEEKLY_EMAIL_WIDTH).toBe(640)
  })

  it('prints the rule that keeps it honest, naming the month and the week', () => {
    expect(WEEKLY_RULE).toContain('this month so far')
    expect(WEEKLY_RULE).toContain('since the last update')
    // No direction word anywhere on the masthead.
    expect(WEEKLY_RULE).not.toMatch(/growing|fading|rising|declining/i)
  })
})

describe('weekSentence', () => {
  it('states the level, its count and its denominator, against the same point last month', () => {
    const s = weekSentence({
      month: '2026-09-01',
      daysIn: 18,
      label: 'Durability',
      objectId: 'durability',
      audience: 'the category’s videos',
      k: 65,
      n: 271,
      atLastMonth: { k: 44, n: 244 },
    })
    expect(s.body).toContain('September, 18 days in')
    expect(s.body).toContain('at this point in August')
    expect(Object.keys(s.figures)).toHaveLength(SENTENCE_FIGURES)
    expect(s.figures.o_durability_share.value).toBe(24)
    expect(s.figures.o_durability_of.value).toBe(271)
    expect(s.figures.o_durability_last.value).toBe(18)
    // The numerator is deliberately not a figure: the design's sentence prints
    // the share and its denominator, and a fourth number costs a flag.
    expect(s.body).not.toContain('videos_')
  })

  it('says the comparison is not recorded rather than dropping the clause', () => {
    const s = weekSentence({
      month: '2026-09-01',
      daysIn: 18,
      label: 'Durability',
      objectId: 'durability',
      audience: 'the category’s videos',
      k: 65,
      n: 271,
      atLastMonth: null,
    })
    expect(s.body).toContain('At this point last month: not recorded yet.')
    expect(Object.keys(s.figures)).toHaveLength(SENTENCE_FIGURES - 1)
  })

  it('keys a uuid-named object so the token substitutes', () => {
    const s = weekSentence({
      month: '2026-09-01',
      daysIn: 3,
      label: 'A theme',
      objectId: '2418f4d7-aaaa-4bbb-8ccc-ddddeeeeffff',
      audience: 'the category’s videos',
      k: 1,
      n: 10,
      atLastMonth: null,
    })
    for (const key of Object.keys(s.figures)) expect(key).toMatch(/^[a-z][a-z0-9_]*$/)
  })

  it('stamps a complete month as complete rather than inventing a day count', () => {
    const s = weekSentence({
      month: '2026-08-01',
      daysIn: null,
      label: 'Durability',
      objectId: 'durability',
      audience: 'the category’s videos',
      k: 1,
      n: 10,
      atLastMonth: null,
    })
    expect(s.body).toContain('August, complete')
  })
})

describe('weekCheck', () => {
  it('prints "Nothing unusual this week." in full', () => {
    expect(weekCheck({ state: 'nothing_unusual', flags: [] }).line).toBe(NOTHING_UNUSUAL)
  })

  it('tells "we did not look" apart from "nothing was unusual"', () => {
    const lines = (['nothing_unusual', 'suppressed', 'no_window', 'not_recorded', 'baseline_forming'] as const).map(
      (state) =>
        weekCheck({
          state,
          flags: [],
          monthsClearing: 2,
          suppression: { reason: 'thin', note: 'This update read well under its usual number of videos, so this week is not compared with the months behind it.' },
        }).line,
    )
    expect(new Set(lines).size).toBe(lines.length)
  })

  it('carries the suppression’s own reason and words', () => {
    const c = weekCheck({
      state: 'suppressed',
      flags: [],
      suppression: { reason: 'stalled', note: 'This update ran past the days it was covering and never settled, so this week is not compared with the months behind it.' },
    })
    expect(c.reason).toBe('stalled')
    expect(c.line).toContain('never settled')
    expect(c.flags).toHaveLength(0)
  })

  it('names how many months the baseline has', () => {
    const c = weekCheck({ state: 'baseline_forming', flags: [], monthsClearing: 2 })
    expect(c.baseline).toBe('baseline forming — 2 of 3 months')
  })

  it('counts the flags it could not print', () => {
    const c = weekCheck({ state: 'flagged', flags: [flag(), flag({ label: 'Praise' }), flag({ label: 'Questions' })], flaggedCount: 7 })
    expect(c.flags).toHaveLength(3)
    expect(c.moreFlags).toBe(4)
  })

  it('never prints more flags than the cap, whatever it is handed', () => {
    const many = Array.from({ length: 9 }, (_, i) => flag({ label: `Thing ${i}` }))
    expect(weekCheck({ state: 'flagged', flags: many }).flags.length).toBeLessThanOrEqual(MAX_FLAGS)
  })
})

describe('the 12-number first-screen budget', () => {
  it('fits a quiet week', () => {
    const s = section1()
    expect(firstScreenCount(s)).toBe(SENTENCE_FIGURES)
    expect(withinFirstScreenBudget(s)).toBe(true)
  })

  it('sits at exactly the budget on the busiest first screen a reader can get', () => {
    const s = section1({
      check: weekCheck({ state: 'flagged', flags: [flag(), flag({ label: 'Praise' }), flag({ label: 'Questions' })] }),
    })
    expect(firstScreenCount(s)).toBe(FIRST_SCREEN_BUDGET)
    expect(withinFirstScreenBudget(s)).toBe(true)
  })

  it('binds: the sentence and three flags are the whole budget', () => {
    expect(SENTENCE_FIGURES + MAX_FLAGS * FLAG_FIGURES).toBe(FIRST_SCREEN_BUDGET)
  })

  it('trims rather than overspending when more than three flags clear', () => {
    const many = Array.from({ length: 6 }, (_, i) => flag({ label: `Thing ${i}` }))
    const s = section1({ check: weekCheck({ state: 'flagged', flags: many, flaggedCount: 6 }) })
    expect(withinFirstScreenBudget(s)).toBe(true)
    expect(s.check.moreFlags).toBe(3)
  })

  it('declares three figures per flag, each with its unit', () => {
    const f = flagFigures(flag(), 0)
    expect(Object.keys(f)).toHaveLength(FLAG_FIGURES)
    expect(f.flag_1_week_share.unit).toBe('pct')
    expect(f.flag_1_baseline_share.unit).toBe('pct')
    expect(f.flag_1_change.unit).toBe('pts')
    expect(f.flag_1_change.label).toContain('band of 5')
  })

  it('counts the same figure once when two blocks name it', () => {
    const s = section1()
    expect(Object.keys(section1Figures(s)).length).toBe(firstScreenCount(s))
  })
})

describe('the masthead', () => {
  it('prints the update’s real window dates, not the word "week"', () => {
    expect(weeklyPeriod({ from: '2026-09-06', to: '2026-09-13' }, '2026-09-01')).toBe('6 Sep – 13 Sep')
  })

  it('falls back to the month when the update records no window', () => {
    expect(weeklyPeriod(null, '2026-09-01')).toBe('September so far')
  })

  it('names the flagged object in the subject line, and no direction word', () => {
    const one = weeklySubject('Össur', weekCheck({ state: 'flagged', flags: [flag()] }))
    expect(one).toBe('Össur: Objections is unusual this week')
    const two = weeklySubject('Össur', weekCheck({ state: 'flagged', flags: [flag(), flag({ label: 'Praise' })] }))
    expect(two).toContain('and 1 more')
    for (const s of [one, two]) expect(s).not.toMatch(/growing|fading|up |down /i)
  })

  it('says nothing unusual when nothing fired, and that the check is forming when it is', () => {
    expect(weeklySubject('Sealand', weekCheck({ state: 'nothing_unusual', flags: [] }))).toContain('nothing unusual')
    expect(weeklySubject('Sealand', weekCheck({ state: 'baseline_forming', flags: [], monthsClearing: 1 }))).toContain('still forming')
  })
})

describe('levelOf', () => {
  it('never prints a share without the count under it', () => {
    expect(levelOf(65, 271)).toBe('24% · 65 of 271')
    expect(levelOf(3, 0)).toBe('3 videos')
  })
})
