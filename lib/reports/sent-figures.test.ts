import { describe, expect, it } from 'vitest'
import type { Verdict } from '../reading/verdicts'
import {
  denominatorOf,
  isMissingSentFigures,
  monthDate,
  newestByObject,
  objectKey,
  sentFigureRows,
  sentMonthOf,
  sentReadingOf,
  type StoredSentFigure,
} from './sent-figures'

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  objectKind: 'theme',
  objectId: 't1',
  objectLabel: 'Durability',
  audience: 'industry',
  window: { from: '2026-09-01', to: '2026-10-01', kind: 'month' },
  value: { k: 305, n: 1388 },
  changePts: 3,
  bandPts: 1.8,
  state: 'moved',
  direction: 'growing',
  flags: [],
  ...over,
})

const stored = (over: Partial<StoredSentFigure> = {}): StoredSentFigure => ({
  snapshotId: 's1',
  month: '2026-09',
  audience: 'industry',
  objectKind: 'theme',
  objectId: 't1',
  label: 'Durability',
  value: 19,
  unit: 'pct',
  measure: 'videos',
  k: 264,
  n: 1388,
  denominator: 'the category’s videos this month',
  changePts: null,
  bandPts: null,
  verdict: 'moved',
  direction: null,
  monthStatus: 'filling',
  artefact: 'monthly',
  readingAt: '2026-10-01T06:00:00.000Z',
  sentAt: '2026-10-01T06:00:10.000Z',
  ...over,
})

const base = { month: '2026-09', monthStatus: 'filling' as const, artefact: 'monthly' }

describe('what a delivered artefact writes down', () => {
  it('records a verdict with both sides, its band, its state and its direction', () => {
    const [row] = sentFigureRows({ ...base, verdicts: [verdict()], figures: {} })
    expect(row).toMatchObject({
      month: '2026-09',
      audience: 'industry',
      objectKind: 'theme',
      objectId: 't1',
      label: 'Durability',
      value: 22,
      unit: 'pct',
      k: 305,
      n: 1388,
      denominator: 'the category’s videos this month',
      changePts: 3,
      bandPts: 1.8,
      verdict: 'moved',
      direction: 'growing',
      monthStatus: 'filling',
      artefact: 'monthly',
    })
  })

  it('keeps a refusal, because the level it printed is still a statement', () => {
    const [row] = sentFigureRows({
      ...base,
      verdicts: [verdict({ state: 'refused', changePts: null, bandPts: null, direction: null })],
      figures: {},
    })
    expect(row.verdict).toBe('refused')
    expect(row.value).toBe(22)
    expect(row.changePts).toBeNull()
  })

  it('writes nothing about an audience nobody read', () => {
    // n = 0 is not a reading of 0%: it is an audience with no videos in it.
    expect(sentFigureRows({ ...base, verdicts: [verdict({ value: { k: 0, n: 0 } })], figures: {} })).toEqual([])
  })

  it('files an artefact-level token under its own kind, with no sides', () => {
    const rows = sentFigureRows({
      ...base,
      verdicts: [],
      figures: { category_videos: { value: 1388, unit: 'videos', label: 'videos read for the category' } },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      objectKind: 'figure',
      objectId: 'category_videos',
      audience: 'artefact',
      value: 1388,
      unit: 'videos',
      k: null,
      n: null,
      verdict: null,
    })
  })

  it('does not write one reading twice when two blocks name it', () => {
    const rows = sentFigureRows({ ...base, verdicts: [verdict(), verdict()], figures: {} })
    expect(rows).toHaveLength(1)
  })

  // Össur's September would have written eleven rows for two themes: the
  // theme's own verdict, MR1's t1_share and MR3's moved_…_share are one
  // reading of the same share, and two tokens carried the identical words
  // "videos that raised …" over the same count. The rule that was meant to
  // stop that keyed both halves through objectKey, where a token's kind is
  // 'figure' and a verdict's never is, so it could not fire once.
  it('drops a token that a recorded verdict already states about the same object', () => {
    const rows = sentFigureRows({
      ...base,
      verdicts: [verdict()],
      figures: {
        t1_share: { value: 22, unit: 'pct', label: "Durability's share of the month" },
        moved_t1_share: { value: 22, unit: 'pct', label: 'Durability, share of the month' },
        t1_videos: { value: 305, unit: 'videos', label: 'videos that raised Durability' },
        moved_t1_videos: { value: 305, unit: 'videos', label: 'videos that raised Durability' },
      },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].objectKind).toBe('theme')
  })

  it('keeps a token that names the object but states a different number', () => {
    const rows = sentFigureRows({
      ...base,
      verdicts: [verdict()],
      figures: { t1_last: { value: 14.2, unit: 'pct', label: "Durability's share last month" } },
    })
    expect(rows.map((r) => r.objectId)).toEqual(['t1', 't1_last'])
  })

  // Labels are a model's words, and two of them being prefixes of each other is
  // ordinary. A bare containment test let "Zip" swallow a statement about
  // "Zips failing after a year" on a coincidence of value — into a record that
  // can never be corrected.
  it('keeps a token whose object merely starts with a recorded one’s name', () => {
    const rows = sentFigureRows({
      ...base,
      verdicts: [verdict({ objectLabel: 'Zip' })],
      figures: {
        t2_share: { value: 22, unit: 'pct', label: "Zips failing after a year's share of the month" },
      },
    })
    expect(rows.map((r) => r.objectId)).toEqual(['t1', 't2_share'])
  })

  it('keeps a token that reads the same number about something else', () => {
    // A coincidence of value is not a reading of the same thing, and the
    // month's own denominator names no object at all.
    const rows = sentFigureRows({
      ...base,
      verdicts: [verdict()],
      figures: { own_share: { value: 22, unit: 'pct', label: 'share of your own videos this month' } },
    })
    expect(rows.map((r) => r.objectId)).toEqual(['t1', 'own_share'])
  })

  it('writes two tokens that print the same words about the same number once', () => {
    const rows = sentFigureRows({
      ...base,
      verdicts: [],
      figures: {
        month_videos: { value: 449, unit: 'videos', label: 'videos read into this month' },
        bar_videos: { value: 449, unit: 'videos', label: 'videos read into this month' },
      },
    })
    expect(rows.map((r) => r.objectId)).toEqual(['month_videos'])
  })

  it('keeps one object per audience, because three audiences read it differently', () => {
    const rows = sentFigureRows({
      ...base,
      verdicts: [verdict(), verdict({ audience: 'client', value: { k: 26, n: 84 } })],
      figures: {},
    })
    expect(rows.map((r) => r.audience)).toEqual(['industry', 'client'])
    expect(rows.map((r) => r.value)).toEqual([22, 31])
  })

  it('refuses a verdict about something sent_figures has no kind for', () => {
    expect(sentFigureRows({ ...base, verdicts: [verdict({ objectKind: 'mood' })], figures: {} })).toEqual([])
  })

  it('carries a frozen month through as frozen', () => {
    const [row] = sentFigureRows({ ...base, monthStatus: 'frozen', verdicts: [verdict()], figures: {} })
    expect(row.monthStatus).toBe('frozen')
  })
})

describe('one object read on two populations', () => {
  // The rivals block returns [attentionVerdict, contentVerdict] for every row:
  // one objectId, one audience, two measures. Keyed by the object alone they
  // are one row, and the survivor carries the other's denominator.
  const attention = verdict({
    objectKind: 'rival',
    objectId: 'competitor:Freitag',
    objectLabel: 'Freitag',
    audience: 'competitor:Freitag',
    value: { k: 6200, n: 41200 },
    countedOver: { measure: 'comments', population: 'the panel’s comments this month' },
  })
  const content = verdict({
    objectKind: 'rival',
    objectId: 'competitor:Freitag',
    objectLabel: 'Freitag',
    audience: 'competitor:Freitag',
    value: { k: 11, n: 77 },
    countedOver: { measure: 'videos', population: 'the panel’s videos this month' },
  })

  it('writes both readings, not one of them', () => {
    const rows = sentFigureRows({
      month: '2026-09',
      monthStatus: 'filling',
      artefact: 'monthly',
      verdicts: [attention, content],
      figures: {},
    })
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.measure).sort()).toEqual(['comments', 'videos'])
  })

  it('gives each of them the population it was actually read over', () => {
    const rows = sentFigureRows({
      month: '2026-09',
      monthStatus: 'filling',
      artefact: 'monthly',
      verdicts: [attention, content],
      figures: {},
    })
    const said = new Map(rows.map((r) => [r.measure, r]))
    expect(said.get('comments')!.denominator).toBe('the panel’s comments this month')
    expect(said.get('comments')!.n).toBe(41200)
    expect(said.get('videos')!.denominator).toBe('the panel’s videos this month')
    expect(said.get('videos')!.n).toBe(77)
  })

  it('still files one object read twice by two blocks as one row', () => {
    const rows = sentFigureRows({
      month: '2026-09',
      monthStatus: 'filling',
      artefact: 'monthly',
      verdicts: [attention, attention],
      figures: {},
    })
    expect(rows).toHaveLength(1)
  })

  it('keys the two apart, so a live surface asking for one cannot get the other', () => {
    expect(objectKey('competitor:Freitag', 'rival', 'competitor:Freitag', 'comments')).not.toBe(
      objectKey('competitor:Freitag', 'rival', 'competitor:Freitag', 'videos'),
    )
    // The default is the population every other verdict in the product is read
    // over, so a caller that names no measure asks the question it means.
    expect(objectKey('industry', 'theme', 't1')).toBe(objectKey('industry', 'theme', 't1', 'videos'))
  })
})

describe('the denominator is named, never assumed', () => {
  it('takes the verdict’s own population where it has one', () => {
    expect(
      denominatorOf({
        audience: 'competitor:Freitag',
        countedOver: { measure: 'comments', population: 'the panel’s comments this month' },
      }),
    ).toBe('the panel’s comments this month')
  })

  it('names each of the three audiences in the reader’s words', () => {
    expect(denominatorOf({ audience: 'client' })).toBe('your own videos this month')
    expect(denominatorOf({ audience: 'industry' })).toBe('the category’s videos this month')
    expect(denominatorOf({ audience: 'competitor:Freitag' })).toBe('Freitag’s videos this month')
  })

  it('names an audience it does not recognise rather than guessing', () => {
    expect(denominatorOf({ audience: 'panel' })).toBe('panel videos this month')
  })
})

describe('reading the record back', () => {
  it('takes the newest reading of an object, not the first', () => {
    const newest = newestByObject([
      stored({ readingAt: '2026-10-01T06:00:00.000Z', value: 19 }),
      stored({ readingAt: '2026-10-08T06:00:00.000Z', value: 21, artefact: 'weekly' }),
    ])
    expect(newest.size).toBe(1)
    expect([...newest.values()][0].value).toBe(21)
  })

  it('keeps one reading per audience', () => {
    const newest = newestByObject([stored(), stored({ audience: 'client', value: 31 })])
    expect(newest.size).toBe(2)
  })

  it('hands a live surface exactly what it needs to draw the line', () => {
    expect(sentReadingOf(stored())).toEqual({
      readingAt: '2026-10-01T06:00:00.000Z',
      value: 19,
      unit: 'pct',
      k: 264,
      n: 1388,
      monthStatus: 'filling',
    })
  })
})

describe('ordering two readings of one object', () => {
  // Two rows rendered with different offsets name the later and the earlier
  // instant and sort the wrong way round as text.
  it('is by instant, not by the text PostgREST happened to render', () => {
    const newest = newestByObject([
      stored({ readingAt: '2026-10-01T08:00:00+02:00', value: 19 }),
      stored({ readingAt: '2026-10-01T07:00:00+00:00', value: 22 }),
    ])
    expect([...newest.values()][0].value).toBe(22)
  })

  it('never lets a row nobody can date displace one that can be', () => {
    const newest = newestByObject([
      stored({ readingAt: '2026-10-01T06:00:00.000Z', value: 19 }),
      stored({ readingAt: 'Sun 13 Sep', value: 99 }),
    ])
    expect([...newest.values()][0].value).toBe(19)
  })

  it('names the newest artefact as the month’s lead by the same rule', () => {
    const month = sentMonthOf([
      stored({ readingAt: '2026-10-01T08:00:00+02:00', artefact: 'weekly' }),
      stored({ readingAt: '2026-10-01T07:00:00+00:00', artefact: 'monthly' }),
    ])
    expect(month?.artefact).toBe('monthly')
  })
})

describe('the month key', () => {
  it('stores a month as its first day', () => {
    expect(monthDate('2026-09')).toBe('2026-09-01')
  })

  it('leaves a date that is already a date alone', () => {
    expect(monthDate('2026-09-01')).toBe('2026-09-01')
  })
})

describe('M9 not applied here', () => {
  it('recognises the table being absent, by name', () => {
    expect(isMissingSentFigures({ code: 'PGRST205', message: "Could not find the table 'public.sent_figures' in the schema cache" })).toBe(true)
    expect(isMissingSentFigures({ code: '42P01', message: 'relation "sent_figures" does not exist' })).toBe(true)
  })

  it('does not read an unrelated outage as a missing migration', () => {
    expect(isMissingSentFigures({ code: '42P01', message: 'relation "month_denominators" does not exist' })).toBe(false)
    expect(isMissingSentFigures({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false)
    expect(isMissingSentFigures(null)).toBe(false)
  })
})
