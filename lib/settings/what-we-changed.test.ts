import { describe, it, expect } from 'vitest'

import type { ConfigChange } from '../config-log'
import { changesFromLog } from '../reading/comparability'
import { SURFACE_WORDS } from './change-log'
import { changeDetail, changeWords, handlesWords, ledgerLines, ledgerMonths, otherRows, reachCell, rivalsMoved, termsMoved, type ReachRow } from './what-we-changed'

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
    expect(lines[0].items).toEqual({ added: ['frtg', 'handmade bag', 'sustainable fashion', 'travel gear'], removed: [] })
    expect(lines[1].items?.removed).toEqual(OUT)
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
