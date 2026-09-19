import { describe, expect, it } from 'vitest'
import { thinUpdate } from '../reading/anomaly'
import { checkStateOf, headlineObject, humanTheme, risingMovers, RISING_NOW, WORTH_A_REPLY } from './weekly'
import type { Mover } from './overview'
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

  it('says the baseline is forming before it says nothing is recorded', () => {
    // The order is the argument: a new workspace is told when the check starts
    // working, not that something is missing (see checkStateOf).
    expect(checkStateOf({ ...base, recorded: false, monthsClearing: 1 })).toBe('baseline_forming')
  })

  it('is not_recorded when the table exists but this update left no row', () => {
    expect(checkStateOf({ ...base, outcome: null })).toBe('not_recorded')
  })

  // TWO SOURCES OF TRUTH, AND THE RECORD IS THE ONE. The loader's thinUpdate is
  // a recomputation of one gate, made later, from a different read; it used to
  // sit ahead of `anomaly_checks.outcome`, so the artefact could say
  // "suppressed — thin" over a check that ran and flagged.
  const thin = thinUpdate({ analysedVideos: 40, status: 'completed' }, [
    { analysedVideos: 400 },
    { analysedVideos: 420 },
  ])

  it('suppresses on a thin update where nothing was recorded', () => {
    expect(thin.suppressed).toBe(true)
    expect(checkStateOf({ ...base, recorded: false, outcome: null, suppression: thin })).toBe('suppressed')
  })

  it('prefers the check’s own record to a fresh recomputation of one gate', () => {
    expect(checkStateOf({ ...base, outcome: 'flagged', suppression: thin })).toBe('flagged')
    expect(checkStateOf({ ...base, outcome: 'nothing_unusual', suppression: thin })).toBe('suppressed')
  })

  it('carries the step’s own suppression and no-window outcomes through', () => {
    expect(checkStateOf({ ...base, outcome: 'suppressed' })).toBe('suppressed')
    expect(checkStateOf({ ...base, outcome: 'no_window' })).toBe('no_window')
    expect(checkStateOf({ ...base, outcome: 'missing_migration' })).toBe('not_recorded')
  })

  it('is baseline_forming until three months clear the floor, rather than say nothing was unusual', () => {
    expect(checkStateOf({ ...base, monthsClearing: 2 })).toBe('baseline_forming')
    expect(checkStateOf({ ...base, recorded: false, outcome: null, monthsClearing: 0 })).toBe('baseline_forming')
  })

  it('lets a recorded flag stand over the loader’s own baseline estimate', () => {
    // The check computes its own baseline before it flags anything; a pooled
    // read off month_denominators is the rougher of the two answers.
    expect(checkStateOf({ ...base, outcome: 'flagged', monthsClearing: 0 })).toBe('flagged')
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
    expect(head?.audience).toBe('the category')
  })

  // `categoryAtLastMonth` is the CATEGORY side alone, and OV1's lead may be the
  // client's own brand. Taking one against the other would print "31% of 42
  // videos read for your own brand, against 24% at this point in August" —
  // two denominators as one quantity moving.
  it('refuses the last-month figure when the lead is not the category’s', () => {
    const data = overview({
      sentence: {
        lead: {
          objectKind: 'subject',
          objectId: 'durability',
          objectLabel: 'Durability',
          audience: 'client',
          window: { kind: 'month', from: '2026-09-01', to: '2026-09-18' },
          value: { k: 13, n: 42 },
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
    expect(head?.audience).toBe('your own brand')
    expect(head?.n).toBe(42)
    expect(head?.atLastMonth).toBeNull()
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
  it('prints three worth-a-reply and three rising', () => {
    expect(WORTH_A_REPLY).toBe(3)
    expect(RISING_NOW).toBe(3)
  })

  // §4's own sizes left this file with `loadSales` (block D wave 2): the
  // weekly report reads This week's `buildSales` now, so the caps that govern
  // it are `lib/blocks/for-sales.ts`'s — SALES_GROUPS_SHOWN,
  // SALES_QUOTES_PER_GROUP, SALES_SWITCHING_SHOWN, SALES_PRAISE_SHOWN — and
  // they are pinned where they live, once, rather than twice.
})

describe('risingMovers', () => {
  const mover = (id: string, pct: number): Mover =>
    ({ id, label: id, k: pct, n: 100, pct, verdict: null, direction: null, isNew: false, spark: [], sparkMonths: [], firstHeard: null }) as unknown as Mover

  const growing = [mover('t1', 9.4), mover('t2', 5.1), mover('t3', 4.2), mover('t4', 3.3)]

  /** The two fields `risingMovers` reads, as a `CategoryBlock`. The block has
   *  thirteen more and none of them reach this function. */
  const cat = (rows = growing) =>
    overview({ category: { growing: rows, fading: [], moversNote: null } as unknown as OverviewData['category'] })

  // §1's object is `headlineObject`, whose third arm IS `category.growing`, and
  // §5's rows are `category.growing`'s top few. Nothing excluded the first from
  // the second, so whenever the lead was a category mover — the common case —
  // the artefact stated it twice, at 17.5px near the top and again near the
  // foot, same object, same share, same denominator.
  it('drops the object the hero sentence led with', () => {
    expect(risingMovers(cat(), 't1').map((m) => m.id)).toEqual(['t2', 't3', 't4'])
  })

  // The filter comes BEFORE the slice, so dropping the lead promotes the next
  // mover rather than leaving §5 a row short.
  it('still prints three, promoting the next mover', () => {
    expect(risingMovers(cat(), 't1')).toHaveLength(RISING_NOW)
    expect(risingMovers(cat(), null).map((m) => m.id)).toEqual(['t1', 't2', 't3'])
  })

  // BY ID, NEVER BY LABEL: a registry id is the stable identity and a label
  // churns ~88% run to run (AGENTS.md), so matching on the printed words would
  // silently stop excluding anything the first time a model reworded a theme.
  it('matches on identity, not on the words', () => {
    const renamed = [{ ...growing[0], label: 'Wet commute survival' }, ...growing.slice(1)]
    expect(risingMovers(cat(renamed), 't1').map((m) => m.id)).toEqual(['t2', 't3', 't4'])
  })

  it('leaves a lead that is not a category mover alone', () => {
    expect(risingMovers(cat(), 'durability').map((m) => m.id)).toEqual(['t1', 't2', 't3'])
  })
})
