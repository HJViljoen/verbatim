import { describe, it, expect } from 'vitest'

import type { ConfigChange } from '../config-log'
import { changesFromLog } from '../reading/comparability'
import { SURFACE_WORDS } from './change-log'
import { changeDetail, changeWords, handlesWords, ledgerLines, ledgerMonths, otherRows, reachCell, rivalsMoved, termsMoved, type ReachRow } from './what-we-changed'
import { cellReadWith, mergeStops, recordGroupOf, recordPairs, recordView, stopLines, stopsOf, type StopEntry } from './what-we-changed'
import { pairOn, type PairOn } from '../reading/pairs'
import { CHANGES, SEALAND_LOG, sealandJudge } from '../test/sealand-pairs'
import type { PairRow } from '../reading/comparability'

// Sealand's change log around September (GC F2, staging's copy of production
// to 20 Sep): the 9 Sep swap (seven terms out, seven in, one reconstructed row
// each), the 13 Sep additions (two trigger rows a second apart), and a cadence
// row that is not a change of ours. Reach: staging's config_change_reach rows
// (26 Sep): the 13 Sep change 182 of September's 654 market videos, and the
// 9 Sep swap 167 of August's 377 market videos (141 of 351 in the category, a
// population the list does not print). Ids are labels.
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
  { changeId: '0913-industry', month: '2026-09-01', population: 'market', touched: 182, inMonth: 654, readThroughRun: 'run-27sep', computedAt: '2026-09-30T10:00:00.000Z' },
  // An older computation of the same measure: the newest wins.
  { changeId: '0913-industry', month: '2026-09-01', population: 'market', touched: 180, inMonth: 610, readThroughRun: null, computedAt: '2026-09-29T10:00:00.000Z' },
  { changeId: '0909-out-0', month: '2026-08-01', population: 'market', touched: 167, inMonth: 377, readThroughRun: 'run-27sep', computedAt: '2026-09-30T10:00:00.000Z' },
  // The category population is not what the list prints.
  { changeId: '0909-out-0', month: '2026-08-01', population: 'category', touched: 141, inMonth: 351, readThroughRun: 'run-27sep', computedAt: '2026-09-30T10:00:00.000Z' },
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
    expect(lines[0].items).toEqual({ added: ['frtg', 'handmade bag', 'sustainable fashion', 'travel gear'], removed: [] })
    expect(lines[1].items?.removed).toEqual(OUT)
  })

  it('carries each month it touched, on the market’s population, the newest measure, read with its update', () => {
    expect(lines[0].months).toEqual([{ month: '2026-09-01', touched: 182, of: 654, readWith: '2026-09-27T08:30:00.000Z' }])
    expect(lines[0].reach).toEqual({ month: '2026-09-01', touched: 182, of: 654, readWith: '2026-09-27T08:30:00.000Z' })
    // A change made on 9 Sep that is measured in August: its own month has no
    // measure, so `reach` is null and August is still listed.
    expect(lines[1].reach).toBeNull()
    expect(lines[1].months).toEqual([{ month: '2026-08-01', touched: 167, of: 377, readWith: '2026-09-27T08:30:00.000Z' }])
  })

  it('prints a cell as "k of n", and nothing for a month it did not measure', () => {
    expect(reachCell(lines[0], '2026-09-01')).toBe('182 of 654')
    expect(reachCell(lines[0], '2026-08-01')).toBeNull()
    expect(ledgerMonths(lines, '2026-09-01', '2026-08-01')).toEqual(['2026-08-01', '2026-09-01'])
  })

  it('leaves the Phase 1 log every row that is not a change of ours, so none prints twice', () => {
    expect(otherRows(ROWS, changes).map((r) => r.id)).toEqual(['terms-0706', 'cadence'])
  })

  it('never prints a reconstruction’s operator note: it composes the words from what the rows moved (GC F9)', () => {
    // Staging's real note on the 13 Sep row is operator prose ("three terms
    // appended by a hand-typed UPDATE in the SQL editor …").
    const noted = ROWS.map((r) => (r.id === '0913-industry' ? { ...r, note: 'three terms appended by a hand-typed UPDATE in the SQL editor' } : r))
    const c = changesFromLog(noted).find((x) => x.id === '0913-industry')!
    expect(changeWords(c, noted)).toBe('4 search terms added')
  })

  it('titles a row market-first’s own scripts wrote by its surface, with its client-words note beneath (the gate fix, WP1.4; the preview’s title and description, deploy 2 review)', () => {
    const gate = row({ id: 'gate-fix', changed_at: '2026-09-26T08:00:00.000Z', surface: 'gate_rule' as never, note: 'We fixed how we check that a video is about bags.' })
    const c = changesFromLog([gate])[0]
    expect(changeWords(c, [gate])).toBe('How we check relevance')
    expect(changeDetail(c)).toBe('We fixed how we check that a video is about bags.')
    const [line] = ledgerLines({ changes: [c], rows: [gate], reach: [], runFinish: new Map() })
    expect([line.words, line.detail]).toEqual(['How we check relevance', 'We fixed how we check that a video is about bags.'])
    // A change whose words say what moved carries no description.
    expect(changeDetail(changesFromLog(ROWS).find((x) => x.id === '0913-industry')!)).toBeNull()
  })

  it('prints a capped update’s approved note, never "A change to how we read", and no other `other` row’s operator prose (deploy 2 review)', () => {
    // log-tracking-eras --capped-run's row (WP1.4): surface 'other', field
    // 'gather_capped', CAPPED_NOTE. Staging's stand-in sits on the 20 Sep
    // partial run.
    const capped = row({ id: 'capped-0920', changed_at: '2026-09-20T09:38:00.000Z', surface: 'other', field: 'gather_capped', actor_kind: 'script', source: 'reconstructed', note: 'An update gathered less than usual because a spending cap was reached.' })
    const c = changesFromLog([capped])[0]
    expect(changeWords(c, [capped])).toBe('An update gathered less than usual because a spending cap was reached.')
    // An operator's `other` row keeps the surface's words: its note is prose.
    const panel = row({ id: 'panel-0924', changed_at: '2026-09-24T08:20:00.000Z', surface: 'other', field: 'attention_panel', actor_kind: 'pipeline', note: 'attention panel frozen: 251 accounts first seen before 2026-06-01' })
    expect(changeWords(changesFromLog([panel])[0], [panel])).toBe('A change to how we read')
  })

  it('names the relevance check as The record does, "How we check relevance", when its row carries no note (deploy 2 integration)', () => {
    const gate = row({ id: 'gate-fix', changed_at: '2026-09-26T08:00:00.000Z', surface: 'gate_rule' as never })
    const c = changesFromLog([gate])[0]
    expect(changeWords(c, [gate])).toBe('How we check relevance')
    expect(changeWords(c, [gate])).toBe(SURFACE_WORDS.gate_rule)
  })

  it('counts the exclusions list apart from the search terms (the 17 Sep script touched both)', () => {
    const script = [
      row({ id: '0917-industry', changed_at: '2026-09-17T16:02:56.000Z', surface: 'terms', field: 'industry_keywords', before: [], after: ['made from waste', 'locally made south africa'] }),
      row({ id: '0917-exclude', changed_at: '2026-09-17T16:02:56.000Z', surface: 'terms', field: 'exclude_terms', before: [], after: ['volcano', 'hip hop', 'schengen'] }),
    ]
    const c = changesFromLog([ROWS[0], ...script]).find((x) => x.id.startsWith('0917'))!
    expect(changeWords(c, script)).toBe('2 search terms added; 3 exclusions added')
    expect(termsMoved(script)).toEqual({ added: ['locally made south africa', 'made from waste'], removed: [] })
  })

  it('reads a swap written as one before and one after list', () => {
    expect(termsMoved([{ surface: 'terms', field: null, before: ['a', 'b'], after: ['b', 'c'] }])).toEqual({ added: ['c'], removed: ['a'] })
  })

  // Staging's 17 Sep rows (read 26 Sep): the script's 16:02 row gave four new
  // rivals their accounts, and a 16:24 row added The North Face's TikTok. Both
  // printed "The accounts we read changed" before (WP1.6 review).
  const H1 = { Freitag: { tiktok: 'freitaglab', youtube: 'UCHyhAHfoZOUw0zRCn1JSAMg', instagram: 'freitaglab' }, Cotopaxi: { tiktok: 'cotopaxiofficial', youtube: 'UCjGWYNy7xrGOJ72AeMBb-hA', instagram: 'cotopaxi' }, Rareform: { tiktok: 'rareform', instagram: 'rareform' } }
  const H2 = { ...H1, Patagonia: { tiktok: 'patagonia', youtube: 'UCl3xZ-f3cQhOHvH6f-7-ssQ', instagram: 'patagonia' }, 'Old School': { tiktok: 'oldschool_ltd', instagram: 'oldschool_ltd' }, 'The North Face': { youtube: 'UCNfWDbERpf34FsSWIpqGD0Q', instagram: 'thenorthface' }, 'Freedom of Movement': { tiktok: 'fombrand', instagram: 'fombrand' } }
  const H3 = { ...H2, 'The North Face': { tiktok: 'thenorthface', youtube: 'UCNfWDbERpf34FsSWIpqGD0Q', instagram: 'thenorthface' } }
  const HANDLES = [
    row({ id: 'h-1602', changed_at: '2026-09-17T16:02:56.854Z', surface: 'handles' as never, field: 'competitor_handles', before: H1, after: H2, actor_kind: 'script', source: 'trigger' }),
    row({ id: 'h-1624', changed_at: '2026-09-17T16:24:22.289Z', surface: 'handles' as never, field: 'competitor_handles', before: H2, after: H3, actor_kind: 'script', source: 'trigger' }),
  ]

  it('names whose accounts moved, so two changes on one day read apart (17 Sep, staging)', () => {
    const changes = changesFromLog(HANDLES)
    expect(changes).toHaveLength(2)
    const words = new Map(changes.map((c) => [c.id, changeWords(c, HANDLES)]))
    expect(words.get('h-1602')).toBe('Accounts added for Freedom of Movement, Old School, Patagonia and The North Face')
    expect(words.get('h-1624')).toBe('A TikTok account added for The North Face')
  })

  it('names your own accounts by platform, and a changed or dropped handle', () => {
    const own = row({ id: 'own', changed_at: '2026-08-17T07:05:43.716Z', surface: 'handles' as never, field: 'own_handles', before: null, after: { tiktok: 'sealandgear', youtube: 'UCCthtmYgmon7h0meZaC1FEQ', instagram: 'sealandgear' } })
    expect(handlesWords([own])).toBe('Your Instagram, TikTok and YouTube accounts added')
    const moved = row({ id: 'nf', changed_at: '2026-09-18T00:00:00.000Z', surface: 'handles' as never, field: 'competitor_handles', before: H3, after: { ...H1, 'The North Face': { tiktok: 'tnf', youtube: 'UCNfWDbERpf34FsSWIpqGD0Q' } } })
    expect(handlesWords([moved])).toBe(
      'Accounts dropped for Freedom of Movement, Old School and Patagonia; The North Face’s TikTok account changed; The North Face’s Instagram account taken out',
    )
    expect(handlesWords([row({ id: 'same', changed_at: '2026-09-18T00:00:00.000Z', surface: 'handles' as never, field: 'competitor_handles', before: H1, after: H1 })])).toBeNull()
  })

  it('counts the rivals in and out, and lists them beside the words (9 Sep, staging)', () => {
    const rivals = row({ id: 'r-0909', changed_at: '2026-09-09T16:24:15.000Z', surface: 'rivals' as never, field: 'competitor_names', before: ['Cotopaxi', 'Freitag', 'Patagonia', 'Poler', 'Topo Designs'], after: ['Cotopaxi', 'Freitag', 'Rareform'] })
    expect(changeWords(changesFromLog([rivals])[0], [rivals])).toBe('3 rivals out and 1 in')
    expect(rivalsMoved([rivals])).toEqual({ added: ['Rareform'], removed: ['Patagonia', 'Poler', 'Topo Designs'] })
    const line = ledgerLines({ changes: changesFromLog([rivals]), rows: [rivals], reach: [], runFinish: new Map() })[0]
    expect(line.items).toEqual({ added: ['Rareform'], removed: ['Patagonia', 'Poler', 'Topo Designs'] })
  })

  it('lists the communities a change switched on and off beside its words', () => {
    const onebag = row({ id: 'sub-0909', changed_at: '2026-09-09T00:00:00.000Z', surface: 'subreddits' as never, before: { name: 'onebag', status: 'candidate' }, after: { name: 'onebag', status: 'active' } })
    const line = ledgerLines({ changes: changesFromLog([onebag]), rows: [onebag], reach: [], runFinish: new Map() })[0]
    expect(line.words).toBe('1 community added')
    expect(line.items).toEqual({ added: ['r/onebag'], removed: [] })
  })
})


// ---- The record, grouped (R-a) ---------------------------------------------------------

describe('the record, grouped as the preview groups it', () => {
  it('files the searches, communities, rivals and accounts under "What we search", the rest under "How we check, mark and file videos"', () => {
    for (const s of ['terms', 'platforms', 'subreddits', 'rivals', 'handles']) expect(recordGroupOf(s)).toBe('search')
    for (const s of ['gate_rule', 'attribution', 'segment', 'entity_retag', 'regate', 'prompt_version', 'knobs', 'rival_rename', 'other']) expect(recordGroupOf(s)).toBe('check')
  })

  it('asks about the pairs the page can show: each column month against the one before, and the reading month against the next', () => {
    expect(recordPairs(['2026-08-01', '2026-09-01'], '2026-09-01')).toEqual([
      { prevMonth: '2026-07-01', month: '2026-08-01' },
      { prevMonth: '2026-08-01', month: '2026-09-01' },
      { prevMonth: '2026-09-01', month: '2026-10-01' },
    ])
  })

  // Sealand's real log (GC F2) judged at 2 Oct, with staging's measured
  // (Aug, Sep) row after the 26 Sep rehearsal (exec/logs/staging-mf1-
  // rehearsal-2026-09-26.md): 148 of 351 and 376 of 625 outside the unchanged
  // searches, depth 21 against 14, read through the 20 Sep update.
  const ROW: PairRow = {
    prevMonth: '2026-08-01', month: '2026-09-01',
    searchOutside: { prev: { k: 148, n: 351 }, curr: { k: 376, n: 625 } },
    codeChanges: [], depth: { prevMedian: 21, currMedian: 14 }, gather: [], lateCapture: null,
    readThroughRun: 'run-2026-09-20', methodVersion: 'mf1_v1', computedAt: '2026-09-26T14:10:00.000Z',
  }
  const judge: PairOn = pairOn(sealandJudge('2026-10-02T06:00:00.000Z', [ROW]))
  const pairs = recordPairs(['2026-08-01', '2026-09-01'], '2026-09-01')
  const byId = new Map(CHANGES.map((c) => [c.id, c]))

  it('a search change stops the pairs the searches reason refuses, measured where the row measured it', () => {
    const stops = stopsOf(byId.get('terms-0913')!, judge, pairs)
    expect(stops.map((e) => [e.pair.month, e.views, e.unmeasured])).toEqual([
      ['2026-08-01', ['market', 'themes', 'brands'], true],
      ['2026-09-01', ['market', 'themes', 'brands'], false],
      ['2026-10-01', ['market', 'themes', 'brands'], true],
    ])
  })

  it('a filing change stops brands and themes only, and never the market (decision E)', () => {
    const stops = stopsOf(byId.get('retag-0909')!, judge, pairs)
    expect(stops.every((e) => !e.views.includes('market'))).toBe(true)
    expect(stopLines(stops, true)).toEqual(['Pairs with August or September, for brands and themes, until measured'])
  })

  it('merges a group’s stops a pair at a time, measured where any change’s refusal was', () => {
    const merged = mergeStops([stopsOf(byId.get('terms-0913')!, judge, pairs), stopsOf(byId.get('rivals-0909')!, judge, pairs)])
    expect(stopLines(merged)).toEqual([
      'July against August, until measured',
      'August against September',
      'September against October, until measured',
    ])
  })

  it('compresses only what reads true: "Pairs with September" is exactly August against September and September against October', () => {
    const e = (prevMonth: string, month: string, views: StopEntry['views'] = ['themes'], unmeasured = false): StopEntry => ({ pair: { prevMonth, month }, views, unmeasured })
    expect(stopLines([e('2026-08-01', '2026-09-01'), e('2026-09-01', '2026-10-01')], true)).toEqual(['Pairs with September, for themes'])
    // Not every pair with August: listed one by one.
    expect(stopLines([e('2026-07-01', '2026-08-01'), e('2026-09-01', '2026-10-01')], true)).toEqual([
      'July against August, for themes',
      'September against October, for themes',
    ])
    // Different states are never merged into one line.
    expect(stopLines([e('2026-08-01', '2026-09-01', ['themes'], false), e('2026-09-01', '2026-10-01', ['themes'], true)], true)).toEqual([
      'August against September, for themes',
      'September against October, for themes, until measured',
    ])
    expect(stopLines([e('2026-08-01', '2026-09-01', ['brands', 'themes'])])).toEqual(['August against September, for brands and themes'])
    expect(stopLines([e('2026-08-01', '2026-09-01', ['market', 'themes'])])).toEqual(['August against September'])
  })

  it('prints nothing awaiting a measure for a change that moves no view (an attention-panel freeze)', () => {
    const panel = row({ id: 'panel', changed_at: '2026-09-24T12:16:36.000Z', surface: 'other', field: 'attention_panel' })
    const changes = changesFromLog([panel])
    const lines = ledgerLines({ changes, rows: [panel], reach: [], runFinish: new Map() })
    const view = recordView({ lines, changes, rows: [panel], pair: judge, readingMonth: '2026-09-01', prevMonth: '2026-08-01', block: null })
    expect(view.groups.map((g) => g.key)).toEqual(['check'])
    expect(view.groups[0].lines[0].cells.map((c) => c.state)).toEqual(['blank', 'blank'])
    expect(view.groups[0].lines[0].stops).toEqual([])
    expect(view.aside).toBeNull()
  })

  it('builds the view: groups, cells, the aside and "read with" said once', () => {
    const reach: ReachRow[] = [
      { changeId: 'terms-0913', month: '2026-09-01', population: 'market', touched: 182, inMonth: 654, readThroughRun: 'run-2026-09-20', computedAt: '2026-09-26T14:08:00.000Z' },
      { changeId: 'terms-0913', month: '2026-08-01', population: 'market', touched: 0, inMonth: 377, readThroughRun: 'run-2026-09-20', computedAt: '2026-09-26T14:08:00.000Z' },
    ]
    const runFinish = new Map([['run-2026-09-20', '2026-09-20T12:00:00.000Z']])
    const lines = ledgerLines({ changes: CHANGES, rows: SEALAND_LOG, reach, runFinish })
    const view = recordView({ lines, changes: CHANGES, rows: SEALAND_LOG, pair: judge, readingMonth: '2026-09-01', prevMonth: '2026-08-01', block: null })
    expect(view.months).toEqual(['2026-08-01', '2026-09-01'])
    expect(view.groups.map((g) => g.key)).toEqual(['search', 'check'])
    expect(view.groups[1].lines.map((l) => l.line.surface)).toEqual(['entity_retag'])
    const t13 = view.groups[0].lines.find((l) => l.line.changeId === 'terms-0913')!
    expect(t13.cells).toEqual([
      { month: '2026-08-01', state: 'none', readWith: '2026-09-20T12:00:00.000Z' },
      { month: '2026-09-01', state: 'measured', touched: 182, of: 654, readWith: '2026-09-20T12:00:00.000Z' },
    ])
    // The one update is said beside the group's heading, and not in the cells.
    expect(view.groups[0].readWith).toBe('2026-09-20T12:00:00.000Z')
    expect(cellReadWith(t13.cells[1], view.groups[0])).toBeNull()
    expect(cellReadWith({ ...t13.cells[1], readWith: '2026-09-27T08:30:00.000Z' } as never, view.groups[0])).toBe('2026-09-27T08:30:00.000Z')
    expect(view.aside?.since).toBe('2026-09-17T16:02:56.000Z')
    expect(view.aside?.stops).toEqual([
      'July against August, until measured',
      'August against September',
      'September against October, until measured',
    ])
  })
})
