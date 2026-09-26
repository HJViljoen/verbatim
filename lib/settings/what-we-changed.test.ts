import { describe, it, expect } from 'vitest'

import type { ConfigChange } from '../config-log'
import { changesFromLog } from '../reading/comparability'
import { changeWords, ledgerLines, ledgerMonths, otherRows, reachCell, termsMoved, type ReachRow } from './what-we-changed'

// Sealand's change log around September (GC F2, staging's copy of production
// to 20 Sep): the 9 Sep swap (seven terms out, seven in, one reconstructed row
// each), the 13 Sep additions (two trigger rows a second apart), and a cadence
// row that is not a change of ours. Reach: CQ F27's 187 for the 13 Sep change
// (by last surfacing, over staging's 625 September category videos) and CQ
// F25's "about 115 of 351" for the 9 Sep names in August. Ids are labels.
const row = (over: Partial<ConfigChange> & Pick<ConfigChange, 'id' | 'changed_at' | 'surface'>): ConfigChange => ({
  client_id: 'sealand', field: null, before: null, after: null, actor_kind: 'reconstructed', actor_user_id: null, actor_label: null,
  run_id: null, source: 'reconstructed', rows_affected: null, note: null, affects_audiences: null, affects_months: null, ...over,
})
const OUT = ['cotopaxi', 'freitag', 'patagonia', 'poler', 'sealandgear', 'sustainable bags', 'topo designs']
const IN = ['cotopaxi backpack', 'freitag bag', 'rareform bag', 'recycled sailcloth', 'sailcloth bag', 'sealand bag', 'upcycled backpack']
const ROWS: ConfigChange[] = [
  // Where the record begins (the reconstructed initial term set, 6 Jul): not
  // a change of ours (`initialTermSet`), so it stays in the Phase 1 log.
  row({ id: 'terms-0706', changed_at: '2026-07-06T04:19:00.000Z', surface: 'terms', after: ['#sealandgear', 'cotopaxi', 'eco backpack', 'freitag', 'patagonia', 'poler', 'recycled bag', 'sealand gear', 'sealandgear', 'sustainable backpack', 'sustainable bags', 'topo designs', 'upcycled bag'] }),
  ...OUT.map((t, i) => row({ id: `0909-out-${i}`, changed_at: '2026-09-09T18:17:56.000Z', surface: 'terms', before: [t] })),
  ...IN.map((t, i) => row({ id: `0909-in-${i}`, changed_at: '2026-09-09T18:17:56.000Z', surface: 'terms', after: [t] })),
  row({ id: '0913-industry', changed_at: '2026-09-13T10:00:58.000Z', surface: 'terms', field: 'industry_keywords', before: ['upcycled bag'], after: ['upcycled bag', 'handmade bag', 'sustainable fashion', 'travel gear'], actor_kind: 'sql', source: 'trigger' }),
  row({ id: '0913-competitor', changed_at: '2026-09-13T10:00:59.000Z', surface: 'terms', field: 'competitor_keywords', before: [], after: ['frtg'], actor_kind: 'sql', source: 'trigger' }),
  row({ id: 'cadence', changed_at: '2026-09-17T16:10:00.000Z', surface: 'cadence', field: 'report_day' }),
]
const REACH: ReachRow[] = [
  { changeId: '0913-industry', month: '2026-09-01', population: 'market', touched: 187, inMonth: 625, readThroughRun: 'run-27sep', computedAt: '2026-09-30T10:00:00.000Z' },
  // An older computation of the same measure: the newest wins.
  { changeId: '0913-industry', month: '2026-09-01', population: 'market', touched: 180, inMonth: 610, readThroughRun: null, computedAt: '2026-09-29T10:00:00.000Z' },
  { changeId: '0909-out-0', month: '2026-08-01', population: 'market', touched: 115, inMonth: 351, readThroughRun: 'run-27sep', computedAt: '2026-09-30T10:00:00.000Z' },
  // The category population is not what the list prints.
  { changeId: '0909-out-0', month: '2026-08-01', population: 'category', touched: 112, inMonth: 351, readThroughRun: 'run-27sep', computedAt: '2026-09-30T10:00:00.000Z' },
]
const RUNS = new Map([['run-27sep', '2026-09-27T08:30:00.000Z']])

describe('the dated list of our changes (Settings › What we changed)', () => {
  const changes = changesFromLog(ROWS)
  const lines = ledgerLines({ changes, rows: ROWS, reach: REACH, runFinish: RUNS })

  it('prints each change once, newest first: the 13 Sep additions are one line, the 9 Sep swap one line, the cadence none', () => {
    expect(lines.map((l) => [l.date.slice(0, 10), l.words])).toEqual([
      ['2026-09-13', '4 search terms added'],
      ['2026-09-09', '7 search terms out and 7 in'],
    ])
  })

  it('lists the terms each change moved', () => {
    expect(lines[0].terms).toEqual({ added: ['frtg', 'handmade bag', 'sustainable fashion', 'travel gear'], removed: [] })
    expect(lines[1].terms?.removed).toEqual(OUT)
  })

  it('carries each month it touched, on the market’s population, the newest measure, read with its update', () => {
    expect(lines[0].months).toEqual([{ month: '2026-09-01', touched: 187, of: 625, readWith: '2026-09-27T08:30:00.000Z' }])
    expect(lines[0].reach).toEqual({ month: '2026-09-01', touched: 187, of: 625, readWith: '2026-09-27T08:30:00.000Z' })
    // A change made on 9 Sep that is measured in August: its own month has no
    // measure, so `reach` is null and August is still listed.
    expect(lines[1].reach).toBeNull()
    expect(lines[1].months).toEqual([{ month: '2026-08-01', touched: 115, of: 351, readWith: '2026-09-27T08:30:00.000Z' }])
  })

  it('prints a cell as "k of n", and nothing for a month it did not measure', () => {
    expect(reachCell(lines[0], '2026-09-01')).toBe('187 of 625')
    expect(reachCell(lines[0], '2026-08-01')).toBeNull()
    expect(ledgerMonths(lines, '2026-09-01', '2026-08-01')).toEqual(['2026-08-01', '2026-09-01'])
  })

  it('leaves the Phase 1 log every row that is not a change of ours, so none prints twice', () => {
    expect(otherRows(ROWS, changes).map((r) => r.id)).toEqual(['terms-0706', 'cadence'])
  })

  it('prefers the change’s own note, in client words, where the log carries one', () => {
    const noted = ROWS.map((r) => (r.id === '0913-industry' ? { ...r, note: 'Four search terms added: handmade bag, sustainable fashion, travel gear and frtg.' } : r))
    const c = changesFromLog(noted).find((x) => x.id === '0913-industry')!
    expect(changeWords(c, noted)).toBe('Four search terms added: handmade bag, sustainable fashion, travel gear and frtg.')
  })

  it('reads a swap written as one before and one after list', () => {
    expect(termsMoved([{ surface: 'terms', before: ['a', 'b'], after: ['b', 'c'] }])).toEqual({ added: ['c'], removed: ['a'] })
  })
})
