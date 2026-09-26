import { describe, expect, it } from 'vitest'

import { gathersOf } from '../provenance/searches'
import { JUDGE_VERSION } from '../subjects/types'
import {
  anyOf, boardOf, calibrationStates, carriesOnlyCurrent, currentSearchTerms, evidenceByVideo, excerpt, freshPath, groupOf, inMarket, isFinalRun,
  matchKindTally, membershipPlan, ofN, onlyFrom, pickTargetRun, pooledBy, runsOnDays, schedulesVerdict, searchSetDiff, searchesPerPlatform,
  termsFirstSearchedSince, themeSegments, threeStateCalibration, videoNameHits, videosNamed, type BoardTheme, type TextVideo, type ThemeSegments,
} from './monday-reads'

// Run ids and dates are staging's real Sealand runs (20 Sep b67b56de partial,
// 24 Sep ddbbffe4 still 'analyzing'); the 27 Sep row is a stand-in for the run
// production will hold on Monday.
const RUNS = [
  { id: '5a2ebc43-9b7b-4c88-a2db-893b5fd643c5', status: 'failed', started_at: '2026-09-15T08:21:22Z', scheduled_for: null, clustering_key: null },
  { id: 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4', status: 'partial', started_at: '2026-09-20T04:02:57Z', scheduled_for: '2026-09-20T04:00:00Z', clustering_key: null },
  { id: 'ddbbffe4-2605-45cc-a251-e6592fc2ed08', status: 'analyzing', started_at: '2026-09-24T12:16:54Z', scheduled_for: null, clustering_key: null },
]
const STAND_IN_27 = { id: '27270000-0000-4000-8000-000000000000', status: 'completed', started_at: '2026-09-27T04:00:05Z', scheduled_for: '2026-09-27T04:00:00Z', clustering_key: 'r1' }

describe('pickTargetRun: the run the grounding reads after', () => {
  it('takes the run scheduled for the day', () => {
    const t = pickTargetRun([...RUNS, STAND_IN_27], '2026-09-27')
    expect(t.how).toBe('run-day')
    expect(t.run?.id).toBe(STAND_IN_27.id)
  })
  it('falls back to the latest run that ended, and says so (staging has no 27 Sep run)', () => {
    const t = pickTargetRun(RUNS, '2026-09-27')
    expect(t.how).toBe('latest-final')
    expect(t.run?.id).toBe('b67b56de-17b6-429d-b5f7-e53a3c37f7d4')
    expect(t.note).toContain('NO RUN ON 2026-09-27')
  })
  it('takes a named run by its prefix, and reports one it cannot find', () => {
    expect(pickTargetRun(RUNS, '2026-09-27', 'ddbbffe4').run?.status).toBe('analyzing')
    expect(pickTargetRun(RUNS, '2026-09-27', 'nope').how).toBe('none')
  })
  it('knows which statuses have ended', () => {
    expect(['completed', 'partial', 'failed', 'cancelled'].every(isFinalRun)).toBe(true)
    expect(isFinalRun('analyzing')).toBe(false)
    expect(isFinalRun(null)).toBe(false)
  })
  it('lists the runs of each day with their key', () => {
    const d = runsOnDays([...RUNS, STAND_IN_27], ['2026-09-20', '2026-09-24', '2026-09-27', '2026-09-26'])
    expect(d.map((x) => x.runs.length)).toEqual([1, 1, 1, 0])
    expect(d[2].runs[0].clustering_key).toBe('r1')
  })
})

describe('schedulesVerdict: every Sealand schedule off, 451aa647 among them', () => {
  it('passes when every row is off and the named one is there', () => {
    expect(schedulesVerdict([{ id: '451aa647-60e3-40de-b2f7-18becc168add', name: 'Weekly', active: false }], '451aa647').pass).toBe(true)
  })
  it('fails on any active row, and on a missing named row', () => {
    const v = schedulesVerdict([{ id: '451aa647-60e3', name: 'Weekly', active: false }, { id: 'aaaa1111', name: 'Monthly', active: true }], '451aa647')
    expect(v.pass).toBe(false)
    expect(v.active).toEqual(['aaaa1111'])
    expect(schedulesVerdict([], '451aa647')).toMatchObject({ pass: false, found: false })
  })
  it('counts a null active as not off', () => {
    expect(schedulesVerdict([{ id: '451aa647', name: null, active: null }], '451aa647').pass).toBe(false)
  })
})

describe('searches', () => {
  const kp = [
    { run_id: 'r20', platform: 'tiktok', keyword: 'upcycled bag', created_at: '2026-09-20T04:10:00Z' },
    { run_id: 'r20', platform: 'youtube', keyword: 'upcycled bag', created_at: '2026-09-20T04:11:00Z' },
    { run_id: 'r27', platform: 'tiktok', keyword: 'upcycled bag', created_at: '2026-09-27T04:10:00Z' },
    { run_id: 'r27', platform: 'tiktok', keyword: 'Sail Cloth Bag', created_at: '2026-09-27T04:12:00Z' },
  ]
  const gathers = gathersOf(kp, [{ id: 'r20', status: 'completed' }, { id: 'r27', status: 'completed' }])
  it('names what one gather ran that the other did not', () => {
    const d = searchSetDiff(gathers.find((g) => g.runId === 'r27'), gathers.find((g) => g.runId === 'r20'))
    expect(d).toEqual({ onlyA: ['tiktok:sail cloth bag'], onlyB: ['youtube:upcycled bag'], same: false })
    expect(searchSetDiff(undefined, gathers[0])).toBeNull()
  })
  it('counts searches per platform', () => {
    expect(searchesPerPlatform(gathers.find((g) => g.runId === 'r20'))).toEqual({ tiktok: 1, youtube: 1 })
  })
  it('keeps the terms first searched on or after a day', () => {
    const first = new Map([['upcycled bag', '2026-07-01T00:00:00Z'], ['sail cloth bag', '2026-09-13T10:00:00Z'], ['r/onebag', '2026-09-09T12:00:00Z']])
    expect([...termsFirstSearchedSince(first, '2026-09-01T00:00:00Z')].sort()).toEqual(['r/onebag', 'sail cloth bag'])
    expect([...termsFirstSearchedSince(first, '2026-09-13T00:00:00Z')]).toEqual(['sail cloth bag'])
  })
  it('builds the current search terms from the three lists and the active communities', () => {
    const t = currentSearchTerms({ brand_keywords: ['Sealand Gear '], competitor_keywords: null, industry_keywords: ['eco backpack'] }, ['onebag'])
    expect([...t].sort()).toEqual(['eco backpack', 'r/onebag', 'sealand gear'])
  })
})

describe('evidence: which searches surfaced a video', () => {
  const earlier = [{ id: 'v1', platform: 'tiktok', video_id: 't1', source_keywords: ['poler'] }]
  const now = [
    { id: 'v1', platform: 'tiktok', video_id: 't1', source_keywords: ['eco backpack'] },
    { id: 'v2', platform: 'youtube', video_id: 'y2', source_keywords: [] },
  ]
  const verdicts = [{ platform: 'youtube', video_id: 'y2', keyword: 'Sail Cloth Bag' }, { platform: 'youtube', video_id: 'zz', keyword: 'orphan' }]
  const ev = evidenceByVideo({ now, earlier, verdicts })
  it('joins the export, the current row and every verdict keyword, normalised', () => {
    expect([...(ev.get('v1') ?? [])].sort()).toEqual(['eco backpack', 'poler'])
    expect([...(ev.get('v2') ?? [])]).toEqual(['sail cloth bag'])
    expect(ev.has('zz')).toBe(false)
  })
  it('only-from needs evidence and every term allowed', () => {
    expect(onlyFrom(ev.get('v2'), new Set(['sail cloth bag']))).toBe(true)
    expect(onlyFrom(ev.get('v1'), new Set(['eco backpack']))).toBe(false)
    expect(onlyFrom(new Set(), new Set(['x']))).toBe(false)
    expect(onlyFrom(undefined, new Set(['x']))).toBe(false)
  })
  it('any-of and carries-only-current', () => {
    expect(anyOf(ev.get('v1'), new Set(['poler']))).toBe(true)
    expect(carriesOnlyCurrent(['Eco backpack'], new Set(['eco backpack']))).toBe(true)
    expect(carriesOnlyCurrent([], new Set(['eco backpack']))).toBe(false)
    expect(carriesOnlyCurrent(['poler', 'eco backpack'], new Set(['eco backpack']))).toBe(false)
  })
})

describe('the market and its pooled levels', () => {
  const market = new Set(['industry-other', 'competitor:Cotopaxi'])
  it('keeps the category and the tracked rivals, never the client or a retired rival', () => {
    expect(inMarket({ is_client: false, is_competitor: false, competitor_name: null }, market)).toBe(true)
    expect(inMarket({ is_client: false, is_competitor: true, competitor_name: 'Cotopaxi' }, market)).toBe(true)
    expect(inMarket({ is_client: false, is_competitor: true, competitor_name: 'Poler' }, market)).toBe(false)
    expect(inMarket({ is_client: true, is_competitor: false, competitor_name: null }, market)).toBe(false)
  })
  it('sums one field over the market audiences, per month and key', () => {
    // Staging's September kinds rows, category and Cotopaxi (two of them), and the client's row left out.
    const rows = [
      { month: '2026-09-01', audience: 'industry-other', kind: 'question', videos: 180 },
      { month: '2026-09-01', audience: 'competitor:Cotopaxi', kind: 'question', videos: 4 },
      { month: '2026-09-01', audience: 'client', kind: 'question', videos: 9 },
      { month: '2026-08-01', audience: 'industry-other', kind: 'question', videos: 101 },
    ]
    expect(pooledBy(rows, market, (r) => r.kind, (r) => r.videos)).toEqual({ '2026-09': { question: 184 }, '2026-08': { question: 101 } })
  })
})

describe('makers and noise on a theme, and the board', () => {
  const vid = (id: string, caption: string, keywords: string[] = ['eco backpack']): TextVideo => ({
    id, caption, hashtags: [], topics: [], source_keywords: keywords, is_client: false, is_competitor: false, competitor_name: null,
  })
  const byId = new Map([
    ['m1', vid('m1', 'Sewing a tote from an old sail')],
    ['m2', vid('m2', 'crochet bag tutorial')],
    ['x1', vid('x1', 'Packing for a week', ['poler'])],
    ['k1', vid('k1', 'My daily carry')],
  ])
  it('counts makers, noise, and a referenced video the read did not return', () => {
    const s = themeSegments(['m1', 'm2', 'x1', 'k1', 'gone', 'm1'], byId)
    expect(s).toEqual({ refs: 5, known: 4, maker: 2, noise: 1, makerShare: 0.5, noiseShare: 0.25 })
  })
  it('groups at half and leaves an unmeasured theme ungrouped', () => {
    expect(groupOf({ refs: 4, known: 4, maker: 2, noise: 0, makerShare: 0.5, noiseShare: 0 })).toBe('makers')
    expect(groupOf({ refs: 4, known: 4, maker: 0, noise: 3, makerShare: 0, noiseShare: 0.75 })).toBe('noise')
    expect(groupOf(null)).toBeNull()
  })
  const seg = (makerShare: number): ThemeSegments => ({ refs: 20, known: 20, maker: Math.round(makerShare * 20), noise: 0, makerShare, noiseShare: 0 })
  const theme = (id: string, k: number, makerShare: number, extra: Partial<BoardTheme> = {}): BoardTheme => ({ id, label: id, kind: 'question', k, matchKind: 'matched', seg: seg(makerShare), ...extra })
  it('draws the board and picks the first row that may lead', () => {
    const b = boardOf([
      theme('upcycling-how-to', 88, 0.9),
      theme('new-this-run', 60, 0.1, { matchKind: 'new' }),
      theme('who-buys', 50, 0.2, { kind: 'demographic_signal' }),
      theme('too-many-makers', 45, 0.3),
      theme('durability', 40, 0.1),
      theme('under-floor', 9, 0),
    ], false)
    expect(b.atFloor).toBe(5)
    expect(b.makers.map((t) => t.id)).toEqual(['upcycling-how-to'])
    expect(b.rows.map((t) => t.id)).toEqual(['new-this-run', 'who-buys', 'too-many-makers', 'durability'])
    expect(b.lead?.id).toBe('durability')
  })
  it('lets a "new" identity lead when the run opened a new clustering regime', () => {
    expect(boardOf([theme('new-this-run', 60, 0.1, { matchKind: 'new' })], true).lead?.id).toBe('new-this-run')
  })
})

describe('the name line', () => {
  it('finds the name in caption, hashtags or account', () => {
    const h = videoNameHits({ caption: 'Loving my new SEALAND tote', hashtags: ['#sealandgear'], account_name: 'someone' })
    expect(h.where).toEqual(['caption', 'hashtags'])
    expect(h.excerpt).toContain('SEALAND')
    expect(videoNameHits({ caption: 'nothing here', hashtags: null, account_name: null }).where).toEqual([])
  })
  it('cuts an excerpt around the match on one line', () => {
    const e = excerpt(`${'a'.repeat(200)}\n Sealand ${'b'.repeat(200)}`, /sealand/i, 40)
    expect(e?.startsWith('…')).toBe(true)
    expect(e?.endsWith('…')).toBe(true)
    expect(e).toContain('Sealand')
    expect(excerpt('no match', /sealand/i)).toBeNull()
  })
})

describe('calibration states', () => {
  // WP1.1's reported production rows: Community & purpose 0.60 on 25, Repair & warranty 0.36 on 33.
  const row = (p: number | string | null, n: number | null, at: string | null = '2026-09-25T12:00:00Z', judge: string | null = JUDGE_VERSION) =>
    ({ calibrated_at: at, calibration_precision: p, calibration_n: n, calibration_judge_version: judge })
  it('reads ready, failed and provisional as WP1.1 does', () => {
    expect(threeStateCalibration(row(0.9, 25))).toBe('ready')
    expect(threeStateCalibration(row('0.60', 25))).toBe('failed')
    expect(threeStateCalibration(row(0.36, 33))).toBe('failed')
    expect(threeStateCalibration(row(0.8, 25))).toBe('provisional')
    expect(threeStateCalibration(row(null, null, null))).toBe('provisional')
    expect(threeStateCalibration(row(0.9, 25, '2026-09-25T12:00:00Z', 'old-judge'))).toBe('provisional')
  })
  it('puts the deployed two states beside them', () => {
    expect(calibrationStates(row(0.9, 25))).toEqual({ deployed: 'ready', wp11: 'ready' })
    expect(calibrationStates(row(0.6, 25))).toEqual({ deployed: 'calibrating', wp11: 'failed' })
  })
})

describe('ofN', () => {
  it('prints k of n with a share, or says not measured', () => {
    expect(ofN(206, 625)).toBe('206 of 625 (33.0%)')
    expect(ofN(3, 0)).toBe('3')
    expect(ofN(null, 625)).toBe('not measured')
  })
})

describe('fewer pages', () => {
  // Staging's 20 Sep run b67b56de: 1,384 observations, exact 707, new 468, strong 161, weak 48.
  const nonExact = [...Array(48).fill('weak'), ...Array(161).fill('strong'), ...Array(468).fill('new')]
  it('counts the exact matches as the total less the kinds read before them', () => {
    const firstPage = [...nonExact, ...Array(1000 - nonExact.length).fill('exact')]
    expect(matchKindTally(firstPage, 1384)).toEqual({ byKind: { exact: 707, new: 468, strong: 161, weak: 48 }, total: 1384 })
  })
  it('reads every row as it is when there is no count', () => {
    const all = [...nonExact, ...Array(707).fill('exact')]
    expect(matchKindTally(all, null)).toEqual({ byKind: { exact: 707, new: 468, strong: 161, weak: 48 }, total: 1384 })
  })
  it('lists no exact row when the whole run is another kind', () => {
    expect(matchKindTally(['new', 'new', 'revived'], 3)).toEqual({ byKind: { new: 2, revived: 1 }, total: 3 })
  })

  const v = (id: string, platform: string) => ({ id, platform, video_id: `${platform}-${id}` })
  const byId = new Map([v('a', 'tiktok'), v('b', 'youtube'), v('c', 'reddit'), v('d', 'instagram'), v('e', 'youtube')].map((x) => [x.id, x]))
  it('lists each video once, in group order, across platforms, leaving out what the export places', () => {
    const plan = membershipPlan([
      { name: 'measured', ids: new Set(['a', 'b', 'c']) },
      { name: 'name line', ids: new Set(['b', 'd']) },
      { name: 'legacy', ids: new Set(['e', 'zz']) },
    ], new Set(['c']), byId, 2)
    expect(plan.chunks.map((c) => c.map((x) => x.id))).toEqual([['a', 'b'], ['d', 'e']])
    expect(plan.toCheck).toEqual({ measured: 2, 'name line': 1, legacy: 1 })
  })
  it('puts staging\'s 50 unplaced videos (48 measured, 2 on the name line) in one request of 100', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `${i}`)
    const many = new Map(ids.map((id, i) => [id, v(id, ['tiktok', 'youtube', 'reddit', 'instagram'][i % 4])]))
    const plan = membershipPlan([{ name: 'measured', ids: new Set(ids.slice(0, 48)) }, { name: 'name line', ids: new Set(ids.slice(48)) }], new Set(), many, 100)
    expect(plan.chunks).toHaveLength(1)
    expect(plan.toCheck).toEqual({ measured: 48, 'name line': 2 })
  })
  it('matches a comment to its video by platform and video id together', () => {
    const chunk = [v('a', 'tiktok'), v('b', 'youtube')]
    expect([...videosNamed(chunk, [{ platform: 'tiktok', video_id: 'tiktok-a' }, { platform: 'reddit', video_id: 'youtube-b' }])]).toEqual(['a'])
  })

  it('never names a file that exists: the second, then a counter', () => {
    const now = new Date('2026-09-26T11:38:12Z')
    const taken = new Set(['/d/snapshot-staging-2026-09-26.json', '/d/snapshot-staging-2026-09-26-113812Z.json', '/d/snapshot-staging-2026-09-26-113812Z-2.json'])
    const exists = (p: string) => taken.has(p)
    expect(freshPath('/d/grounding.json', exists, now)).toBe('/d/grounding.json')
    expect(freshPath('/d/snapshot-staging-2026-09-26.json', (p) => p === '/d/snapshot-staging-2026-09-26.json', now)).toBe('/d/snapshot-staging-2026-09-26-113812Z.json')
    expect(freshPath('/d/snapshot-staging-2026-09-26.json', exists, now)).toBe('/d/snapshot-staging-2026-09-26-113812Z-3.json')
  })
})
