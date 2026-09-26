import { describe, it, expect } from 'vitest'

import type { ConfigChange } from '../../config-log'
import { changesFromLog, comparabilityOf, nextComparablePair, type PairRow } from '../../reading/comparability'
import { scheduledUpdateAfter } from '../../reading/reading-month'
import {
  CHANGE_NEW,
  CHANGE_OF,
  changeLead,
  compareRules,
  buildChangeBlock,
  nextPairLine,
  nextPairParts,
  placeInMonth,
  searchChangeDays,
  searchChangesLine,
  whyCells,
  whyNotCompared,
  type ChangeBlock,
} from './change'

// Sealand's real change log around September (GC F2, staging's copy of
// production to 20 Sep): the 13 Sep term additions and the 17 Sep script.
const row = (over: Partial<ConfigChange> & Pick<ConfigChange, 'id' | 'changed_at' | 'surface'>): ConfigChange => ({
  client_id: 'sealand', field: null, before: null, after: null, actor_kind: 'sql', actor_user_id: null, actor_label: null,
  run_id: null, source: 'trigger', rows_affected: null, note: null, affects_audiences: null, affects_months: null, ...over,
})
const LOG = [
  row({ id: 'terms-0913', changed_at: '2026-09-13T10:00:58.000Z', surface: 'terms', field: 'industry_keywords', after: ['handmade bag', 'sustainable fashion', 'travel gear'] }),
  row({ id: 'terms-0917', changed_at: '2026-09-17T16:02:56.000Z', surface: 'terms', field: 'industry_keywords', actor_kind: 'script' }),
]
const CHANGES = changesFromLog(LOG)

/**
 * A measured August against September row. September's search-outside count
 * is staging's measured 206 of 625 (GC F29: the videos found only by the 13 to
 * 17 Sep terms, the subset WP1.4's strict count must reproduce); August's is
 * CQ F25's "about 115 of 351" (the bare-name terms removed on 9 Sep); depth is
 * DR F39's medians, 23 and 15.
 */
const ROW: PairRow = {
  prevMonth: '2026-08-01',
  month: '2026-09-01',
  searchOutside: { prev: { k: 115, n: 351 }, curr: { k: 206, n: 625 } },
  codeChanges: [],
  depth: { prevMedian: 23, currMedian: 15 },
  gather: [],
  lateCapture: null,
  readThroughRun: 'run-27sep',
  methodVersion: 'mf1',
  computedAt: '2026-09-30T10:00:00.000Z',
}

const pair = (state: 'so_far' | 'ended', row: PairRow | null = ROW) =>
  comparabilityOf('2026-08-01', '2026-09-01', {
    row,
    changes: CHANGES,
    view: 'market',
    later: { state, readToEnd: state === 'ended', latestUpdateRunId: 'run-27sep' },
  })

const block = (over: Partial<ChangeBlock> = {}): ChangeBlock => ({
  prevMonth: '2026-08-01',
  month: '2026-09-01',
  pair: pair('ended'),
  next: nextComparablePair('2026-10-02T06:00:00.000Z', CHANGES, [ROW], {
    view: 'market',
    readingMonth: '2026-09-01',
    nextUpdateAfter: scheduledUpdateAfter({ report_period: 'weekly', report_day: 'sunday' }),
  }),
  checks: [],
  readWith: '2026-09-27T08:30:00.000Z',
  ...over,
})

describe('what changed, and what is ours (plan §2.2 block 10)', () => {
  it('prints the measured count from the pair row, read with its update, one denominator', () => {
    const lead = changeLead(block())
    expect(lead?.body).toBe(
      `Not a change we can stand behind yet: [[${CHANGE_NEW}]] of September’s [[${CHANGE_OF}]] videos came from searches we added in September (read with the 27 Sep update).`,
    )
    expect(lead?.figures[CHANGE_NEW]).toMatchObject({ value: 206, unit: 'videos' })
    expect(lead?.figures[CHANGE_OF]).toMatchObject({ value: 625, unit: 'videos' })
  })

  it('without a measured row (MF1 not applied) prints the refusal in its own words', () => {
    const b = block({ pair: pair('ended', null), readWith: null })
    expect(changeLead(b)).toEqual({ body: 'Not read as a change: we changed our searches in September.', figures: {} })
  })

  it('names October against November, from the 6 Dec update, as the first pair read the same way', () => {
    expect(nextPairLine(block())).toBe(
      'The first comparison read the same way: October against November, from the 6 Dec update, if nothing we search changes.',
    )
  })

  it('promises no update for a paused tenant', () => {
    expect(nextPairLine(block({ paused: true }))).toBeNull()
  })

  it('a first month compares nothing, and says so', () => {
    expect(changeLead(block({ prevMonth: null, pair: null }))?.body).toBe('Nothing is compared yet: September is the first month we read.')
  })

  it('never prints a "moved": a comparable pair is only said to be read the same way', () => {
    const comparable = comparabilityOf('2026-10-01', '2026-11-01', {
      row: { ...ROW, prevMonth: '2026-10-01', month: '2026-11-01', searchOutside: { prev: { k: 0, n: 600 }, curr: { k: 0, n: 610 } }, depth: { prevMedian: 20, currMedian: 19 } },
      changes: [],
      view: 'market',
      later: { state: 'ended', readToEnd: true, latestUpdateRunId: 'run-27sep' },
    })
    expect(comparable.mode).toBe('comparable')
    expect(changeLead(block({ prevMonth: '2026-10-01', month: '2026-11-01', pair: comparable }))?.body).toBe('October and November were read the same way.')
  })
})

describe('Settings › What we changed: the rules and why September is not compared', () => {
  it('reads the four rules off the pair (the preview’s August against September column)', () => {
    expect(compareRules(pair('ended')).map((r) => [r.n, r.state, r.answer])).toEqual([
      [1, 'held', 'September has ended and was read past it'],
      [2, 'not_held', '206 of 625'],
      [3, 'held', 'none touched a tenth'],
      [4, 'not_held', '15 against 23'],
    ])
  })

  it('on a month still running says it is not over, and does not pretend to have measured the rest', () => {
    const rules = compareRules(pair('so_far', null))
    expect(rules[0]).toMatchObject({ state: 'not_held', answer: 'September is not over' })
    expect(rules.slice(1).map((r) => r.state)).toEqual(['unmeasured', 'unmeasured', 'unmeasured'])
  })

  it('titles the section by the month and prints the same sentence as the front page', () => {
    const why = whyNotCompared(block())
    expect(why?.title).toBe('Why September is not compared')
    expect(why?.body).toBe(changeLead(block())?.body)
  })
})

/**
 * The gate fix's reach as WP1.4's read-only staging dry run measured it (26
 * Sep, `exec/logs/wp1-4-confirm-dry-measure-comparability-staging.txt`): 65 of
 * September's 654 market videos and 64 of its 625 category videos were let in
 * without the relevance check; none of August's. Its depth line there reads
 * August 21 and September 14.
 */
const GATE_FIX: PairRow['codeChanges'] = [
  { changeId: 'gate-fix', surface: 'gate_rule', prev: { k: 0, n: 377 }, curr: { k: 65, n: 654 }, population: 'market' },
  { changeId: 'gate-fix', surface: 'gate_rule', prev: { k: 0, n: 351 }, curr: { k: 64, n: 625 }, population: 'category' },
]
const withGate: PairRow = { ...ROW, codeChanges: GATE_FIX }

describe('Settings › What we changed: the three cells behind the refusal (the approved preview)', () => {
  it('prints what came from the new searches and how shallow the threads are, each with its base and its update', () => {
    expect(whyCells(block()).map((c) => [c.key, c.figure, c.base.word, c.base.value, c.caption, c.readWith])).toEqual([
      ['searches', 206, 'of', 625, 'September videos came from searches we added in September', '2026-09-27T08:30:00.000Z'],
      ['depth', 15, 'against', 23, 'Dated comments a video: September’s median, against August’s', '2026-09-27T08:30:00.000Z'],
    ])
  })

  it('adds the gate fix in the market’s own count, in the preview’s words', () => {
    const cells = whyCells(block({ pair: pair('ended', withGate) }))
    expect(cells.map((c) => c.key)).toEqual(['searches', 'code_change', 'depth'])
    expect(cells[1]).toMatchObject({ figure: 65, base: { word: 'of', value: 654 }, caption: 'September videos had been let in without our relevance check' })
  })

  it('prints no cell for a measure that holds, or for a change that does not move the market', () => {
    const shallowNot: PairRow = { ...ROW, depth: { prevMedian: 23, currMedian: 20 } }
    expect(whyCells(block({ pair: pair('ended', shallowNot) })).map((c) => c.key)).toEqual(['searches'])
    const refiled: PairRow = { ...ROW, codeChanges: [{ changeId: 'attr', surface: 'attribution', prev: { k: 20, n: 377 }, curr: { k: 90, n: 654 }, population: 'market' }] }
    expect(whyCells(block({ pair: pair('ended', refiled) })).map((c) => c.key)).toEqual(['searches', 'depth'])
  })

  it('on a month still running, still says why from its row, and calls the median so far', () => {
    const cells = whyCells(block({ pair: pair('so_far') }))
    expect(cells.map((c) => c.key)).toEqual(['searches', 'depth'])
    expect(cells[1].caption).toBe('Dated comments a video: September’s median so far, against August’s')
  })

  it('without a measured row prints no cell and keeps the refusal’s own sentence, never a zero', () => {
    const why = whyNotCompared(block({ pair: pair('ended', null) }))
    expect(why?.cells).toEqual([])
    expect(why?.body).toBe('Not read as a change: we changed our searches in September.')
  })

  it('reads rule 3 as the count the preview prints, never a share rounded up to the line', () => {
    expect(compareRules(pair('ended', withGate))[2]).toMatchObject({ state: 'held', answer: '65 of 654' })
  })

  it('sets the next pair apart in the same sentence', () => {
    const parts = nextPairParts(block())
    expect(parts?.pair).toBe('October against November, from the 6 Dec update')
    expect(`${parts?.lead}${parts?.pair}${parts?.tail}`).toBe(nextPairLine(block()))
  })
})

describe('the month strip: our search changes and the "as at" mark (the approved preview)', () => {
  // Sealand's August and September on staging's log (read 26 Sep, first row
  // of each surface a day): the 17 Aug own accounts; on 9 Sep a rival swap at
  // 16:24:15, the re-filing at 18:10, the term swap at 18:17:56 and an account
  // at 18:21:36; the 13 Sep terms; the 17 Sep script's terms, rival and
  // accounts at 16:02:56.
  const FULL = changesFromLog([
    row({ id: 'own-0817', changed_at: '2026-08-17T07:05:43.716Z', surface: 'handles' }),
    row({ id: 'rivals-0909', changed_at: '2026-09-09T16:24:15.000Z', surface: 'rivals' }),
    row({ id: 'retag-0909', changed_at: '2026-09-09T18:10:00.000Z', surface: 'entity_retag' }),
    row({ id: 'terms-0909', changed_at: '2026-09-09T18:17:56.893Z', surface: 'terms', field: 'industry_keywords' }),
    row({ id: 'handles-0909', changed_at: '2026-09-09T18:21:36.570Z', surface: 'handles' }),
    ...LOG,
    row({ id: 'rivals-0917', changed_at: '2026-09-17T16:02:56.000Z', surface: 'rivals' }),
  ])

  it('marks the days we changed what we search in the two months read, once a day: 9, 13 and 17 Sep', () => {
    const days = searchChangeDays(FULL, '2026-08-01', '2026-09-01')
    expect(days).toEqual(['2026-09-09T18:17:56.893Z', '2026-09-13T10:00:58.000Z', '2026-09-17T16:02:56.000Z'])
    // Rivals, accounts and a re-filing are changes of ours, not searches.
    expect(searchChangeDays(FULL, '2026-08-01', '2026-08-01')).toEqual([])
    // Nothing outside the pair: an October change is not September's.
    const october = changesFromLog([row({ id: 'terms-1003', changed_at: '2026-10-03T08:00:00.000Z', surface: 'terms' })])
    expect(searchChangeDays(october, '2026-08-01', '2026-09-01')).toEqual([])
  })

  it('keys them as the preview does, each month named once', () => {
    expect(searchChangesLine(searchChangeDays(FULL, '2026-08-01', '2026-09-01'))).toBe('our search changes, 9, 13 and 17 Sep')
    expect(searchChangesLine(['2026-08-17T07:05:43.716Z', '2026-09-09T18:17:56.893Z'])).toBe('our search changes, 17 Aug and 9 Sep')
    expect(searchChangesLine(['2026-09-13T10:00:58.000Z'])).toBe('our search change, 13 Sep')
    expect(searchChangesLine([])).toBeNull()
  })

  it('places a day at its middle in its month, as the preview draws 9 Sep and the 24 Sep "as at"', () => {
    expect(placeInMonth('2026-09-09T18:17:56.893Z', '2026-09-01')).toBeCloseTo(8.5 / 30)
    expect(placeInMonth('2026-09-24T18:00:00.000Z', '2026-09-01')).toBeCloseTo(23.5 / 30)
    expect(placeInMonth('2026-10-04T06:00:00.000Z', '2026-10-01')).toBeCloseTo(3.5 / 31)
    expect(placeInMonth('2026-10-04T06:00:00.000Z', '2026-09-01')).toBeNull()
  })

  it('carries both on the block the page and Settings build', () => {
    const b = buildChangeBlock({
      prevMonth: '2026-08-01', month: '2026-09-01', hasPrev: true, pair: pair('ended'), changes: FULL, pairRows: [ROW],
      nextUpdateAfter: scheduledUpdateAfter({ report_period: 'weekly', report_day: 'sunday' }),
      asAt: '2026-09-27T08:30:00.000Z', paused: false, runFinish: new Map(),
    })
    expect(b.asAt).toBe('2026-09-27T08:30:00.000Z')
    expect(b.searchChanges).toEqual(['2026-09-09T18:17:56.893Z', '2026-09-13T10:00:58.000Z', '2026-09-17T16:02:56.000Z'])
  })
})
