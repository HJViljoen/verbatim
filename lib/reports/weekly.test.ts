import { describe, expect, it } from 'vitest'
import { MAX_FLAGS } from '../reading/anomaly'
import {
  CHECK_FLAGGED_NO_DETAIL,
  periodNounFor,
  FIRST_SCREEN_BUDGET,
  FLAG_FIGURES,
  NOTHING_UNUSUAL,
  SENTENCE_FIGURES,
  WEEKLY_BLOCK_KEYS,
  WEEKLY_EMAIL_WIDTH,
  WEEKLY_RULE,
  weeklyRuleFor,
  checkNotRecorded,
  firstScreenCount,
  flagFigures,
  isMonthScopedFigure,
  monthScopedFigures,
  levelOf,
  section1Figures,
  subjectsLead,
  weeklyHeadline,
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
  quotes: [],
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
    audience: 'the category',
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
    // A THIRTY-DAY UPDATE DOES NOT CALL ITSELF A WEEK. Sealand's frozen window
    // is 2026-08-11 → 2026-09-10, and the rule prints twice in the app and
    // email modes and seven times in the print deck.
    expect(weeklyRuleFor('week')).toBe(WEEKLY_RULE)
    expect(weeklyRuleFor('update')).toContain('This update is how much of it arrived since the last one.')
    expect(weeklyRuleFor('update')).not.toContain('The week is')
    expect(weeklySubject('Sealand', { state: 'baseline_forming', noun: 'update' } as never))
      .toBe('Sealand: Your update — this update’s check is still forming')
    expect(weeklySubject('Sealand', { state: 'not_recorded', noun: 'update' } as never))
      .toBe('Sealand: Your update — this update’s check is not recorded yet')
    expect(weeklySubject('Össur', { state: 'not_recorded', noun: 'week' } as never))
      .toBe('Össur: Your update — the weekly check is not recorded yet')
    expect(checkNotRecorded('update')).toContain('This update’s check')

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
      audience: 'the category',
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
      audience: 'the category',
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
      audience: 'the category',
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
      audience: 'the category',
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

  // The flagged arm is entered on the state alone, so `outcome = 'flagged'`
  // with an empty anomaly_flags read printed "0 things this week are unusual".
  it('does not count zero things when the record flagged and no flag was read', () => {
    const c = weekCheck({ state: 'flagged', flags: [], flaggedCount: 0 })
    expect(c.state).toBe('flagged')
    expect(c.line).toBe(CHECK_FLAGGED_NO_DETAIL)
    expect(c.line).not.toMatch(/\b0 things\b/)
    expect(c.line).not.toBe(NOTHING_UNUSUAL)
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

  // `sent_figures.month` is NOT NULL because a figure with no period is the
  // run-indexed reading this phase exists to remove — and a week's share filed
  // under September is a period key that is wrong rather than absent. The
  // artefact still prints all of these; only the record refuses them.
  it('knows which of its own tokens are not a reading of the month', () => {
    expect(isMonthScopedFigure('flag_1_week_share')).toBe(false)
    expect(isMonthScopedFigure('flag_2_baseline_share')).toBe(false)
    expect(isMonthScopedFigure('flag_1_change')).toBe(false)
    expect(isMonthScopedFigure('update_videos')).toBe(false)
    expect(isMonthScopedFigure('o_t1_last')).toBe(false)
    expect(isMonthScopedFigure('month_videos')).toBe(true)
    expect(isMonthScopedFigure('o_t1_share')).toBe(true)
    expect(isMonthScopedFigure('o_t1_of')).toBe(true)
  })

  it('keeps every month figure and drops every week one', () => {
    const table = { ...flagFigures(flag(), 0), month_videos: { value: 449, unit: 'videos' as const, label: 'videos in the month so far' } }
    expect(Object.keys(monthScopedFigures(table))).toEqual(['month_videos'])
  })
})

describe('the masthead', () => {
  it('prints the update’s real window dates, not the word "week"', () => {
    expect(weeklyPeriod({ from: '2026-09-06', to: '2026-09-13' }, '2026-09-01')).toBe('6 Sep – 13 Sep')
  })

  it('falls back to the month when the update records no window', () => {
    expect(weeklyPeriod(null, '2026-09-01')).toBe('September so far')
  })

  // A k OF n MAY BE IN A SUBJECT LINE, a multiple may not (weekly.headline).
  // The mock's is "Zip failures 3× usual this week, under Freitag content" — a
  // ratio read before any of the apparatus that makes it mean something, over
  // a "where" clause no field supplies. A count with its own denominator is
  // the opposite case: it is checkable from the inbox.
  it('names the flagged object in the subject line, with its count, and no direction word', () => {
    const one = weeklySubject('Össur', weekCheck({ state: 'flagged', flags: [flag()] }))
    expect(one).toBe('Össur: Objections is unusual this week — 29 of 205 videos')
    const two = weeklySubject('Össur', weekCheck({ state: 'flagged', flags: [flag(), flag({ label: 'Praise' })] }))
    expect(two).toContain('and 1 more')
    for (const s of [one, two]) {
      expect(s).not.toMatch(/growing|fading|up |down /i)
      expect(s).not.toMatch(/×/)
    }
  })

  it('states no count where the flag records no n to state it against', () => {
    const bare = weeklySubject('Össur', weekCheck({ state: 'flagged', flags: [flag({ weekK: 0, weekN: 0 })] }))
    expect(bare).toBe('Össur: Objections is unusual this week')
  })

  it('says nothing unusual when nothing fired, and that the check is forming when it is', () => {
    expect(weeklySubject('Sealand', weekCheck({ state: 'nothing_unusual', flags: [] }))).toContain('nothing unusual')
    expect(weeklySubject('Sealand', weekCheck({ state: 'baseline_forming', flags: [], monthsClearing: 1 }))).toContain('still forming')
  })

  // The subject IS the artefact's h1, so a state that fell through to "nothing
  // unusual this week" printed a reassurance over a body saying the check never
  // ran — which is what Össur's live artefact did. The six states differ on the
  // check's line; they must differ here too.
  it('gives each of the six states its own subject, and only one of them says nothing was unusual', () => {
    const subjects = (['flagged', 'nothing_unusual', 'baseline_forming', 'suppressed', 'no_window', 'not_recorded'] as const).map(
      (state) =>
        weeklySubject(
          'Össur',
          weekCheck({
            state,
            flags: state === 'flagged' ? [flag()] : [],
            monthsClearing: 1,
            suppression: { reason: 'thin', note: 'This update read well under its usual number of videos, so this week is not compared with the months behind it.' },
          }),
        ),
    )
    expect(new Set(subjects).size).toBe(subjects.length)
    expect(subjects.filter((s) => /nothing unusual/i.test(s))).toHaveLength(1)
    for (const s of subjects) expect(s.startsWith('Össur')).toBe(true)
  })

  it('does not claim a quiet week when the check flagged but nothing survived the read', () => {
    const s = weeklySubject('Össur', { state: 'flagged', noun: 'week', line: 'x', baseline: null, reason: null, flags: [], moreFlags: 0 })
    expect(s).not.toMatch(/nothing unusual/i)
    expect(s).toContain('something this week is unusual')
  })
})

describe('levelOf', () => {
  it('never prints a share without the count under it', () => {
    expect(levelOf(65, 271)).toBe('24.0% · 65 of 271')
    expect(levelOf(3, 0)).toBe('3 videos')
  })
})

// Sealand's frozen window is 2026-08-11 → 2026-09-10 — thirty days — and five
// of six headings, the check's line and the subject all said "this week" over
// it. The masthead already printed the real dates.
describe('what to call the window', () => {
  it('calls a week a week, and a month-long update an update', () => {
    expect(periodNounFor({ from: '2026-09-06', to: '2026-09-13' })).toBe('week')
    expect(periodNounFor({ from: '2026-08-11', to: '2026-09-10' })).toBe('update')
  })

  it('keeps the artefact’s own word where no window was recorded', () => {
    expect(periodNounFor(null)).toBe('week')
  })

  it('says the check’s lines in that word', () => {
    expect(weekCheck({ state: 'nothing_unusual', flags: [], noun: 'update' }).line).toBe('Nothing unusual in this update.')
    expect(weekCheck({ state: 'flagged', flags: [flag()], noun: 'update' }).line).toContain('One thing in this update is unusual')
  })

  it('says the subject line in that word too', () => {
    const quiet = weekCheck({ state: 'nothing_unusual', flags: [], noun: 'update' })
    expect(weeklySubject('Sealand', quiet)).toBe('Sealand: Your update — nothing unusual in this update')
    const fired = weekCheck({ state: 'flagged', flags: [flag()], noun: 'update' })
    expect(weeklySubject('Sealand', fired)).toBe('Sealand: Objections is unusual in this update — 29 of 205 videos')
  })
})

// `weekly.s2.lead` — one of the brief's two MISSING items. The mock's line
// counts subjects "above a typical week"; nothing in this product computes a
// typical week, so the count is of subjects whose MONTH reading cleared its
// band, which is what the brief asks for under D6.
describe('what the subject table adds up to', () => {
  const row = (label: string, state: string | null) => ({
    label,
    category: { verdict: state == null ? null : { state } },
  })

  it('counts the subjects that cleared their band, and names them', () => {
    const lead = subjectsLead([row('Durability', 'moved'), row('Price', 'no_clear_change'), row('Zips', 'moved')])
    expect(lead?.level).toBe('2 of 3')
    expect(lead?.body).toBe(' subjects moved beyond their band this month — durability and zips.')
  })

  it('says none moved when the comparison ran and nothing cleared', () => {
    const lead = subjectsLead([row('Durability', 'no_clear_change'), row('Price', 'no_clear_change')])
    expect(lead?.level).toBe('0 of 2')
    expect(lead?.body).toContain('inside the margin of the measurement')
  })

  // A SUBJECT THAT COULD NOT BE COMPARED IS NOT A SUBJECT THAT DID NOT MOVE.
  // `refused` and `baseline_forming` are claims about our bookkeeping.
  it('tells "none moved" apart from "none could be compared"', () => {
    const lead = subjectsLead([row('Durability', 'refused'), row('Price', 'baseline_forming'), row('Zips', null)])
    expect(lead?.level).toBeNull()
    expect(lead?.body).toContain('carried a comparison this month')
    expect(lead?.body).not.toContain('moved')
  })

  it('says nothing at all where there are no rows', () => {
    expect(subjectsLead([])).toBeNull()
  })

  it('prints no direction word', () => {
    const lead = subjectsLead([row('Durability', 'moved')])
    expect(`${lead?.level}${lead?.body}`).not.toMatch(/\b(grew|growing|rose|rising|above|climbed)\b/i)
  })
})

// THE TENANT IS AN INBOX'S BUSINESS, NOT A HEADLINE'S. `weeklySubject` keeps
// it — that is how a reader tells one client's report from another's in a mail
// list — and the artefact's own heading drops it, because the artboard puts
// the tenant at the right end of the date row and again in the footer.
describe('the headline inside the artefact', () => {
  it('is the subject line without the tenant', () => {
    const fired = weekCheck({ state: 'flagged', flags: [flag()], flaggedCount: 1 })
    expect(weeklyHeadline(fired)).toBe('Objections is unusual this week — 29 of 205 videos')
    expect(weeklySubject('Sealand', fired)).toBe(`Sealand: ${weeklyHeadline(fired)}`)
  })

  // The level is `flags[0]`'s, so appending it to the multi-flag arm gave a
  // count belonging to one of two named things without saying which.
  it('drops the count when more than one thing is named', () => {
    const two = weekCheck({ state: 'flagged', flags: [flag(), flag({ label: 'Price' })], flaggedCount: 2 })
    expect(weeklyHeadline(two)).toBe('Objections and 1 more are unusual this week')
    expect(weeklyHeadline(two)).not.toContain('of 205')
  })
})
