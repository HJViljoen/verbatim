import { describe, expect, it } from 'vitest'

import {
  CHECK_MIN_VIDEOS, DENSE_MIN_DATED, mayPrintMoved, outcomeOf, pooledCount, populationSet, populationShares, RECHECK_METHOD_VERSION,
  RECHECK_POPULATIONS, recheckRows, sameCheck, themesToCheck, type LensRow, type PopulationVideo,
} from './recheck'
import { bandVerdict } from './verdicts'

// Real figures: lens_readings' body run on staging (Sealand, data to 20 Sep
// 2026) over the populations scripts/comparability-checks.ts built on 26 Sep
// (exec/logs/wp2-scripts-checks-dry-2.log), pooled to the category
// ('industry-other') and the rival-filed videos. August: the market's 377
// videos (351 category, 26 filed under a rival); September so far: 654 (625,
// 29).
const lens = (rows: [string, string, string, number, number][]): LensRow[] =>
  rows.map(([audience, object_kind, object_id, k, n]) => ({ audience, object_kind, object_id, k, n }))
const C = 'industry-other'
const R = 'competitor:Cotopaxi'

const allAug = lens([
  [C, 'denominator', 'videos', 351, 351], [R, 'denominator', 'videos', 26, 26],
  [C, 'kind', 'question', 216, 351], [R, 'kind', 'question', 15, 26],
  [C, 'kind', 'feature_request', 59, 351], [R, 'kind', 'feature_request', 5, 26],
  [C, 'mood', 'positive', 241, 351], [R, 'mood', 'positive', 21, 26],
  [C, 'theme', 'faaa44da-7c45-4750-bf9a-f1e6e08d5502', 42, 351], [C, 'theme', '3f64f05b-28b2-4564-8f15-dbd747ffb0cb', 10, 351],
  ['client', 'denominator', 'videos', 3, 3], ['client', 'kind', 'question', 3, 3],
])
const allSep = lens([
  [C, 'denominator', 'videos', 625, 625], [R, 'denominator', 'videos', 29, 29],
  [C, 'kind', 'question', 317, 625], [R, 'kind', 'question', 17, 29],
  [C, 'kind', 'feature_request', 146, 625], [R, 'kind', 'feature_request', 5, 29],
  [C, 'mood', 'positive', 483, 625], [R, 'mood', 'positive', 15, 29],
  [C, 'theme', 'faaa44da-7c45-4750-bf9a-f1e6e08d5502', 72, 625], [C, 'theme', '3f64f05b-28b2-4564-8f15-dbd747ffb0cb', 2, 625],
  [C, 'theme', 'ce659d82-892e-4383-ae50-1ecca451833b', 10, 625],
])
const denseAug = lens([
  [C, 'denominator', 'videos', 189, 189], [R, 'denominator', 'videos', 11, 11],
  [C, 'kind', 'question', 136, 189], [R, 'kind', 'question', 7, 11],
  [C, 'kind', 'feature_request', 34, 189], [R, 'kind', 'feature_request', 3, 11],
  [C, 'mood', 'positive', 115, 189], [R, 'mood', 'positive', 7, 11],
])
const denseSep = lens([
  [C, 'denominator', 'videos', 263, 263], [R, 'denominator', 'videos', 8, 8],
  [C, 'kind', 'question', 170, 263], [R, 'kind', 'question', 6, 8],
  [C, 'kind', 'feature_request', 90, 263], [R, 'kind', 'feature_request', 3, 8],
  [C, 'mood', 'positive', 200, 263], [R, 'mood', 'positive', 2, 8],
])
const cleanAug = lens([[C, 'denominator', 'videos', 78, 78], [C, 'kind', 'feature_request', 13, 78], [C, 'kind', 'question', 50, 78]])
const cleanSep = lens([[C, 'denominator', 'videos', 103, 103], [C, 'kind', 'feature_request', 24, 103], [C, 'kind', 'question', 52, 103]])

describe('the populations', () => {
  const v = (id: string, dated: number, segment: PopulationVideo['segment'], outside = false, ambiguous = false): PopulationVideo =>
    ({ id, dated, segment, outside, ambiguous })
  // Structural stand-ins (ids and counts are not volumes).
  const videos = [
    v('a', 25, 'market'), v('b', 3, 'maker'), v('c', 40, 'noise'), v('d', 1, 'market', true), v('e', 20, 'market', false, true), v('f', 19, 'market'),
  ]

  it('builds each set from the month market: the searches both months ran without makers, off-topic or ambiguous videos; well-read; all but off-topic', () => {
    expect(RECHECK_POPULATIONS).toEqual(['same_searches_clean', 'dense20', 'all_but_noise'])
    expect(DENSE_MIN_DATED).toBe(20)
    expect(populationSet(videos, 'same_searches_clean')).toEqual({ population: 'same_searches_clean', ids: ['a', 'f'], base: 4, makers: 1, noise: 1, ambiguous: 1, minDated: 1 })
    expect(populationSet(videos, 'dense20')).toEqual({ population: 'dense20', ids: ['a', 'c', 'e'], base: 3, makers: 0, noise: 1, ambiguous: 0, minDated: 20 })
    expect(populationSet(videos, 'all_but_noise')).toEqual({ population: 'all_but_noise', ids: ['a', 'b', 'd', 'e', 'f'], base: 6, makers: 1, noise: 1, ambiguous: 0, minDated: 1 })
  })

  it("prints the base's maker and off-topic shares over both months (staging: the same searches held 203 and 249 videos, 90 and 131 makers, 35 and 15 off-topic)", () => {
    const set = (base: number, makers: number, noise: number) => ({ population: 'same_searches_clean' as const, ids: [], base, makers, noise, ambiguous: 0, minDated: 1 })
    expect(populationShares(set(203, 90, 35), set(249, 131, 15))).toEqual({ makers: 0.4889, noise: 0.1106 })
    expect(populationShares(set(0, 0, 0), set(0, 0, 0))).toBeNull()
  })
})

describe('pooledCount', () => {
  it('pools every audience but the client for kinds and mood, and reads themes on the category alone', () => {
    expect(pooledCount(allAug, { kind: 'kind', id: 'question' })).toEqual({ k: 231, n: 377 })
    expect(pooledCount(allAug, { kind: 'mood', id: 'positive' })).toEqual({ k: 262, n: 377 })
    expect(pooledCount(allAug, { kind: 'theme', id: 'faaa44da-7c45-4750-bf9a-f1e6e08d5502' })).toEqual({ k: 42, n: 351 })
    expect(pooledCount(allAug, { kind: 'kind', id: 'misinformation' })).toEqual({ k: 0, n: 377 })
  })

  it('re-checks the themes the whole market holds on ten videos or more in either month', () => {
    expect(themesToCheck(allAug, allSep)).toEqual(['3f64f05b-28b2-4564-8f15-dbd747ffb0cb', 'ce659d82-892e-4383-ae50-1ecca451833b', 'faaa44da-7c45-4750-bf9a-f1e6e08d5502'])
  })
})

describe('the outcome', () => {
  const rows = recheckRows({
    clientId: 'ac16988e-c4f3-4baf-b388-73895852a554', prevMonth: '2026-08-01', month: '2026-09-01',
    objects: [{ kind: 'kind', id: 'question', label: 'Asking how it works' }, { kind: 'kind', id: 'feature_request', label: 'Asking for something' }, { kind: 'mood', id: 'positive', label: 'Positive' }],
    whole: { prev: allAug, curr: allSep },
    populations: [
      { sets: { prev: { population: 'same_searches_clean', ids: [], base: 203, makers: 90, noise: 35, ambiguous: 0, minDated: 1 }, curr: { population: 'same_searches_clean', ids: [], base: 249, makers: 131, noise: 15, ambiguous: 0, minDated: 1 } }, lens: { prev: cleanAug, curr: cleanSep } },
      { sets: { prev: { population: 'dense20', ids: [], base: 200, makers: 49, noise: 81, ambiguous: 0, minDated: 20 }, curr: { population: 'dense20', ids: [], base: 271, makers: 86, noise: 18, ambiguous: 0, minDated: 20 } }, lens: { prev: denseAug, curr: denseSep } },
    ],
    readThroughRun: 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4',
  })
  const get = (population: string, id: string) => rows.find((r) => r.population === population && r.object_id === id)!

  it('reads "too few" on the searches both months ran when a side holds under 100 videos (staging August: 78)', () => {
    expect(CHECK_MIN_VIDEOS).toBe(100)
    expect(get('same_searches_clean', 'feature_request')).toMatchObject({ k_prev: 13, n_prev: 78, k_curr: 24, n_curr: 103, outcome: 'too_few', population_makers: 0.4889, population_noise: 0.1106 })
    expect(rows.filter(mayPrintMoved)).toEqual([])
  })

  it('reads a fall the whole market shows but well-read videos do not as following depth (questions: 231 of 377 to 334 of 654; 143 of 200 to 176 of 271)', () => {
    const whole = bandVerdict({ objectKind: 'kind', objectId: 'question', objectLabel: 'q', audience: 'market', window: { kind: 'month', from: '2026-09-01', to: '2026-10-01' }, value: { k: 334, n: 654 }, baseline: { k: 231, n: 377 } })
    expect(whole.state).toBe('moved')
    expect(whole.changePts).toBeLessThan(0)
    expect(get('dense20', 'question')).toMatchObject({ k_prev: 143, n_prev: 200, k_curr: 176, n_curr: 271, outcome: 'follows_depth' })
  })

  it('keeps a well-read "moved" as moved, which never prints alone (wishes: 37 of 200 to 93 of 271)', () => {
    const r = get('dense20', 'feature_request')
    expect(r).toMatchObject({ k_prev: 37, n_prev: 200, k_curr: 93, n_curr: 271, outcome: 'moved' })
    expect(r.verdict.state).toBe('moved')
    expect(mayPrintMoved(r)).toBe(false)
    expect(mayPrintMoved({ population: 'same_searches_clean', outcome: 'moved' })).toBe(true)
  })

  it('reads mood on its positive share over the judged videos', () => {
    expect(get('dense20', 'positive')).toMatchObject({ k_prev: 122, n_prev: 200, k_curr: 202, n_curr: 271, object_kind: 'mood' })
  })

  it('carries the verdict, the read-through run and the method on every row', () => {
    for (const r of rows) {
      expect(r.verdict.window).toEqual({ kind: 'month', from: '2026-09-01', to: '2026-10-01' })
      expect(r.verdict.basis).toEqual({ from: '2026-08-01', to: '2026-09-01' })
      expect(r.read_through_run).toBe('b67b56de-17b6-429d-b5f7-e53a3c37f7d4')
      expect(r.method_version).toBe(RECHECK_METHOD_VERSION)
    }
  })

  it('never reads NaN or an empty side as a change', () => {
    const v = bandVerdict({ objectKind: 'kind', objectId: 'x', objectLabel: 'x', audience: 'market', window: { kind: 'month', from: '2026-09-01', to: '2026-10-01' }, value: { k: 0, n: 0 }, baseline: { k: 0, n: 0 } })
    expect(outcomeOf('all_but_noise', v, null)).toBe('too_few')
    expect(outcomeOf('dense20', { ...v, state: 'moved', baseline: { k: 5, n: 50 }, value: { k: 50, n: 150 } }, null)).toBe('too_few')
  })

  it('writes a recompute that changed nothing as nothing (a held row read back from the database)', () => {
    const r = get('dense20', 'feature_request')
    expect(sameCheck({ ...r, population_makers: '0.2877' as unknown as number, population_noise: String(r.population_noise) as unknown as number }, { ...r, population_makers: 0.2877 })).toBe(true)
    expect(sameCheck({ ...r, k_curr: 94 }, r)).toBe(false)
    expect(sameCheck({ ...r, read_through_run: 'another' }, r)).toBe(false)
  })
})
