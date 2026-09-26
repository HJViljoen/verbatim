import { describe, expect, it } from 'vitest'

import {
  decidingGathers, evidenceTerms, firstSearched, gatherHealth, gathersOf, isOutside, median, oneReachRowEach, plannedSearches, populations,
  reachOf, searchKey, termDelta, unchangedSearches, type KeywordRow, type MonthVideo, type ReachRowPlan,
} from './searches'

// Sealand's search eras, exact at the gather (GC F28; the WP0.1 staging
// export's keyword_performance): era A to the morning of 9 Sep, era B from the
// 9 Sep 18:17 gather, era C from 13 Sep. Two platforms keep the fixture small.
const ERA_A = ['#sealandgear', 'cotopaxi', 'eco backpack', 'freitag', 'patagonia', 'poler', 'recycled bag',
  'sealand gear', 'sealandgear', 'sustainable backpack', 'sustainable bags', 'topo designs', 'upcycled bag']
const KEPT = ['#sealandgear', 'eco backpack', 'recycled bag', 'sealand gear', 'sustainable backpack', 'upcycled bag']
const ADDED_9 = ['cotopaxi backpack', 'freitag bag', 'rareform bag', 'recycled sailcloth', 'sailcloth bag', 'sealand bag', 'upcycled backpack']
const ADDED_13 = ['frtg', 'handmade bag', 'sustainable fashion', 'travel gear']
const rows = (run: string, at: string, terms: string[], platforms = ['tiktok', 'reddit']): KeywordRow[] =>
  platforms.flatMap((p) => terms.map((t) => ({ run_id: run, platform: p, keyword: t, created_at: at })))
const KP: KeywordRow[] = [
  ...rows('2039968a', '2026-07-09T13:20:55Z', ERA_A),
  ...rows('c704eab3', '2026-08-17T10:57:31Z', ERA_A),
  ...rows('c704eab3', '2026-08-17T10:59:00Z', ['r/Backpacks'], ['reddit']),
  ...rows('cb0d97b2', '2026-09-09T18:17:56Z', [...KEPT, ...ADDED_9]),
  ...rows('cb0d97b2', '2026-09-09T18:34:00Z', ['r/backpacks', 'r/onebag'], ['reddit']),
  ...rows('5a2ebc43', '2026-09-13T10:12:30Z', [...KEPT, ...ADDED_9, ...ADDED_13]),
  ...rows('5a2ebc43', '2026-09-13T10:20:00Z', ['r/backpacks', 'r/onebag'], ['reddit']),
]
const RUNS = [
  { id: '2039968a', status: 'completed' },
  { id: 'c704eab3', status: 'completed' },
  { id: 'cb0d97b2', status: 'completed' },
  { id: '5a2ebc43', status: 'failed', config_snapshot: {
    platforms: ['tiktok', 'reddit'], brand_keywords: ['sealand gear'], competitor_keywords: ['frtg'], industry_keywords: ['handmade bag', 'upcycled bag'],
    subreddits: [{ name: 'onebag', status: 'active' }, { name: 'travelgear', status: 'candidate' }],
  } },
]
const GATHERS = gathersOf(KP, RUNS)

describe('the gathers and what ran unchanged', () => {
  it('dates a gather by its first keyword row, oldest first, and folds a community name’s case', () => {
    expect(GATHERS.map((g) => `${g.runId}@${g.at}`)).toEqual([
      '2039968a@2026-07-09T13:20:55Z', 'c704eab3@2026-08-17T10:57:31Z', 'cb0d97b2@2026-09-09T18:17:56Z', '5a2ebc43@2026-09-13T10:12:30Z',
    ])
    expect(GATHERS[1].searches.has(searchKey('reddit', 'r/backpacks'))).toBe(true)
  })

  it('August against September: only the six era-A terms kept on 9 Sep, and r/backpacks, ran in every gather', () => {
    const u = unchangedSearches(GATHERS, '2026-08-01T00:00:00Z', '5a2ebc43')
    const terms = new Set([...u].map((k) => k.split('\u0000')[1]))
    expect([...terms].sort()).toEqual([...KEPT, 'r/backpacks'].sort())
    expect(u.has(searchKey('tiktok', 'r/backpacks'))).toBe(false)
    expect(unchangedSearches(GATHERS, '2026-08-01T00:00:00Z', 'no-such-run').size).toBe(0)
  })

  it('a gather that fell short does not decide what ran unchanged; gather health counts it', () => {
    // 5a2ebc43 is the fixture's failed gather: left out, the answer above holds.
    expect(decidingGathers(GATHERS, '2026-08-01T00:00:00Z', '5a2ebc43').left.map((g) => g.runId)).toEqual(['5a2ebc43'])
    // A capped run (a stand-in, partial) that reached only four of the kept
    // terms: without the rule, the two it skipped would read as changed and
    // every video only they found would count as outside.
    const capped = gathersOf([...KP, ...rows('capped00', '2026-09-20T08:00:00Z', KEPT.slice(0, 4))], [...RUNS, { id: 'capped00', status: 'partial' }])
    const terms = (u: Set<string>) => [...new Set([...u].map((k) => k.split('\u0000')[1]))].sort()
    expect(terms(unchangedSearches(capped, '2026-08-01T00:00:00Z', 'capped00'))).toEqual([...KEPT, 'r/backpacks'].sort())
    // A span of nothing but short gathers falls back to all of them.
    expect(decidingGathers(capped, '2026-09-13T00:00:00Z', 'capped00')).toEqual({ deciding: capped.slice(-2), left: [] })
  })

  it('knows when each term was first searched', () => {
    const first = firstSearched(GATHERS)
    expect(first.get('handmade bag')).toBe('2026-09-13T10:12:30Z')
    expect(first.get('upcycled bag')).toBe('2026-07-09T13:20:55Z')
  })
})

describe('search-outside', () => {
  const u = unchangedSearches(GATHERS, '2026-08-01T00:00:00Z', '5a2ebc43')
  const v = (id: string, platform = 'tiktok'): MonthVideo => ({ id, platform, audience: 'industry-other', dated: 3 })

  it('a video surfaced by any unchanged search is inside', () => {
    expect(isOutside(v('a'), evidenceTerms([['handmade bag', 'upcycled bag']]), u)).toBe(false)
  })

  it('first found by a removed term, resurfaced by an unchanged one: inside', () => {
    expect(isOutside(v('b'), evidenceTerms([['poler'], ['Upcycled Bag ']]), u)).toBe(false)
  })

  it('found only by new or removed terms, or by nothing we hold: outside', () => {
    expect(isOutside(v('c'), evidenceTerms([['handmade bag', 'travel gear']]), u)).toBe(true)
    expect(isOutside(v('d'), evidenceTerms([['poler']]), u)).toBe(true)
    expect(isOutside(v('e'), evidenceTerms([]), u)).toBe(true)
  })

  it('a search is per platform: r/backpacks never ran on TikTok', () => {
    expect(isOutside(v('f', 'reddit'), evidenceTerms([['r/backpacks']]), u)).toBe(false)
    expect(isOutside(v('g', 'tiktok'), evidenceTerms([['r/backpacks']]), u)).toBe(true)
  })
})

describe('a search change and its reach', () => {
  it('reads the reconstruction’s one term a row (the 9 Sep swap)', () => {
    const swap = [
      ...['cotopaxi', 'poler'].map((t) => ({ surface: 'terms' as const, before: t, after: null })),
      ...['cotopaxi backpack', 'sealand bag'].map((t) => ({ surface: 'terms' as const, before: null, after: t })),
    ]
    const d = termDelta(swap)
    expect([...d.removed].sort()).toEqual(['cotopaxi', 'poler'])
    expect([...d.added].sort()).toEqual(['cotopaxi backpack', 'sealand bag'])
  })

  it('reads the 13 Sep hand SQL (added list, no before) and the trigger’s whole arrays', () => {
    expect([...termDelta([{ surface: 'terms', before: null, after: ADDED_13 }]).added].sort()).toEqual([...ADDED_13].sort())
    const trig = termDelta([{ surface: 'terms', before: ['a', 'b'], after: ['b', 'c'] }])
    expect([...trig.added]).toEqual(['c'])
    expect([...trig.removed]).toEqual(['a'])
  })

  it('skips exclusions: the 17 Sep script’s exclude_terms row names no search', () => {
    const d = termDelta([
      { surface: 'terms', field: 'competitor_keywords', before: ['frtg'], after: ['frtg', 'north face backpack'] },
      { surface: 'terms', field: 'exclude_terms', before: [], after: ['volcano', 'friday'] },
    ])
    expect([...d.added]).toEqual(['north face backpack'])
    expect(d.removed.size).toBe(0)
  })

  it('reads a community change through the active set only', () => {
    const d = termDelta([{ surface: 'subreddits', before: [{ name: 'backpacks', status: 'active' }], after: [{ name: 'backpacks', status: 'active' }, { name: 'onebag', status: 'active' }, { name: 'travelgear', status: 'candidate' }] }])
    expect([...d.added]).toEqual(['r/onebag'])
    expect(d.removed.size).toBe(0)
    expect(termDelta([{ surface: 'cadence', before: 'weekly', after: 'monthly' }]).added.size).toBe(0)
  })

  it('reaches the month’s videos found by the change’s terms and nothing else', () => {
    const vids: MonthVideo[] = ['a', 'b', 'c', 'd'].map((id) => ({ id, platform: 'tiktok', audience: 'industry-other', dated: 1 }))
    const ev = new Map([
      ['a', evidenceTerms([['handmade bag']])],
      ['b', evidenceTerms([['handmade bag', 'upcycled bag']])],
      ['c', evidenceTerms([['travel gear', 'frtg']])],
      ['d', evidenceTerms([])],
    ])
    expect(reachOf({ added: new Set(ADDED_13), removed: new Set() }, vids, ev).map((x) => x.id)).toEqual(['a', 'c'])
    expect(reachOf({ added: new Set(), removed: new Set() }, vids, ev)).toEqual([])
  })
})

describe('the rest of a pair row', () => {
  it('splits the market from the category', () => {
    const p = populations([
      { id: 'a', platform: 'tiktok', audience: 'industry-other', dated: 1 },
      { id: 'b', platform: 'tiktok', audience: 'competitor:Cotopaxi', dated: 1 },
    ])
    expect(p.market).toHaveLength(2)
    expect(p.category.map((x) => x.id)).toEqual(['a'])
  })

  it('median is percentile_cont(0.5)', () => {
    expect(median([1, 3, 12, 20])).toBe(7.5)
    expect(median([23])).toBe(23)
    expect(median([])).toBeNull()
  })

  it('plans a run’s searches from its snapshot, and counts the ones it did not run', () => {
    const planned = plannedSearches(RUNS[3].config_snapshot, true)!
    expect(planned.has(searchKey('reddit', 'r/onebag'))).toBe(true)
    expect(planned.has(searchKey('reddit', 'r/travelgear'))).toBe(false)
    expect(plannedSearches(null, true)).toBeNull()
    // September: two gathers; the 13 Sep one ran every planned search; the 9 Sep one has no snapshot.
    expect(gatherHealth(GATHERS, '2026-09-01')).toEqual({ month: '2026-09-01', runs: 2, partial: 1, searches_short: 0, unplanned: 1 })
    expect(gatherHealth(GATHERS, '2026-08-15')).toEqual({ month: '2026-08-01', runs: 1, partial: 0, searches_short: 0, unplanned: 1 })
  })
})

// The staging dry run of measure-comparability (26 Sep, read through the
// 20 Sep update b67b56de) with the gate fix stood in at 26 Sep 12:00: it falls
// inside both (Jul, Aug) and (Aug, Sep), so August's reach was planned twice
// (16 rows, 4 of them repeated keys) and the --apply insert failed on
// config_change_reach's primary key. The change id is a stand-in: the real row
// is written by log-tracking-eras on 30 Sep.
describe('one reach row per change, month and population', () => {
  const GATE = '(stand-in: the gate_rule change id)'
  const UPDATE_20_SEP = 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4'
  const finished: Record<string, string> = { [UPDATE_20_SEP]: '2026-09-20T08:33:47.358+00:00', '5a2ebc43': '2026-09-13T10:12:30Z' }
  const at = (id: string | null) => (id ? finished[id] ?? null : null)
  const row = (month: string, population: 'market' | 'category', k: number, n: number, run = UPDATE_20_SEP): ReachRowPlan =>
    ({ change_id: GATE, month, population, videos_touched: k, videos_in_month: n, read_through_run: run })
  // As the pair loop plans them: (Jul, Aug) prev then curr, then (Aug, Sep).
  const julAug = [row('2026-07-01', 'market', 0, 27), row('2026-08-01', 'market', 0, 377), row('2026-07-01', 'category', 0, 26), row('2026-08-01', 'category', 0, 351)]
  const augSep = [row('2026-08-01', 'market', 0, 377), row('2026-09-01', 'market', 65, 654), row('2026-08-01', 'category', 0, 351), row('2026-09-01', 'category', 64, 625)]

  it('two adjacent pairs that share a change write August once', () => {
    const out = oneReachRowEach([...julAug, ...augSep], at)
    expect(out).toHaveLength(6)
    expect(out.map((r) => `${r.month.slice(0, 7)} ${r.population} ${r.videos_touched}/${r.videos_in_month}`)).toEqual([
      '2026-07 market 0/27', '2026-08 market 0/377', '2026-07 category 0/26', '2026-08 category 0/351',
      '2026-09 market 65/654', '2026-09 category 64/625',
    ])
    expect(new Set(out.map((r) => `${r.change_id}|${r.month}|${r.population}`)).size).toBe(out.length)
  })

  it('keeps the copy read through the later update where two differ', () => {
    const earlier = row('2026-08-01', 'market', 0, 377, '5a2ebc43')
    expect(oneReachRowEach([earlier, row('2026-08-01', 'market', 0, 377)], at)[0].read_through_run).toBe(UPDATE_20_SEP)
    expect(oneReachRowEach([row('2026-08-01', 'market', 0, 377), earlier], at)[0].read_through_run).toBe(UPDATE_20_SEP)
    expect(oneReachRowEach([row('2026-08-01', 'market', 0, 377, 'unknown'), earlier], at)[0].read_through_run).toBe('5a2ebc43')
  })

  it('leaves distinct changes and populations alone', () => {
    const other = { ...row('2026-08-01', 'market', 0, 377), change_id: '(stand-in: the attribution change id)' }
    expect(oneReachRowEach([...augSep, other], at)).toHaveLength(5)
  })
})
