import { describe, expect, it } from 'vitest'

import { pairSentence } from '../calibration'
import type { ConfigChange } from '../config-log'
import { cutWindows } from '../pages/v2/market'
import { recordPairs, stopsOf } from '../settings/what-we-changed'
import { readFromStaging } from '../test/week-fixture'
import {
  changeBearsOn, changesFromLog, COMPARABILITY_VIEWS, comparabilityOf, MARKET_DEFINITION_FIELD, nextComparablePair, pairOnVerdict,
  rejudgedFromOf, REJUDGED_SHARE, type PairRow,
} from './comparability'
import { pairJudge, pairOn } from './pairs'
import { weekAgeCutoff, weekPairOf } from './week-line'
import { weekRules, weeksSinceOurChanges, type WeekVolume } from './weeks'

// THE COMPARISON BREAK OF A MARKET-DEFINITION CHANGE (5 Nov; Heinrich: keep
// the weekly bars drawn, refuse any month comparison from a frozen month to a
// re-judged one). The operator sets Sealand's definition, the regate re-judges
// the stored corpus by it and October and November are refreshed; July to
// September stay frozen with the old rule's figures. The definition's row is
// `gate_rule` / `market_description`, `affects_months` the re-judged months.

let seq = 0
// `gate_rule` is in the database's surface CHECK, not in `ConfigSurface`
// (the SQL and the scripts write it), so the fixture casts it as Settings' tests do.
const logRow = (over: Omit<Partial<ConfigChange>, 'surface'> & { changed_at: string; surface: string }): ConfigChange => ({
  id: `row-${++seq}`, client_id: 'sealand', field: null, before: null, after: null, actor_kind: 'script', actor_user_id: null,
  actor_label: 'scripts/set-market-description.ts', run_id: null, source: 'logged', rows_affected: null, note: null,
  affects_audiences: null, affects_months: null, ...over, surface: over.surface as ConfigChange['surface'],
})

/** Saturday 7 Nov: the definition, then the regate's first batches inside
 *  the same minute (the fix's own shape, one row a `regate_videos` call). */
const DEFINITION = logRow({ id: 'definition-1107', changed_at: '2026-11-07T15:00:00.000Z', surface: 'gate_rule', field: MARKET_DEFINITION_FIELD, affects_months: '[2026-10-01,2026-12-01)' })
const REGATE = [10, 40, 130].map((s, i) => logRow({
  id: `regate-1107-${i}`, changed_at: new Date(Date.parse('2026-11-07T15:00:00.000Z') + s * 1000).toISOString(), surface: 'gate_rule', field: 'relevance_gate', rows_affected: 20,
}))
const LOG = [DEFINITION, ...REGATE]
const CHANGES = changesFromLog(LOG)
const definition = CHANGES.find((c) => c.id === 'definition-1107')!
/** An ordinary rule change on the same day: what the definition would read as without its band. */
const ORDINARY = changesFromLog([logRow({ id: 'rule-1107', changed_at: '2026-11-07T15:00:00.000Z', surface: 'gate_rule', field: 'some_rule' })])

/** A pair row read the same way on both sides: nothing outside the searches,
 *  matched depth, clean runs, read through the latest update; the regate's
 *  batches measured as the pair judge measures a fail-open fix (the unjudged
 *  videos in each month: none left after the regate). */
const pairRow = (prevMonth: string, month: string): PairRow => ({
  prevMonth, month,
  searchOutside: { prev: { k: 0, n: 400 }, curr: { k: 0, n: 400 } },
  codeChanges: REGATE.flatMap((r) => [
    { changeId: r.id, surface: 'gate_rule' as const, prev: { k: 0, n: 400 }, curr: { k: 0, n: 400 }, population: 'market' as const },
    { changeId: r.id, surface: 'gate_rule' as const, prev: { k: 0, n: 380 }, curr: { k: 0, n: 380 }, population: 'category' as const },
  ]),
  depth: { prevMedian: 20, currMedian: 20 },
  gather: [{ month: prevMonth, runs: 4, partial: 0, searchesShort: 0 }, { month, runs: 4, partial: 0, searchesShort: 0 }],
  lateCapture: null, readThroughRun: 'run-latest', methodVersion: 'mf1_v1', computedAt: '2026-12-07T09:00:00.000Z',
})
const ENDED = { state: 'ended' as const, readToEnd: true, latestUpdateRunId: 'run-latest' }
const judge = (prev: string, month: string, changes = CHANGES, view: (typeof COMPARABILITY_VIEWS)[number] = 'market') =>
  comparabilityOf(prev, month, { row: pairRow(prev, month), changes, view, later: ENDED })

describe('changesFromLog: a change of the market definition', () => {
  it('is re-judged from its band’s first month, moves every view, and is grouped apart from the regate beside it', () => {
    expect(definition).toMatchObject({ surface: 'gate_rule', rejudgedFrom: '2026-10-01', affects: [...COMPARABILITY_VIEWS], rowIds: ['definition-1107'] })
    expect(definition.failOpenFix).toBeUndefined()
    const regate = CHANGES.filter((c) => c.id !== 'definition-1107')
    expect(regate.every((c) => c.failOpenFix === true && c.rejudgedFrom === undefined)).toBe(true)
    expect(regate.flatMap((c) => c.rowIds)).toEqual(REGATE.map((r) => r.id))
  })

  it('fails closed where its band does not say a month: no break, and it is still a market-definition change', () => {
    for (const affects_months of [null, '', '[2026-10-15,2026-12-01)', '[2026-12-01,2026-10-01)', '2026-10-01']) {
      expect(rejudgedFromOf({ ...DEFINITION, affects_months })).toBeNull()
      const [c] = changesFromLog([{ ...DEFINITION, affects_months }])
      expect(c.rejudgedFrom).toBeUndefined()
      expect(c.marketDefinition).toBe(true)
    }
    expect(rejudgedFromOf({ ...DEFINITION, field: 'relevance_gate' })).toBeNull()
    expect(rejudgedFromOf({ ...DEFINITION, surface: 'other' })).toBeNull()
    expect(CHANGES.filter((c) => c.marketDefinition).map((c) => c.id)).toEqual(['definition-1107'])
  })

  it('such a row refuses every pair in its span unmeasured, and a measure written for it is never read', () => {
    const garbled = changesFromLog([{ ...DEFINITION, affects_months: null }, ...REGATE])
    // A measure of it at none of either month, as the gate's reach would read: ignored.
    const withMeasure = (prev: string, month: string): PairRow => {
      const base = pairRow(prev, month)
      return { ...base, codeChanges: [...base.codeChanges, { changeId: 'definition-1107', surface: 'gate_rule' as const, prev: { k: 0, n: 400 }, curr: { k: 0, n: 400 } }] }
    }
    for (const [prev, month] of [['2026-09-01', '2026-10-01'], ['2026-10-01', '2026-11-01'], ['2026-11-01', '2026-12-01']]) {
      const r = comparabilityOf(prev, month, { row: withMeasure(prev, month), changes: garbled, view: 'market', later: ENDED })
      expect(r.mode, `${prev} ${month}`).toBe('refuse')
      expect(r.reasons.find((x) => x.changeId === 'definition-1107'), `${prev} ${month}`).toMatchObject({ kind: 'code_change', share: null })
    }
    // Outside its span (both months frozen before it was logged) it moves nothing.
    expect(comparabilityOf('2026-08-01', '2026-09-01', { row: withMeasure('2026-08-01', '2026-09-01'), changes: garbled, view: 'market', later: ENDED }).mode).toBe('comparable')
    // The page judge never reads its measure either.
    const page = pairJudge({ now: '2026-11-20T00:00:00.000Z', changes: garbled, rows: [withMeasure('2026-10-01', '2026-11-01')], updates: [{ id: 'run-latest', finishedAt: '2026-11-15T05:00:00.000Z' }] })
    expect(page('2026-10-01', '2026-11-01', 'market').reasons.find((x) => x.changeId === 'definition-1107')).toMatchObject({ share: null })
  })
})

describe('month comparisons across the break are refused, and only those', () => {
  it('September (frozen) against October (re-judged) is refused on every view, naming the change', () => {
    for (const view of COMPARABILITY_VIEWS) {
      const r = judge('2026-09-01', '2026-10-01', CHANGES, view)
      expect(r.mode, view).toBe('refuse')
      expect(r.reasons, view).toEqual([{ kind: 'code_change', changeId: 'definition-1107', share: REJUDGED_SHARE, changedAt: DEFINITION.changed_at, surface: 'gate_rule', rejudgedFrom: '2026-10-01' }])
    }
    // Named by the month it applies FROM, not the month it was logged in.
    const verdict = pairOnVerdict(judge('2026-09-01', '2026-10-01'))
    expect(verdict).toMatchObject({ refused: 'tracking_change', note: { mode: 'refuse', cause: 'rejudged', changeMonth: '2026-10-01' } })
    expect(pairSentence(verdict.note!)).toBe('Not read as a change: we changed how we check videos from October on.')
  })

  it('without the definition’s row the same pair would compare: the regate alone measures nothing left to judge', () => {
    expect(judge('2026-09-01', '2026-10-01', changesFromLog(REGATE)).mode).toBe('comparable')
  })

  it('any pair from a month before October to one from October on is refused', () => {
    for (const [prev, month] of [['2026-08-01', '2026-10-01'], ['2026-09-01', '2026-11-01'], ['2026-07-01', '2026-12-01']]) {
      expect(judge(prev, month).mode, `${prev} ${month}`).toBe('refuse')
      expect(changeBearsOn(definition, prev, month)).toBe(true)
    }
  })

  it('two months on one side of it are not refused by it: August against September, October against November, November against December', () => {
    for (const [prev, month] of [['2026-08-01', '2026-09-01'], ['2026-10-01', '2026-11-01'], ['2026-11-01', '2026-12-01']]) {
      expect(judge(prev, month).mode, `${prev} ${month}`).toBe('comparable')
      expect(changeBearsOn(definition, prev, month)).toBe(false)
    }
    // October against November is in the change's span by date: an ordinary
    // rule change that day would refuse it unmeasured, as one counts as a tenth.
    expect(judge('2026-10-01', '2026-11-01', ORDINARY).mode).toBe('refuse')
  })

  it('a measure the comparability step wrote for the change is not read: the break is not a share', () => {
    const base = pairRow('2026-10-01', '2026-11-01')
    const measured = { ...base, codeChanges: [...base.codeChanges, { changeId: 'definition-1107', surface: 'gate_rule' as const, prev: { k: 300, n: 400 }, curr: { k: 0, n: 400 } }] }
    expect(comparabilityOf('2026-10-01', '2026-11-01', { row: measured, changes: CHANGES, view: 'market', later: ENDED }).mode).toBe('comparable')
    const sepOct = pairRow('2026-09-01', '2026-10-01')
    const across = { ...sepOct, codeChanges: [...sepOct.codeChanges, { changeId: 'definition-1107', surface: 'gate_rule' as const, prev: { k: 0, n: 400 }, curr: { k: 0, n: 400 } }] }
    expect(comparabilityOf('2026-09-01', '2026-10-01', { row: across, changes: CHANGES, view: 'market', later: ENDED }).mode).toBe('refuse')
  })

  it('an unmeasured pair across it names it too, at its share', () => {
    const r = comparabilityOf('2026-09-01', '2026-10-01', { row: null, changes: CHANGES, view: 'themes', later: ENDED })
    expect(r.reasons.map(({ kind, changeId, share }) => ({ kind, changeId, share }))).toEqual([
      { kind: 'unmeasured', changeId: null, share: null },
      { kind: 'code_change', changeId: 'definition-1107', share: REJUDGED_SHARE },
      ...CHANGES.filter((c) => c.failOpenFix).map((c) => ({ kind: 'code_change', changeId: c.id, share: null })),
    ])
  })
})

describe('the page judge and Settings read the break the same way', () => {
  const updates = [
    { id: 'run-1101', finishedAt: '2026-11-01T05:00:00.000Z' },
    { id: 'run-1108', finishedAt: '2026-11-08T05:00:00.000Z' },
    { id: 'run-latest', finishedAt: '2026-11-15T05:00:00.000Z' },
  ]
  const rows = [pairRow('2026-09-01', '2026-10-01'), pairRow('2026-10-01', '2026-11-01')]
  const page = pairJudge({ now: '2026-11-20T00:00:00.000Z', changes: CHANGES, rows, updates })

  it('September against October: refused for the change; October against November so far: running, never blamed on it', () => {
    expect(pairOnVerdict(page('2026-09-01', '2026-10-01', 'brands')).refused).toBe('tracking_change')
    const running = page('2026-10-01', '2026-11-01', 'market')
    expect(running.reasons.some((r) => r.changeId === 'definition-1107')).toBe(false)
    expect(pairOnVerdict(running).note?.cause).toBe('running')
  })

  it('Settings lists it as stopping September against October only, as measured', () => {
    const stops = stopsOf(definition, pairOn(page), recordPairs(['2026-08-01', '2026-09-01', '2026-10-01'], '2026-10-01'))
    expect(stops).toEqual([{ pair: { prevMonth: '2026-09-01', month: '2026-10-01' }, views: ['market', 'themes', 'brands'], unmeasured: false }])
  })

  it('the next comparable pair after it starts at its first re-judged month', () => {
    expect(nextComparablePair('2026-11-08T06:00:00.000Z', [definition], [], { readingMonth: '2026-10-01' })).toMatchObject({ prevMonth: '2026-10-01', month: '2026-11-01' })
    expect(nextComparablePair('2026-11-08T06:00:00.000Z', ORDINARY, [], { readingMonth: '2026-10-01' })).toMatchObject({ prevMonth: '2026-12-01', month: '2027-01-01' })
  })
})

describe('the weekly bars stay drawn across it', () => {
  const week = (w: string, videos: number, state: WeekVolume['state'] = 'settled'): WeekVolume => ({
    week: w, state, updatesSince: 2, videos, comments: videos * 10, category: videos, rivalFiled: 0,
    commentsNextMonth: 0, medianDated: null, under5: 0, olderVideos: 0, unchecked: 0,
  })
  const axis = ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']
  const weeks = axis.map((w, i) => week(w, 120 + i, i === axis.length - 1 ? 'so_far' : 'settled'))

  it('no rule for the definition or the regate, so every gathered week on the axis draws', () => {
    expect(weekRules(CHANGES, axis)).toEqual([])
    expect(weeksSinceOurChanges(weeks, weekRules(CHANGES, axis)).map((w) => w.week)).toEqual(axis)
  })

  it('where an ordinary rule change that day would draw only the weeks after its own', () => {
    expect(weeksSinceOurChanges(weeks, weekRules(ORDINARY, axis)).map((w) => w.week)).toEqual(['2026-11-09'])
  })

  it('Market’s week windows are not cut at it either', () => {
    const windows = [
      { from: '2026-10-25T04:00:00.000Z', to: '2026-11-01T04:00:00.000Z' },
      { from: '2026-11-01T04:00:00.000Z', to: '2026-11-08T04:00:00.000Z' },
      { from: '2026-11-08T04:00:00.000Z', to: '2026-11-15T04:00:00.000Z' },
    ]
    expect(cutWindows(windows, CHANGES)).toEqual([false, false, false])
    expect(cutWindows(windows, ORDINARY)).toEqual([true, true, false])
  })

  it('the same-age line, whose points are kept and never re-read, still refuses a pair across it', () => {
    const prev = readFromStaging('2026-09-07', { week: '2026-11-02', capturedBefore: weekAgeCutoff('2026-11-02', 14), readThroughAt: '2026-11-15T05:00:00.000Z', unchecked: 0 })
    const curr = readFromStaging('2026-09-14', { week: '2026-11-09', capturedBefore: weekAgeCutoff('2026-11-09', 14), readThroughAt: '2026-11-22T05:00:00.000Z', unchecked: 0 })
    expect(weekPairOf(prev, curr, CHANGES).reasons).toContainEqual({ kind: 'gate', detail: 'gate_rule 7 Nov' })
    expect(weekPairOf(prev, curr, changesFromLog(REGATE)).reasons.some((r) => r.kind === 'gate')).toBe(false)
  })
})
