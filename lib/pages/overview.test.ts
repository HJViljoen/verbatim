import { describe, it, expect } from 'vitest'

import { buildSeries, type DenominatorPoint, type NumeratorPoint } from '../reading/series'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, rivalKey } from '../rivals'
import type { Subject } from '../subjects/types'
import {
  buildCategory,
  buildRivals,
  buildSubjects,
  candidateLine,
  daysInto,
  fillingLine,
  firstScoringMonth,
  headline,
  medianOf,
  atThisPointWindow,
  firstHeardThisMonth,
  isMissingAnomalyFlags,
  monthlyLineLabel,
  readingsCounter,
  moveLine,
  MOVES_EMPTY,
  recordWindow,
  splitMovers,
  subjectsNote,
  type Mover,
  type StoredKindRow,
  type StoredStatsRow,
  type SubjectRow,
} from './overview'
import type { Verdict } from '../reading/verdicts'
import { proseFigures } from '../prose/figures'
import { FIGURE_KEY_RE } from '../prose/scrub'
import { substituteFigures } from '../reports/cover'

// The Overview's pure half (Phase 1 WP11). Everything here is shape and words:
// the loader's I/O is exercised against production read-only and the blocks are
// exercised by the render tier; these are the rules that decide what a reader
// is told when a migration, a month or a subject is not there.

const moved = (id: string, label: string, change: number, k = 40, n = 300): Verdict => ({
  objectKind: 'theme',
  objectId: id,
  objectLabel: label,
  audience: INDUSTRY_AUDIENCE,
  window: { kind: 'month', from: '2026-09-01', to: '2026-10-01' },
  value: { k, n },
  baseline: { k: k - 10, n },
  changePts: change,
  bandPts: 3,
  state: 'moved',
  flags: [],
})

describe('daysInto', () => {
  it('counts the day of the month at the reading', () => {
    expect(daysInto('2026-09-01', '2026-09-15T08:00:00.000Z')).toBe(15)
  })
  it('is null once the month is behind us', () => {
    expect(daysInto('2026-08-01', '2026-09-15T08:00:00.000Z')).toBeNull()
  })
  it('is zero before the month begins', () => {
    expect(daysInto('2026-10-01', '2026-09-15T08:00:00.000Z')).toBe(0)
  })
})

describe('recordWindow', () => {
  it('is the month, on every horizon — the only window the stored rows answer exactly', () => {
    expect(recordWindow('2026-09-01', '2026-09-15T08:00:00.000Z')).toEqual({
      kind: 'month', from: '2026-09-01', to: '2026-09-15',
    })
  })
  it('stops at the last day of the month rather than running past it', () => {
    expect(recordWindow('2026-08-01', '2026-09-15T08:00:00.000Z').to).toBe('2026-08-31')
  })
})

describe('atThisPointWindow', () => {
  it('puts the same number of COMPLETE days on both sides', () => {
    // 15 Sep is fourteen whole days and part of a fifteenth; [1 Aug, 15 Aug)
    // is fourteen whole days. The old window ran to 16 Aug and flattered last
    // month by up to a day's traffic.
    expect(atThisPointWindow('2026-09-01', '2026-09-15T08:00:00.000Z')).toEqual({
      from: '2026-08-01', to: '2026-08-15T00:00:00.000Z',
    })
  })
  it('has no comparison to offer on the first of the month', () => {
    expect(atThisPointWindow('2026-09-01', '2026-09-01T08:00:00.000Z')).toBeNull()
  })
  it('is null once the month is complete — a finished month is not still filling', () => {
    expect(atThisPointWindow('2026-08-01', '2026-09-15T08:00:00.000Z')).toBeNull()
  })
})

describe('medianOf', () => {
  it('ignores the months with no row rather than reading them as zero', () => {
    expect(medianOf([100, null, 300, undefined])).toBe(200)
  })
  it('is null when nothing has a row', () => {
    expect(medianOf([null, undefined])).toBeNull()
  })
})

describe('fillingLine', () => {
  const base = {
    month: '2026-09-01',
    status: 'filling' as const,
    daysIn: 18,
    updates: 3,
    videos: 271,
    expected: 469,
    atLastMonth: 244,
    atLastMonthKnown: true,
    thin: false,
  }

  it('prints the month so far against the same point last month', () => {
    expect(fillingLine(base)).toBe(
      'September, 18 days in · 3 updates · 271 videos · trailing median 469 · last month at this point: 244',
    )
  })

  it('says the comparison is not recorded rather than printing a zero', () => {
    const line = fillingLine({ ...base, atLastMonth: null, atLastMonthKnown: false })
    expect(line).toContain('last month at this point: not recorded yet')
    expect(line).not.toContain(': 0')
  })

  it('says nothing about last month once the month is complete', () => {
    const line = fillingLine({ ...base, status: 'frozen', daysIn: null })
    expect(line).toContain('September, complete')
    expect(line).not.toContain('last month at this point')
  })

  it('names a thin month and says the changes are suppressed', () => {
    expect(fillingLine({ ...base, thin: true })).toContain('thin month — every change below is suppressed')
  })

  it('carries no direction word — the badge carries the movement', () => {
    expect(fillingLine(base)).not.toMatch(/\b(growing|fading|rising|falling|flat|steady)\b/i)
  })
})

describe('isMissingAnomalyFlags', () => {
  it('knows M7 from every other way a read can fail', () => {
    expect(isMissingAnomalyFlags({ code: 'PGRST205', message: "Could not find the table 'public.anomaly_flags' in the schema cache" })).toBe(true)
    expect(isMissingAnomalyFlags({ code: '42P01', message: 'relation "anomaly_flags" does not exist' })).toBe(true)
    // An RLS refusal, a network error and a renamed column are news, not M7.
    expect(isMissingAnomalyFlags({ code: '42501', message: 'permission denied for table anomaly_flags' })).toBe(false)
    expect(isMissingAnomalyFlags(new Error('fetch failed'))).toBe(false)
    expect(isMissingAnomalyFlags(null)).toBe(false)
  })
})

describe('readingsCounter', () => {
  it('is the design\u2019s one counter, with what the quarter view still needs', () => {
    expect(readingsCounter(3)).toBe('your 3rd monthly reading · the quarter view needs 6')
    expect(readingsCounter(1)).toBe('your 1st monthly reading · the quarter view needs 6')
    expect(readingsCounter(2)).toBe('your 2nd monthly reading · the quarter view needs 6')
  })
  it('drops the second clause once the quarter unlocks', () => {
    expect(readingsCounter(6)).toBe('your 6th monthly reading')
    expect(readingsCounter(11)).toBe('your 11th monthly reading')
    expect(readingsCounter(21)).toBe('your 21st monthly reading')
  })
  it('says so rather than counting a zeroth reading', () => {
    expect(readingsCounter(0)).toBe('no monthly reading yet · the quarter view needs 6')
  })
})

describe('headline', () => {
  it('names the single largest banded change and leaves its figures as tokens', () => {
    const h = headline({ verdicts: [moved('t1', 'Durability', 5.4), moved('t2', 'Price', -2.1)] })
    expect(h.lead?.objectLabel).toBe('Durability')
    expect(h.body).toContain('Durability came up in [[o_t1_share]]')
    expect(Object.keys(h.figures).sort()).toEqual(['o_t1_of', 'o_t1_share', 'o_t1_videos'])
    // Code's sentence, not the model's: no digit is typed into it.
    expect(h.body.replace(/\[\[[a-z0-9_]+\]\]/g, '')).not.toMatch(/\d/)
  })

  it('takes the largest by magnitude, in either direction', () => {
    const h = headline({ verdicts: [moved('t1', 'Durability', 2.0), moved('t2', 'Price', -9.3)] })
    expect(h.lead?.objectId).toBe('t2')
  })

  it('keys a figure so it can actually be substituted, whatever the object id is', () => {
    // Össur's largest mover is `2418f4d7-…`: a key taken straight off that id
    // starts with a digit, FIGURE_KEY_RE never matches it, and the raw
    // `[[…]]` token reaches the reader. Found by rendering against production.
    const h = headline({ verdicts: [moved('2418f4d7-54a2-497e-8433-6cd89bc2322b', 'Admiration', 5.1)] })
    for (const key of Object.keys(h.figures)) expect(key).toMatch(/^[a-z][a-z0-9_]*$/)
    expect(substituteFigures(h.body, proseFigures(h.figures)).some((p) => 'figure' in p)).toBe(true)
    expect(h.body.match(FIGURE_KEY_RE)?.length).toBe(3)
  })

  it('names the audience the lead verdict is a proportion of, never a hard-coded one', () => {
    // The sentence mixes subject verdicts on YOUR audience with theme verdicts
    // on the category's and picks by magnitude. A hard-coded label prints your
    // own video count as the category's on the page's headline claim.
    const yours: Verdict = { ...moved('s1', 'Durability', 9.9, 26, 84), objectKind: 'subject', audience: CLIENT_AUDIENCE }
    expect(headline({ verdicts: [yours, moved('t1', 'Price', 2.0)] }).body).toContain('of your own videos this month')
    expect(headline({ verdicts: [moved('t1', 'Price', 2.0)] }).body).toContain('of the category’s videos this month')
    const rival: Verdict = { ...moved('t9', 'Smell', 8.1), audience: rivalKey('Freitag') }
    expect(headline({ verdicts: [rival] }).body).toContain('of Freitag’s videos this month')
  })

  it('labels the denominator with a noun, not with the sentence’s possessive', () => {
    const labels = Object.values(headline({ verdicts: [moved('t1', 'Price', 2.0)] }).figures).map((f) => f.label)
    expect(labels).toContain('videos read for the category')
  })

  it('reads nothing that did not clear its band', () => {
    const unbanded: Verdict = { ...moved('t1', 'Durability', 5.4), state: 'no_clear_change' }
    const h = headline({ verdicts: [unbanded] })
    expect(h.lead).toBeNull()
    expect(h.body).toBe('Nothing moved clearly this month. Here is where you stand.')
    expect(h.figures).toEqual({})
  })
})

describe('firstHeardThisMonth', () => {
  const readable = ['2026-09-01']
  it('is silent when the drawn axis starts after the record does', () => {
    // The default horizon draws two months. A theme absent in August and
    // present in September is not thereby new: on production 7 Össur themes
    // and 19 Sealand ones in exactly that shape have a reading further back.
    expect(firstHeardThisMonth({ axisFrom: '2026-08-01', recordFrom: '2026-01-01', readableMonths: readable, month: '2026-09-01' })).toBe(false)
  })
  it('is said when the axis reaches the record and the absence is the theme\u2019s own', () => {
    expect(firstHeardThisMonth({ axisFrom: '2026-01-01', recordFrom: '2026-01-01', readableMonths: readable, month: '2026-09-01' })).toBe(true)
  })
  it('is silent when the theme was read in an earlier month', () => {
    expect(firstHeardThisMonth({ axisFrom: '2026-01-01', recordFrom: '2026-01-01', readableMonths: ['2026-07-01', '2026-09-01'], month: '2026-09-01' })).toBe(false)
  })
  it('is silent when nothing is readable at all', () => {
    expect(firstHeardThisMonth({ axisFrom: '2026-01-01', recordFrom: null, readableMonths: readable, month: '2026-09-01' })).toBe(false)
    expect(firstHeardThisMonth({ axisFrom: '2026-01-01', recordFrom: '2026-01-01', readableMonths: [], month: '2026-09-01' })).toBe(false)
  })
})

describe('splitMovers', () => {
  const mover = (id: string, change: number, state: Verdict['state'] = 'moved'): Mover => ({
    id,
    label: id,
    k: 10,
    n: 100,
    pct: 10,
    verdict: { ...moved(id, id, change), state },
    direction: null,
    isNew: false,
  })

  it('takes three up and three down, largest first', () => {
    const { growing, fading } = splitMovers([
      mover('a', 1), mover('b', 5), mover('c', 3), mover('d', 7),
      mover('e', -2), mover('f', -8), mover('g', -1), mover('h', -4),
    ])
    expect(growing.map((m) => m.id)).toEqual(['d', 'b', 'c'])
    expect(fading.map((m) => m.id)).toEqual(['f', 'h', 'e'])
  })

  it('drops anything that did not clear its band', () => {
    const { growing, fading } = splitMovers([mover('a', 9, 'no_clear_change'), mover('b', -9, 'too_little_data')])
    expect(growing).toEqual([])
    expect(fading).toEqual([])
  })
})

describe('moves', () => {
  it('scores a move from the month after the one it was declared in', () => {
    expect(firstScoringMonth('2026-09-14')).toBe('2026-10-01')
    expect(firstScoringMonth('2026-12-31T10:00:00.000Z')).toBe('2027-01-01')
  })

  it('writes the one line the design asks for', () => {
    expect(moveLine({ title: 'Advanced technology', declared_at: '2026-09-14' })).toBe(
      'Advanced technology · tracked 14 Sep · first scoring lands with the October reading.',
    )
  })

  it('has one sentence for nothing dated', () => {
    expect(MOVES_EMPTY).toContain('Press Track this on a subject or a theme')
  })
})

describe('monthlyLineLabel', () => {
  const months = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']
  it('lets a line be drawn once three months read', () => {
    expect(monthlyLineLabel([null, 18, 19, 20], months)).toBeNull()
  })
  it('names the two months instead of drawing a slope through them', () => {
    // Sparkline normalises to the values it is handed, so 19.0 → 19.2 draws the
    // same climb as 5 → 40. The mock prints this label instead.
    expect(monthlyLineLabel([null, null, 19, 19.2], months)).toBe('Aug \u2192 Sep only')
  })
  it('names the one month it has', () => {
    expect(monthlyLineLabel([null, null, null, 19.2], months)).toBe('Sep only')
  })
  it('says so when no month reads at all', () => {
    expect(monthlyLineLabel([null, null, null, null], months)).toBe('no month reads')
  })
})

describe('subjectsNote', () => {
  const sideless = { k: null, n: null, pct: null, verdict: null, observed: false }
  const row = (yourN: number | null, verdict: Verdict | null): SubjectRow => ({
    id: 's1',
    label: 'Durability',
    you: { k: 5, n: yourN, pct: null, verdict, observed: yourN != null },
    rival: null,
    category: { ...sideless },
    direction: null,
    spark: [],
    sparkMonths: [],
    categoryAtLastMonth: null,
    href: '#',
  })

  it('names the video count your own side reads on when it cannot be compared', () => {
    expect(subjectsNote([row(84, null)])).toBe(
      'Your side reads "too few to compare" on 84 videos — the category column carries the month.',
    )
  })

  it('says nothing when a side did clear its band', () => {
    expect(subjectsNote([row(840, moved('s1', 'Durability', 4))])).toBeNull()
  })

  it('says nothing at all with no rows', () => {
    expect(subjectsNote([])).toBeNull()
  })
})

describe('candidateLine', () => {
  it('is not a blank form', () => {
    expect(candidateLine([{ name: 'Durability', origin: 'own_claims', because: 'x' }])).toContain(
      'We have proposed 1 subject',
    )
  })
  it('says so plainly when nothing has been proposed either', () => {
    expect(candidateLine([])).toContain('No subjects are named yet')
  })
})

// ---- the three block builders --------------------------------------------------

const subject = (id: string, name: string, status: Subject['status'] = 'active'): Subject =>
  ({
    id,
    client_id: 'c',
    name,
    description: null,
    origin: 'client',
    source_ref: null,
    named_at: '2026-08-19',
    status,
    superseded_by: null,
    embedded_at: null,
    embed_input_version: null,
    calibrated_at: null,
    calibration_precision: null,
    calibration_n: null,
    calibration_judge_version: null,
  }) as Subject

const AXIS = ['2026-07-01', '2026-08-01', '2026-09-01']

describe('buildSubjects', () => {
  const perAudience = new Map<string, number>([
    ['2026-08-01|industry-other', 1200],
    ['2026-09-01|industry-other', 1388],
    ['2026-08-01|client', 80],
    ['2026-09-01|client', 84],
  ])

  it('says the reading is not recorded when M4 is not applied', () => {
    const b = buildSubjects({
      subjects: null, months: null, denominators: new Map(), perAudience,
      axis: AXIS, month: '2026-09-01', prevMonth: '2026-08-01', leadRival: 'Freitag', atLastMonth: null, thin: false,
    })
    expect(b.state).toBe('not_recorded')
    expect(b.rows).toEqual([])
  })

  it('reads an absent row as a zero only where the month was read at all', () => {
    const b = buildSubjects({
      subjects: [subject('s1', 'Durability'), subject('s2', 'Price')],
      // September was read (s1 has a row); August was not read for anybody.
      months: [{ month: '2026-09-01', audience: INDUSTRY_AUDIENCE, subject_id: 's1', videos: 305, comments: 900 }],
      denominators: new Map(), perAudience,
      axis: AXIS, month: '2026-09-01', prevMonth: '2026-08-01', leadRival: null, atLastMonth: null, thin: false,
    })
    const price = b.rows.find((r) => r.id === 's2') as SubjectRow
    // s2 was not raised in a month that WAS read: a real zero, on both readers.
    expect(price.category.k).toBe(0)
    expect(price.category.observed).toBe(true)
    expect(price.spark[price.spark.length - 1]).toBe(0)
    // August was never computed: not a zero, and not "0.0% 0 of 1,200".
    expect(price.spark[price.spark.length - 2]).toBeNull()
  })

  it('carries "at this point last month" on the category side only', () => {
    const b = buildSubjects({
      subjects: [subject('s1', 'Durability')],
      months: [{ month: '2026-09-01', audience: INDUSTRY_AUDIENCE, subject_id: 's1', videos: 305, comments: 900 }],
      denominators: new Map(), perAudience,
      axis: AXIS, month: '2026-09-01', prevMonth: '2026-08-01', leadRival: 'Freitag',
      atLastMonth: {
        bySubject: new Map([[`${INDUSTRY_AUDIENCE}|s1`, 264], [`${CLIENT_AUDIENCE}|s1`, 12]]),
        perAudience: new Map([[INDUSTRY_AUDIENCE, 1290], [CLIENT_AUDIENCE, 70]]),
      },
      thin: false,
    })
    expect(b.rows[0].categoryAtLastMonth).toEqual({ k: 264, n: 1290, pct: 20.5 })
  })

  it('says nothing about last month when the window could not be read', () => {
    const b = buildSubjects({
      subjects: [subject('s1', 'Durability')], months: [], denominators: new Map(), perAudience,
      axis: AXIS, month: '2026-09-01', prevMonth: '2026-08-01', leadRival: 'Freitag', atLastMonth: null, thin: false,
    })
    expect(b.rows[0].categoryAtLastMonth).toBeNull()
  })

  it('offers the proposer’s candidates rather than a blank form', () => {
    const b = buildSubjects({
      subjects: [subject('s1', 'Durability', 'proposed')], months: [], denominators: new Map(), perAudience,
      axis: AXIS, month: '2026-09-01', prevMonth: '2026-08-01', leadRival: null, atLastMonth: null, thin: false,
    })
    expect(b.state).toBe('candidates')
    expect(b.candidates[0].name).toBe('Durability')
    expect(b.note).toContain('We have proposed')
  })

  it('reads a confirmed subject on three sides and bands the category', () => {
    const months = [
      { month: '2026-08-01', audience: INDUSTRY_AUDIENCE, subject_id: 's1', videos: 240, comments: 0 },
      { month: '2026-09-01', audience: INDUSTRY_AUDIENCE, subject_id: 's1', videos: 305, comments: 0 },
      { month: '2026-09-01', audience: CLIENT_AUDIENCE, subject_id: 's1', videos: 26, comments: 0 },
      { month: '2026-09-01', audience: rivalKey('Freitag'), subject_id: 's1', videos: 62, comments: 0 },
    ]
    const withRival = new Map(perAudience)
    withRival.set(`2026-09-01|${rivalKey('Freitag')}`, 142)
    const b = buildSubjects({
      subjects: [subject('s1', 'Durability')], months, denominators: new Map(), perAudience: withRival,
      axis: AXIS, month: '2026-09-01', prevMonth: '2026-08-01', leadRival: 'Freitag', atLastMonth: null, thin: false,
    })
    expect(b.state).toBe('ready')
    expect(b.rows[0].category.pct).toBe(22)
    expect(b.rows[0].you).toMatchObject({ k: 26, n: 84 })
    expect(b.rows[0].rival).toMatchObject({ k: 62, n: 142 })
    // Your own side is 84 videos — under the 100-video floor, so no comparison.
    expect(b.rows[0].you.verdict?.state).toBe('too_little_data')
    expect(b.rows[0].category.verdict?.state === 'moved' || b.rows[0].category.verdict?.state === 'no_clear_change').toBe(true)
  })

  it('draws no comparison at all in a thin month', () => {
    const b = buildSubjects({
      subjects: [subject('s1', 'Durability')],
      months: [{ month: '2026-09-01', audience: INDUSTRY_AUDIENCE, subject_id: 's1', videos: 305, comments: 0 }],
      denominators: new Map(), perAudience,
      axis: AXIS, month: '2026-09-01', prevMonth: '2026-08-01', leadRival: null, atLastMonth: null, thin: true,
    })
    expect(b.rows[0].category.verdict).toBeNull()
    expect(b.rows[0].direction).toBeNull()
  })
})

const denominator = (month: string, audience: string, videos: number): DenominatorPoint => ({
  month,
  audience,
  videos,
  comments: videos * 4,
  status: month === '2026-09-01' ? 'filling' : 'frozen',
  origin: 'live',
  read_at: '2026-09-15T00:00:00.000Z',
  run_id: 'r1',
  frozen_at: null,
  clustering_key: 'k1',
})

const numerator = (month: string, audience: string, videos: number): NumeratorPoint => ({
  month, audience, videos, comments: videos * 3, run_id: 'r1', clustering_key: 'k1',
})

describe('buildCategory', () => {
  const perAudience = new Map<string, number>([
    ['2026-07-01|industry-other', 1100],
    ['2026-08-01|industry-other', 1200],
    ['2026-09-01|industry-other', 1388],
  ])
  const series = [
    buildSeries({
      axis: AXIS,
      audience: INDUSTRY_AUDIENCE,
      objectId: 't1',
      objectLabel: 'Will it survive a wet commute',
      denominators: AXIS.map((m) => denominator(m, INDUSTRY_AUDIENCE, perAudience.get(`${m}|industry-other`) as number)),
      readings: [numerator('2026-07-01', INDUSTRY_AUDIENCE, 60), numerator('2026-08-01', INDUSTRY_AUDIENCE, 80), numerator('2026-09-01', INDUSTRY_AUDIENCE, 130)],
      changeLogFrom: '2026-01-01',
    }),
  ]

  it('says what is not recorded rather than printing zeros, when M5 is absent', () => {
    const c = buildCategory({
      audience: INDUSTRY_AUDIENCE, axis: AXIS, month: '2026-09-01', prevMonth: '2026-08-01',
      series, recordFrom: AXIS[0], kindRows: null, statsRows: null, panel: null, perAudience, thin: false,
    })
    expect(c.kinds).toEqual([])
    expect(c.kindsNote).toContain('not recorded month by month')
    expect(c.mood).toBeNull()
    expect(c.moodNote).toContain('not recorded month by month')
    expect(c.attention).toBeNull()
    expect(c.attentionNote).toContain('not recorded')
  })

  it('reads the movers off the month series and earns a direction word', () => {
    const c = buildCategory({
      audience: INDUSTRY_AUDIENCE, axis: AXIS, month: '2026-09-01', prevMonth: '2026-08-01',
      series, recordFrom: AXIS[0], kindRows: null, statsRows: null, panel: null, perAudience, thin: false,
    })
    expect(c.growing.map((m) => m.label)).toEqual(['Will it survive a wet commute'])
    expect(c.growing[0].direction).toBe('growing')
    expect(c.denominator).toBe(1388)
  })

  it('reads the kinds with the Reddit clause when the rows are there', () => {
    const kindRows: StoredKindRow[] = [
      { month: '2026-08-01', audience: INDUSTRY_AUDIENCE, kind: 'question', videos: 400, comments: 0, platform_mix: { reddit: 100, tiktok: 300 }, run_id: 'r1' },
      { month: '2026-09-01', audience: INDUSTRY_AUDIENCE, kind: 'question', videos: 470, comments: 0, platform_mix: { reddit: 180, tiktok: 290 }, run_id: 'r1' },
      { month: '2026-09-01', audience: INDUSTRY_AUDIENCE, kind: 'objection', videos: 120, comments: 0, platform_mix: { reddit: 20 }, run_id: 'r1' },
    ]
    const c = buildCategory({
      audience: INDUSTRY_AUDIENCE, axis: AXIS, month: '2026-09-01', prevMonth: '2026-08-01',
      series, recordFrom: AXIS[0], kindRows, statsRows: null, panel: null, perAudience, thin: false,
    })
    expect(c.kinds.map((k) => k.kind)).toContain('question')
    expect(c.kinds.find((k) => k.kind === 'question')?.pct).toBe(33.9)
    expect(c.reddit?.pct).toBe(33.9)
    expect(c.kindVerdicts.question).not.toBeNull()
  })

  it('suppresses every comparison in a thin month and says so', () => {
    const c = buildCategory({
      audience: INDUSTRY_AUDIENCE, axis: AXIS, month: '2026-09-01', prevMonth: '2026-08-01',
      series, recordFrom: AXIS[0], kindRows: null, statsRows: null, panel: null, perAudience, thin: true,
    })
    expect(c.growing).toEqual([])
    expect(c.fading).toEqual([])
    expect(c.moversNote).toBe('Too little conversation this month to say what moved.')
  })

  it('gives the attention line a calendar axis, so a missing month stays missing', () => {
    // calendarGeometry positions by INDEX into the axis it is handed, so
    // handing it the months that carried a panel reading draws July and
    // September adjacent — the gap closes and every point after it is
    // misdated. Sealand, which has no panel until October, is the tenant that
    // meets this first.
    const panelRow = (month: string, comments: number | null): StoredStatsRow => ({
      month, audience: INDUSTRY_AUDIENCE, judged: 0, positive: 0, negative: 0, neutral: 0, mixed: 0,
      judged_framing: null,
      panel_videos: comments == null ? null : 40,
      attention_comments: comments,
      panel_platform_mix: null,
      panel_id: 'p1',
    })
    const c = buildCategory({
      audience: INDUSTRY_AUDIENCE, axis: AXIS, month: '2026-09-01', prevMonth: '2026-08-01',
      series, recordFrom: AXIS[0],
      kindRows: null,
      statsRows: [panelRow('2026-07-01', 50300), panelRow('2026-08-01', null), panelRow('2026-09-01', 41200)],
      panel: null, perAudience, thin: false,
    })
    expect(c.attention?.months.map((m) => m.month)).toEqual(['2026-07-01', '2026-09-01'])
    expect(c.attention?.axis).toEqual(AXIS)
  })

  it('reads mood off the stored counts, with the framing footnote', () => {
    const statsRows: StoredStatsRow[] = [
      { month: '2026-08-01', audience: INDUSTRY_AUDIENCE, judged: 1000, positive: 610, negative: 160, neutral: 210, mixed: 20, judged_framing: 100, panel_videos: null, attention_comments: null, panel_platform_mix: null, panel_id: null },
      { month: '2026-09-01', audience: INDUSTRY_AUDIENCE, judged: 1112, positive: 678, negative: 200, neutral: 214, mixed: 20, judged_framing: 120, panel_videos: null, attention_comments: null, panel_platform_mix: null, panel_id: null },
    ]
    const c = buildCategory({
      audience: INDUSTRY_AUDIENCE, axis: AXIS, month: '2026-09-01', prevMonth: '2026-08-01',
      series, recordFrom: AXIS[0], kindRows: null, statsRows, panel: null, perAudience, thin: false,
    })
    expect(c.mood?.judged).toBe(1112)
    expect(c.mood?.shares.find((s) => s.mood === 'negative')?.pct).toBe(18)
    expect(c.mood?.framingPct).toBeGreaterThan(0)
    // No panel: attention is null and says why, and is NOT read as zero.
    expect(c.attention).toBeNull()
    expect(c.attentionNote).toContain('No panel has been frozen')
  })
})

describe('buildRivals', () => {
  const series = [
    buildSeries({
      axis: AXIS,
      audience: rivalKey('Freitag'),
      objectId: 't1',
      objectLabel: 'Does the tarp smell',
      denominators: AXIS.map((m) => denominator(m, rivalKey('Freitag'), 142)),
      readings: [numerator('2026-09-01', rivalKey('Freitag'), 41)],
      changeLogFrom: '2026-01-01',
    }),
  ]

  it('prints what was raised under a rival’s content when the panel is not recorded', () => {
    const b = buildRivals({
      rivals: [{ name: 'Freitag', retiredAt: null }],
      statsRows: null, month: '2026-09-01', prevMonth: '2026-08-01', brand: 'Sealand', series, dualMention: 41,
    })
    expect(b.standingsNote).toContain('not recorded month by month')
    expect(b.rows[0].observed).toBe(false)
    expect(b.rows[0].attention).toBeNull()
    expect(b.rows[0].raisedMost).toMatchObject({ label: 'Does the tarp smell', k: 41, n: 142 })
    expect(b.caveat).toContain('counts in your audience only')
    expect(b.dualMention).toBe(41)
  })

  it('bands the two shares when the panel rows are there', () => {
    const statsRows: StoredStatsRow[] = [
      { month: '2026-08-01', audience: rivalKey('Freitag'), judged: 0, positive: 0, negative: 0, neutral: 0, mixed: 0, judged_framing: 0, panel_videos: 120, attention_comments: 4000, panel_platform_mix: {}, panel_id: 'p1' },
      { month: '2026-08-01', audience: INDUSTRY_AUDIENCE, judged: 0, positive: 0, negative: 0, neutral: 0, mixed: 0, judged_framing: 0, panel_videos: 880, attention_comments: 46000, panel_platform_mix: {}, panel_id: 'p1' },
      { month: '2026-09-01', audience: rivalKey('Freitag'), judged: 0, positive: 0, negative: 0, neutral: 0, mixed: 0, judged_framing: 0, panel_videos: 150, attention_comments: 6200, panel_platform_mix: {}, panel_id: 'p1' },
      { month: '2026-09-01', audience: INDUSTRY_AUDIENCE, judged: 0, positive: 0, negative: 0, neutral: 0, mixed: 0, judged_framing: 0, panel_videos: 850, attention_comments: 35000, panel_platform_mix: {}, panel_id: 'p1' },
    ]
    const b = buildRivals({
      rivals: [{ name: 'Freitag', retiredAt: null }],
      statsRows, month: '2026-09-01', prevMonth: '2026-08-01', brand: 'Sealand', series, dualMention: null,
    })
    const freitag = b.rows.find((r) => r.label === 'Freitag')
    expect(freitag?.observed).toBe(true)
    expect(freitag?.content?.pct).toBe(15)
    expect(freitag?.attentionVerdict).not.toBeNull()
    expect(b.standingsNote).toBeNull()
  })

  it('keeps a retired rival’s row and says when it was retired', () => {
    const b = buildRivals({
      rivals: [{ name: 'Poler', retiredAt: '2026-09-09' }],
      statsRows: null, month: '2026-09-01', prevMonth: null, brand: 'Sealand', series, dualMention: null,
    })
    expect(b.rows[0].retiredAt).toBe('2026-09-09')
  })
})
