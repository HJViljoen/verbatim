import { describe, expect, it } from 'vitest'

import {
  addedOnlyOf, communityDelta, decidingGathers, evidenceTerms, firstSearched, gatherHealth, gathersOf, isAddedOnly, isOutside, median, monthShareWord,
  namedCommunities, oneReachRowEach, plannedSearches, populations, reachOf, sameJson, searchKey, searchesFirstRunIn, termDelta, unchangedSearches,
  type KeywordRow, type MonthVideo, type ReachRowPlan,
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

// ---- A community change, read against the gathers (the 9 Sep line) ---------------------
//
// Staging (a production copy to 20 Sep), read 26 Sep. The change log's 9 Sep
// community rows are the Phase 0 reconstruction's, stamped at midnight with
// today's status: r/backpacks and r/travelgear probed, candidate to active;
// r/minimalism and r/cycling probed, rejected; r/onebag, r/southafrica and
// r/capetown proposed as candidates, the last two probed, rejected.
// keyword_performance's Reddit communities by gather (dated by its first row):
// r/backpacks in all six from 17 Aug 07:04; r/travelgear from 9 Sep 10:30;
// r/onebag from 9 Sep 18:17. The two July gathers ran none.
const recon = (at: string, name: string, before: string | null, after: string) => ({
  surface: 'subreddits' as const, changed_at: at, source: 'reconstructed',
  before: before ? { name, status: before } : null, after: { name, status: after },
})
const sep9 = (name: string, before: string | null, after: string) => recon('2026-09-09T00:00:00+00:00', name, before, after)
const SEP9_ROWS = [
  sep9('backpacks', 'candidate', 'active'), sep9('travelgear', 'candidate', 'active'),
  sep9('minimalism', 'candidate', 'rejected'), sep9('cycling', 'candidate', 'rejected'),
  sep9('onebag', null, 'candidate'), sep9('southafrica', null, 'candidate'), sep9('southafrica', 'candidate', 'rejected'),
  sep9('capetown', null, 'candidate'), sep9('capetown', 'candidate', 'rejected'),
]
const THREE = ['r/backpacks', 'r/travelgear', 'r/onebag']
const SEALAND_COMMUNITY_GATHERS = gathersOf([
  ...rows('g0706', '2026-07-06T04:19:00Z', ['upcycled bag'], ['reddit']),
  ...rows('g0709', '2026-07-09T13:20:55Z', ['upcycled bag'], ['reddit']),
  ...rows('g0817a', '2026-08-17T07:04:33Z', ['upcycled bag', 'r/backpacks'], ['reddit']),
  ...rows('g0817b', '2026-08-17T10:57:31Z', ['upcycled bag', 'r/backpacks'], ['reddit']),
  ...rows('g0909a', '2026-09-09T10:30:31Z', ['upcycled bag', 'r/backpacks', 'r/travelgear'], ['reddit']),
  ...rows('g0909b', '2026-09-09T18:17:56Z', ['upcycled bag', ...THREE], ['reddit']),
  ...rows('g0913', '2026-09-13T10:12:30Z', ['upcycled bag', ...THREE], ['reddit']),
  ...rows('g0920', '2026-09-20T04:18:34Z', ['upcycled bag', ...THREE], ['reddit']),
], [])
const sorted = (xs: Set<string>): string[] => [...xs].sort()

describe('a community change, read against the gathers', () => {
  it('read as they stand, the 9 Sep rows name r/backpacks and r/travelgear (the Record’s wrong line)', () => {
    const d = communityDelta(SEP9_ROWS)
    expect(sorted(d.added)).toEqual(['r/backpacks', 'r/travelgear'])
    expect(d.removed.size).toBe(0)
  })

  it('against the gathers, the 9 Sep change added r/onebag and r/travelgear: r/backpacks has run since 17 Aug', () => {
    const d = communityDelta(SEP9_ROWS, SEALAND_COMMUNITY_GATHERS)
    expect(sorted(d.added)).toEqual(['r/onebag', 'r/travelgear'])
    expect(d.removed.size).toBe(0)
    expect(sorted(termDelta(SEP9_ROWS, SEALAND_COMMUNITY_GATHERS).added)).toEqual(['r/onebag', 'r/travelgear'])
  })

  it('reaches the videos r/onebag or r/travelgear alone found, never those r/backpacks found', () => {
    const vids: MonthVideo[] = ['onebag', 'travelgear', 'backpacks', 'both'].map((id) => ({ id, platform: 'reddit', audience: 'industry-other', dated: 1 }))
    const ev = new Map([
      ['onebag', evidenceTerms([['r/onebag']])],
      ['travelgear', evidenceTerms([['r/travelgear']])],
      ['backpacks', evidenceTerms([['r/backpacks']])],
      ['both', evidenceTerms([['r/onebag', 'r/backpacks']])],
    ])
    expect(reachOf(termDelta(SEP9_ROWS, SEALAND_COMMUNITY_GATHERS), vids, ev).map((v) => v.id)).toEqual(['onebag', 'travelgear'])
    expect(reachOf(termDelta(SEP9_ROWS), vids, ev).map((v) => v.id)).toEqual(['travelgear', 'backpacks'])
  })

  it('Össur (staging): 23 Aug added r/amputee and r/prosthetics, not r/bionics (first run 30 Aug); its 13 Sep re-probe moved nothing', () => {
    const OSSUR_GATHERS = gathersOf([
      ...rows('o0823', '2026-08-23T04:06:01Z', ['r/amputee', 'r/prosthetics'], ['reddit']),
      ...rows('o0830a', '2026-08-30T04:11:44Z', ['r/amputee', 'r/prosthetics', 'r/bionics'], ['reddit']),
      ...rows('o0830b', '2026-08-30T08:27:00Z', ['r/amputee', 'r/prosthetics', 'r/bionics'], ['reddit']),
      ...rows('o0906', '2026-09-06T04:07:00Z', ['r/amputee', 'r/prosthetics', 'r/bionics'], ['reddit']),
      ...rows('o0913', '2026-09-13T04:11:00Z', ['r/amputee', 'r/prosthetics', 'r/bionics'], ['reddit']),
    ], [])
    const aug23 = [
      recon('2026-08-23T00:00:00+00:00', 'amputee', 'candidate', 'active'),
      recon('2026-08-23T00:00:00+00:00', 'prosthetics', 'candidate', 'active'),
      recon('2026-08-23T00:00:00+00:00', 'bionics', null, 'candidate'),
    ]
    expect(sorted(communityDelta(aug23, OSSUR_GATHERS).added)).toEqual(['r/amputee', 'r/prosthetics'])
    const sep13 = [recon('2026-09-13T00:00:00+00:00', 'bionics', 'candidate', 'active')]
    expect(sorted(communityDelta(sep13).added)).toEqual(['r/bionics'])
    expect(communityDelta(sep13, OSSUR_GATHERS)).toEqual({ added: new Set(), removed: new Set() })
  })

  it('reads a trigger row as it stands, gathers or not: it is the record itself', () => {
    const trig = { surface: 'subreddits' as const, changed_at: '2026-09-20T04:04:05Z', source: 'trigger',
      before: [{ name: 'backpacks', status: 'active' }, { name: 'travelbackpacks', status: 'candidate' }],
      after: [{ name: 'backpacks', status: 'active' }, { name: 'travelbackpacks', status: 'active' }] }
    expect(sorted(communityDelta([trig], SEALAND_COMMUNITY_GATHERS).added)).toEqual(['r/travelbackpacks'])
  })

  it('switches a community off on the day it last ran, once a later gather ran without it (a rule check, not a Sealand event)', () => {
    const off = [recon('2026-09-13T00:00:00+00:00', 'travelgear', 'active', 'rejected')]
    const without = gathersOf([
      ...rows('a', '2026-09-09T10:30:31Z', ['r/backpacks', 'r/travelgear'], ['reddit']),
      ...rows('b', '2026-09-13T10:12:30Z', ['r/backpacks', 'r/travelgear'], ['reddit']),
      ...rows('c', '2026-09-20T04:18:34Z', ['r/backpacks'], ['reddit']),
    ], [])
    expect(communityDelta(off, without)).toEqual({ added: new Set(), removed: new Set(['r/travelgear']) })
    // No gather after the day yet: nothing shows it stopped.
    expect(communityDelta(off, without.slice(0, 2)).removed.size).toBe(0)
  })

  it('names every community a side holds, whatever its status', () => {
    expect(sorted(namedCommunities({ name: 'OneBag', status: 'candidate' }))).toEqual(['onebag'])
    expect(sorted(namedCommunities([{ name: 'backpacks', status: 'active' }, { name: 'edc', status: 'rejected' }, 'r/TravelGear']))).toEqual(['backpacks', 'edc', 'travelgear'])
    expect(sorted(namedCommunities('backpacks, onebag'))).toEqual(['backpacks', 'onebag'])
    expect(namedCommunities(null).size).toBe(0)
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

describe('sameJson: a pair row read back from jsonb is the row about to be written (staging MF1 rehearsal, 26 Sep)', () => {
  // The gate fix's category entry and August's late capture as
  // measure-comparability writes them, and as jsonb hands them back (keys
  // shorter first). The rehearsal's figures: 64 of 625, 4,923 of 10,188.
  const written = {
    code_changes: [{ change_id: 'gate-fix', surface: 'gate_rule', population: 'category', prev: { k: 0, n: 351 }, curr: { k: 64, n: 625 } }],
    late_capture: { month: '2026-08-01', comments: 4923, of: 10188 },
  }
  const readBack = {
    code_changes: [{ curr: { k: 64, n: 625 }, prev: { k: 0, n: 351 }, surface: 'gate_rule', change_id: 'gate-fix', population: 'category' }],
    late_capture: { of: 10188, month: '2026-08-01', comments: 4923 },
  }

  it('matches whatever order the keys come back in, at every depth', () => {
    expect(JSON.stringify(readBack.code_changes)).not.toBe(JSON.stringify(written.code_changes))
    expect(sameJson(readBack.code_changes, written.code_changes)).toBe(true)
    expect(sameJson(readBack.late_capture, written.late_capture)).toBe(true)
    expect(sameJson(null, null)).toBe(true)
  })

  it('still sees a changed figure, a missing key and a reordered array', () => {
    expect(sameJson(readBack.late_capture, { ...written.late_capture, comments: 4924 })).toBe(false)
    expect(sameJson({ month: '2026-08-01', comments: 4923 }, written.late_capture)).toBe(false)
    const two = [{ change_id: 'a' }, { change_id: 'b' }]
    expect(sameJson([...two].reverse(), two)).toBe(false)
  })
})

describe('added only: the month\u2019s videos found only by searches first run in it (WP1.8\u2019s one figure, the 26 Sep ruling)', () => {
  const added = searchesFirstRunIn(firstSearched(GATHERS), '2026-09-01')

  it('September\u2019s searches are the 9 and 13 Sep terms and r/onebag; r/backpacks has run since 17 Aug', () => {
    expect([...added].sort()).toEqual([...ADDED_9, ...ADDED_13, 'r/onebag'].sort())
    expect(added.has('r/backpacks')).toBe(false)
    // A month with no first run in it, and a first run on the next month's first day.
    expect(searchesFirstRunIn(firstSearched(GATHERS), '2026-10-01').size).toBe(0)
    expect([...searchesFirstRunIn(new Map([['a', '2026-09-30T23:59:59Z'], ['b', '2026-10-01T00:00:00Z']]), '2026-09-15')]).toEqual(['a'])
  })

  it('counts a video only when every search that surfaced it was first run in the month', () => {
    expect(isAddedOnly(evidenceTerms([['Handmade Bag'], ['r/onebag']]), added)).toBe(true)
    expect(isAddedOnly(evidenceTerms([['handmade bag', 'upcycled bag']]), added)).toBe(false) // an unchanged search found it too
    expect(isAddedOnly(evidenceTerms([['sealand bag'], ['poler']]), added)).toBe(false) // a search removed on 9 Sep found it too
    expect(isAddedOnly(evidenceTerms([['r/backpacks']]), added)).toBe(false)
  })

  it('never counts a video with no evidence, or one whose provenance is ambiguous', () => {
    expect(isAddedOnly(evidenceTerms([]), added)).toBe(false)
    expect(isAddedOnly(undefined, added)).toBe(false)
    expect(isAddedOnly(evidenceTerms([['travel gear']]), added, 'ambiguous')).toBe(false)
    expect(isAddedOnly(evidenceTerms([['travel gear']]), added, 'reconstructed')).toBe(true)
  })

  it('keeps every video in the base, counted or not', () => {
    const ev = new Map([
      ['a', evidenceTerms([['frtg']])],
      ['b', evidenceTerms([['frtg', 'eco backpack']])],
      ['c', evidenceTerms([['sailcloth bag']])],
      ['d', evidenceTerms([])],
    ])
    const methods: Record<string, string> = { c: 'ambiguous' }
    expect(addedOnlyOf([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }], ev, added, (id) => methods[id])).toEqual({ k: 1, n: 5 })
  })

  it('says the share as the nearest fraction on a fixed ladder', () => {
    expect(monthShareWord(356, 654)).toBe('about half') // staging, market, 54.4%
    expect(monthShareWord(330, 625)).toBe('about half') // staging, category, 52.8%
    expect(monthShareWord(206, 626)).toBe('about a third') // the 13 to 17 Sep subset, 32.9%
    expect(monthShareWord(376, 625)).toBe('about three fifths') // the strict count, 60.2%, never printed this way
    expect(monthShareWord(70, 100)).toBe('about two thirds')
    expect(monthShareWord(12, 100)).toBe('about a tenth')
    expect(monthShareWord(3, 100)).toBe('under a tenth')
    expect(monthShareWord(96, 100)).toBe('almost all')
    expect(monthShareWord(0, 654)).toBe('none')
    expect(monthShareWord(654, 654)).toBe('all')
  })

  it('has no word without a base or for a count that is not one', () => {
    expect(monthShareWord(1, 0)).toBeNull()
    expect(monthShareWord(5, 4)).toBeNull()
    expect(monthShareWord(-1, 4)).toBeNull()
    expect(monthShareWord(Number.NaN, 654)).toBeNull()
    expect(monthShareWord(1.5, 654)).toBeNull()
  })
})
