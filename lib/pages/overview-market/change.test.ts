import { describe, it, expect } from 'vitest'

import type { ConfigChange } from '../../config-log'
import { changesFromLog, comparabilityOf, nextComparablePair, type PairRow } from '../../reading/comparability'
import { scheduledUpdateAfter } from '../../reading/reading-month'
import {
  CHANGE_NEW,
  CHANGE_OF,
  changeLead,
  compareRules,
  nextPairLine,
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
