import { describe, expect, it } from 'vitest'
import { thinUpdate } from '../reading/anomaly'
import { checkStateOf, headlineObject, humanTheme, RISING_NOW, SALES_KINDS, SALES_ROWS, WORTH_A_REPLY } from './weekly'
import type { OverviewData, SideReading, SubjectRow } from './overview'

const side = (over: Partial<SideReading> = {}): SideReading => ({ k: 65, n: 271, pct: 24, verdict: null, observed: true, ...over })

const subject = (over: Partial<SubjectRow> = {}): SubjectRow => ({
  id: 'durability',
  label: 'Durability',
  you: side({ k: 4, n: 19, pct: 21 }),
  rival: null,
  category: side(),
  direction: null,
  spark: [],
  sparkMonths: [],
  categoryAtLastMonth: null,
  href: '/dashboard/subjects',
  ...over,
})

const overview = (over: Partial<OverviewData> = {}): OverviewData =>
  ({
    sentence: { lead: null, body: 'Nothing moved clearly this month. Here is where you stand.', figures: {} },
    subjects: { state: 'ready', rows: [subject()], candidates: [], rivalLabel: null, categoryLabel: 'Category', note: null },
    category: { growing: [], fading: [], moversNote: null },
    ...over,
  }) as unknown as OverviewData

describe('checkStateOf', () => {
  const base = { outcome: 'nothing_unusual', recorded: true, monthsClearing: 3, suppression: null }

  it('is not_recorded before M7 is applied — which is not "nothing was unusual"', () => {
    expect(checkStateOf({ ...base, recorded: false })).toBe('not_recorded')
  })

  it('is not_recorded when the table exists but this update left no row', () => {
    expect(checkStateOf({ ...base, outcome: null })).toBe('not_recorded')
  })

  it('suppresses on a thin update before it reads the outcome', () => {
    const suppression = thinUpdate({ analysedVideos: 40, status: 'completed' }, [
      { analysedVideos: 400 },
      { analysedVideos: 420 },
    ])
    expect(suppression.suppressed).toBe(true)
    expect(checkStateOf({ ...base, outcome: 'flagged', suppression })).toBe('suppressed')
  })

  it('carries the step’s own suppression and no-window outcomes through', () => {
    expect(checkStateOf({ ...base, outcome: 'suppressed' })).toBe('suppressed')
    expect(checkStateOf({ ...base, outcome: 'no_window' })).toBe('no_window')
    expect(checkStateOf({ ...base, outcome: 'missing_migration' })).toBe('not_recorded')
  })

  it('is baseline_forming until three months clear the floor, whatever the outcome says', () => {
    expect(checkStateOf({ ...base, monthsClearing: 2 })).toBe('baseline_forming')
    expect(checkStateOf({ ...base, outcome: 'flagged', monthsClearing: 0 })).toBe('baseline_forming')
  })

  it('reads a clean, compared week as each of its two answers', () => {
    expect(checkStateOf({ ...base, outcome: 'flagged' })).toBe('flagged')
    expect(checkStateOf(base)).toBe('nothing_unusual')
  })
})

describe('headlineObject', () => {
  it('takes the month’s lead verdict where one was earned', () => {
    const data = overview({
      sentence: {
        lead: {
          objectKind: 'theme',
          objectId: 'durability',
          objectLabel: 'Durability',
          audience: 'industry-other',
          window: { kind: 'month', from: '2026-09-01', to: '2026-09-18' },
          value: { k: 65, n: 271 },
          changePts: 5.1,
          bandPts: 4,
          state: 'moved',
          flags: [],
        },
        body: '',
        figures: {},
      },
      subjects: {
        state: 'ready',
        rows: [subject({ categoryAtLastMonth: { k: 44, n: 244, pct: 18 } })],
        candidates: [],
        rivalLabel: null,
        categoryLabel: 'Category',
        note: null,
      },
    } as unknown as Partial<OverviewData>)
    const head = headlineObject(data)
    expect(head?.label).toBe('Durability')
    expect(head?.k).toBe(65)
    expect(head?.atLastMonth).toEqual({ k: 44, n: 244 })
    expect(head?.audience).toBe('the category’s videos')
  })

  it('falls back to the largest level when nothing cleared a band', () => {
    const data = overview({
      subjects: {
        state: 'ready',
        rows: [subject({ id: 'a', label: 'A', category: side({ pct: 9 }) }), subject({ id: 'b', label: 'B', category: side({ pct: 31 }) })],
        candidates: [],
        rivalLabel: null,
        categoryLabel: 'Category',
        note: null,
      },
    } as unknown as Partial<OverviewData>)
    expect(headlineObject(data)?.label).toBe('B')
  })

  it('answers null rather than naming something nothing was read for', () => {
    const data = overview({
      subjects: { state: 'not_recorded', rows: [], candidates: [], rivalLabel: null, categoryLabel: 'Category', note: null },
    } as unknown as Partial<OverviewData>)
    expect(headlineObject(data)).toBeNull()
  })
})

describe('humanTheme', () => {
  it('reads a slug back as words', () => {
    expect(humanTheme('fit_complaints')).toBe('Fit complaints')
    expect(humanTheme('price-sensitivity')).toBe('Price sensitivity')
  })

  it('never renders an empty heading', () => {
    expect(humanTheme('')).toBe('Something customers raised')
    expect(humanTheme('__')).toBe('Something customers raised')
  })
})

describe('the sizes the design names', () => {
  it('prints three worth-a-reply, three rising, four sales rows over four kinds', () => {
    expect(WORTH_A_REPLY).toBe(3)
    expect(RISING_NOW).toBe(3)
    expect(SALES_ROWS).toBe(4)
    expect(SALES_KINDS).toEqual(['objection', 'praise', 'switching_signal', 'pain_point'])
  })
})
