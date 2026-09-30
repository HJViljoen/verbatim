import { describe, expect, it } from 'vitest'

import {
  PAIR_FLAG_NOTE,
  PAIR_NOT_YET,
  PAIR_REFUSED_OURS,
  PAIR_REFUSED_SEARCHES,
  pairSentence,
} from '../calibration'
import { INDUSTRY_AUDIENCE } from '../rivals'
import { directionWord, monthChange, pairedVerdict, type SeriesPoint } from './bands'
import {
  changesFromLog,
  comparabilityOf,
  joins,
  pairOnVerdict,
  VIEWS_BY_SURFACE,
  type OurChange,
  type PairComparability,
  type PairRow,
} from './comparability'
import {
  BRANDS_PANEL,
  CATEGORY_AUDIENCE,
  comparableOn,
  joinedRun,
  laterMonthOf,
  pairJudge,
  pairOn,
  pairTools,
  refuseEveryPair,
  refusedSteps,
  viewForAudience,
} from './pairs'
import { HYPOTHETICAL_RISING_RUN, HYPOTHETICAL_SAME_WAY, HYPOTHETICAL_SEARCHES_UNDER_FLAG } from '../test/pair-fixture'
import { CHANGES, OSSUR_UPDATES, PROBE_0920, row, SEALAND_LOG, SEALAND_SCHEDULE, SEALAND_UPDATES, sealandJudge } from '../test/sealand-pairs'

// Comparability v1 on the verdict (market-first decision D, WP1.3): the pair
// rule, carried onto `monthChange`, `directionWord`, a direct `bandVerdict`
// and a chart's steps. `comparabilityOf` itself is pinned in
// comparability.test.ts; this file pins what a reader is shown.

// ---- Fixtures: real rows, real counts ---------------------------------------------------
//
// Sealand's change log (GC F2), updates (DR F21) and schedule, and Össur's
// updates, are lib/test/sealand-pairs.ts.
//
// LOOKS & STYLE, THE CATEGORY'S ONE MOVING SUBJECT (research §1, prod): 38 of
// August's 351 category videos, 104 of September's 626. Banded alone it reads
// "moved" (10.8% → 16.6%, research: +5.8 against a band of 4.4 on staging).
const LOOKS = { kind: 'subject' as const, id: 'looks-and-style', label: 'Looks & style' }
const aug: SeriesPoint = { month: '2026-08-01', videos: 351, k: 38, audience: INDUSTRY_AUDIENCE, regime: 'n/a' }
const sep: SeriesPoint = { month: '2026-09-01', videos: 626, k: 104, audience: INDUSTRY_AUDIENCE, regime: 'n/a' }

// AUGUST AGAINST SEPTEMBER, MEASURED, as WP1.4 would write it after the 4 Oct
// update: search-outside 81 of 351 (CQ F27) and 206 of 625 (GC F29); depth
// median 23 against 15 (DR F39).
const AUG_SEP: PairRow = {
  prevMonth: '2026-08-01',
  month: '2026-09-01',
  searchOutside: { prev: { k: 81, n: 351 }, curr: { k: 206, n: 625 } },
  codeChanges: [],
  depth: { prevMedian: 23, currMedian: 15 },
  gather: [],
  lateCapture: null,
  readThroughRun: 'run-2026-10-04',
  methodVersion: 'comparability_v1',
  computedAt: '2026-10-05T09:00:00.000Z',
}

// A PAIR READ THE SAME WAY. None exists yet (October against November is the
// first, §2.11), so its row is HYPOTHETICAL_SAME_WAY (lib/test/pair-fixture.ts,
// where every hypothetical value is labelled). The Looks & style counts on both
// sides are August's real 38 of 351, re-dated: a flat pair.
const OCT = { ...aug, month: '2026-10-01' }
const NOV = { ...aug, month: '2026-11-01' }

// THE GATE FIX'S REACH (§2.11): 63 of September's 655 market videos (9.6%, a
// flag) and of the category's 626 (10.1%, a refusal for themes). Dated inside
// October's span here so the pair above carries it.
const GATE: OurChange = { id: 'gate-fix', surface: 'gate_rule', changedAt: '2026-10-05T12:00:00.000Z', note: null, affects: VIEWS_BY_SURFACE.gate_rule }
const GATED: PairRow = {
  ...HYPOTHETICAL_SAME_WAY,
  codeChanges: [
    { changeId: 'gate-fix', surface: 'gate_rule', prev: { k: 0, n: 655 }, curr: { k: 63, n: 655 }, population: 'market' },
    { changeId: 'gate-fix', surface: 'gate_rule', prev: { k: 0, n: 626 }, curr: { k: 63, n: 626 }, population: 'category' },
  ],
}

const judgeAt = (now: string, rows: readonly PairRow[] = [], changes: readonly OurChange[] = CHANGES) => sealandJudge(now, rows, changes)

const change = (pair: PairComparability | null) =>
  monthChange({ object: LOOKS, audience: INDUSTRY_AUDIENCE, curr: sep, prev: aug, comparability: pair })

// ---- monthChange under the rule -----------------------------------------------------------

describe('monthChange: August against September never reads "moved"', () => {
  it('bands "moved" with no pair applied, which is exactly what the rule is for', () => {
    expect(change(null).state).toBe('moved')
  })

  it('no row, the 9, 13 and 17 Sep term changes in span: refused, naming the search change in September', () => {
    for (const now of ['2026-09-20T12:00:00.000Z', '2026-10-02T06:00:00.000Z', '2026-10-11T12:00:00.000Z']) {
      const v = change(judgeAt(now)('2026-08-01', '2026-09-01', 'themes'))
      expect(v.state).not.toBe('moved')
      expect(v.state).toBe('refused')
      expect(v.refusedReason).toBe('tracking_change')
      expect(v.pair).toEqual({ mode: 'refuse', cause: 'searches', changeMonth: '2026-09-01', checkWith: null })
      expect(pairSentence(v.pair!)).toBe('Not read as a change: we changed our searches in September.')
      // This month's counts stay, so its level prints; no change is drawn,
      // and the month before does not travel with a refusal (T0a, the one
      // condition: a refused verdict carries no baseline).
      expect(v.value).toEqual({ k: 104, n: 626 })
      expect(v.baseline).toBeUndefined()
      expect(v.changePts).toBeNull()
    }
  })

  it('a so-far month is never compared, and on 20 Sep and 2 Oct the rule\'s first reason stays first', () => {
    expect(judgeAt('2026-09-20T12:00:00.000Z')('2026-08-01', '2026-09-01', 'themes').reasons[0].kind).toBe('incomplete')
    expect(judgeAt('2026-10-02T06:00:00.000Z')('2026-08-01', '2026-09-01', 'themes').reasons[0].kind).toBe('not_read_to_end')
  })

  it('with no change of ours in its span, a so-far later month says it is not compared until it has ended (R4)', () => {
    const v = change(judgeAt('2026-09-20T12:00:00.000Z', [], [])('2026-08-01', '2026-09-01', 'themes'))
    expect(v.refusedReason).toBe('incomplete')
    expect(v.pair?.cause).toBe('running')
    expect(pairSentence(v.pair!)).toBe('September is not compared until it has ended.')
  })

  it('measured: refused on the searches (206 of 625 is 33%), named by the latest search change', () => {
    const v = change(judgeAt('2026-10-05T12:00:00.000Z', [AUG_SEP])('2026-08-01', '2026-09-01', 'market'))
    expect(v.refusedReason).toBe('tracking_change')
    expect(pairSentence(v.pair!)).toBe(PAIR_REFUSED_SEARCHES('2026-09-01'))
  })

  it('a row older than the later month\'s latest update is unmeasured (read with the 4 Oct run, judged after the 11 Oct)', () => {
    const judge = judgeAt('2026-10-12T12:00:00.000Z', [AUG_SEP], [])
    const pair = judge('2026-08-01', '2026-09-01', 'market')
    expect(pair.reasons.map((r) => r.kind)).toEqual(['unmeasured'])
    const v = change(pair)
    expect(v.refusedReason).toBe('unmeasured')
    expect(pairSentence(v.pair!)).toBe('Not compared yet: checked with the 18 Oct update.')
  })

  it('n = 0 and NaN never read as comparable', () => {
    const zero = { ...HYPOTHETICAL_SAME_WAY, searchOutside: { prev: { k: 0, n: 0 }, curr: { k: 0, n: 377 } } }
    const nan = { ...HYPOTHETICAL_SAME_WAY, depth: { prevMedian: Number.NaN, currMedian: 23 } }
    for (const r of [zero, nan]) {
      const v = monthChange({ object: LOOKS, audience: INDUSTRY_AUDIENCE, curr: NOV, prev: OCT, comparability: judgeAt('2026-12-07T12:00:00.000Z', [r], [])('2026-10-01', '2026-11-01', 'market') })
      expect(v.state).toBe('refused')
    }
  })

  it('depth: September\'s median 15 against August\'s 23 (0.65) refuses, worded "not compared yet", never "still filling"', () => {
    const shallow = { ...HYPOTHETICAL_SAME_WAY, depth: { prevMedian: 23, currMedian: 15 } }
    const v = monthChange({ object: LOOKS, audience: INDUSTRY_AUDIENCE, curr: NOV, prev: OCT, comparability: judgeAt('2026-12-07T12:00:00.000Z', [shallow], [])('2026-10-01', '2026-11-01', 'market') })
    expect(v.refusedReason).toBe('depth')
    expect(pairSentence(v.pair!)).toBe('Not compared yet: checked with the 13 Dec update.')
    expect(pairSentence(v.pair!)).not.toMatch(/filling/i)
  })

  it('a fresh row, no change in span and matched depth bands normally', () => {
    const pair = judgeAt('2026-12-07T12:00:00.000Z', [HYPOTHETICAL_SAME_WAY], [])('2026-10-01', '2026-11-01', 'market')
    expect(pair.mode).toBe('comparable')
    const v = monthChange({ object: LOOKS, audience: INDUSTRY_AUDIENCE, curr: NOV, prev: OCT, comparability: pair })
    expect(v.state).not.toBe('refused')
    expect(v.changePts).not.toBeNull()
    expect(v.flags).not.toContain('tracking_change')
    expect(v.pair).toBeUndefined()
  })

  it('refuses at 10% and flags at 1–9%: the gate fix is 9.6% of the market and 10.1% of the category', () => {
    const judge = judgeAt('2026-12-07T12:00:00.000Z', [GATED], [GATE])
    const market = monthChange({ object: LOOKS, audience: 'market', curr: NOV, prev: OCT, comparability: judge('2026-10-01', '2026-11-01', 'market') })
    expect(market.state).not.toBe('refused')
    expect(market.flags).toContain('tracking_change')
    expect(market.pair).toEqual({ mode: 'flag', cause: 'ours', changeMonth: '2026-10-01', checkWith: null })
    expect(pairSentence(market.pair!)).toBe(PAIR_FLAG_NOTE('2026-10-01'))
    const themes = monthChange({ object: LOOKS, audience: INDUSTRY_AUDIENCE, curr: NOV, prev: OCT, comparability: judge('2026-10-01', '2026-11-01', 'themes') })
    expect(themes.state).toBe('refused')
    expect(themes.refusedReason).toBe('tracking_change')
    expect(pairSentence(themes.pair!)).toBe(PAIR_REFUSED_OURS('2026-10-01'))
  })

  it('a rename still refuses first, and the pair\'s words do not ride on it', () => {
    const v = monthChange({
      object: LOOKS, audience: 'competitor:Freitag',
      curr: { ...sep, audience: 'competitor:Freitag' }, prev: { ...aug, audience: 'competitor:Freitag Bags' },
      comparability: judgeAt('2026-10-02T06:00:00.000Z')('2026-08-01', '2026-09-01', 'brands'),
    })
    expect(v.refusedReason).toBe('rename')
    expect(v.pair).toBeUndefined()
  })
})

// A SEARCH CHANGE AFTER THE PAIR'S MONTHS IS NOT ITS CAUSE (deploy 1 review).
// August against September's span runs to 1 Nov, and discovery keeps changing
// the searched communities until deploy 4 (it activated r/travelgear on 9 Sep).
// HYPOTHETICAL: a community activated on the 4 Oct run; the date is the run's,
// the community is a label, and no such row exists yet.
describe('an October search change inside August against September\'s span', () => {
  const OCT_ACTIVATION = row({
    id: 'subreddits-1004', changed_at: '2026-10-04T04:30:00.000Z', surface: 'subreddits', field: 'subreddits',
    source: 'trigger', actor_kind: 'pipeline',
    before: ['backpacks', 'travelgear', 'onebag'].map((name) => ({ name, status: 'active' })),
    after: ['backpacks', 'travelgear', 'onebag', 'known_2'].map((name) => ({ name, status: 'active' })),
  })
  const withOct = changesFromLog([...SEALAND_LOG, OCT_ACTIVATION])

  it('is a change of every view, in the pair\'s span', () => {
    expect(withOct.some((c) => c.id === 'subreddits-1004' && c.surface === 'subreddits')).toBe(true)
  })

  it('measured (a row read through the 4 Oct run): the searches are named by September\'s change, not October\'s', () => {
    const pair = judgeAt('2026-10-05T12:00:00.000Z', [AUG_SEP], withOct)('2026-08-01', '2026-09-01', 'market')
    const searches = pair.reasons.find((r) => r.kind === 'searches')
    expect(searches?.changedAt?.slice(0, 10)).toBe('2026-09-17')
    const v = change(pair)
    expect(v.pair).toEqual({ mode: 'refuse', cause: 'searches', changeMonth: '2026-09-01', checkWith: null })
    expect(pairSentence(v.pair!)).toBe(PAIR_REFUSED_SEARCHES('2026-09-01'))
  })

  it('unmeasured (no row): September\'s change is named, on every view', () => {
    for (const view of ['market', 'themes', 'brands'] as const) {
      const note = pairOnVerdict(judgeAt('2026-10-05T12:00:00.000Z', [], withOct)('2026-08-01', '2026-09-01', view)).note
      expect(note?.changeMonth).toBe('2026-09-01')
    }
  })

  it('names October only where no search change falls in or before September', () => {
    const onlyOct = changesFromLog([OCT_ACTIVATION])
    const pair = judgeAt('2026-10-05T12:00:00.000Z', [AUG_SEP], onlyOct)('2026-08-01', '2026-09-01', 'market')
    expect(pair.reasons.find((r) => r.kind === 'searches')?.changeId).toBe('subreddits-1004')
  })
})

// ONLY A PAIR THAT COULD HAVE BEEN COMPARED IS REFUSED FOR IT (deploy 1
// review). Staging's Subjects hero at 2 Oct: Patagonia's Looks & style cell is
// 0 of its 5 September videos with no August reading at all, and Cotopaxi's 0
// of 12; the refusal named our September searches on cells no band could ever
// have compared.
describe('monthChange: a side under the floor reads "too few to compare", not the pair', () => {
  const PATAGONIA = 'competitor:Patagonia'
  it('no earlier side: too little data, no pair words', () => {
    const v = monthChange({
      object: LOOKS, audience: PATAGONIA,
      curr: { month: '2026-09-01', videos: 5, k: 0, audience: PATAGONIA, regime: 'n/a' },
      prev: { month: '2026-08-01', videos: 0, k: 0, audience: PATAGONIA, regime: 'n/a' },
      comparability: judgeAt('2026-10-02T06:00:00.000Z')('2026-08-01', '2026-09-01', 'brands'),
    })
    expect(v.state).toBe('too_little_data')
    expect(v.pair).toBeUndefined()
  })

  it('both sides over the floor: refused for the pair, as before', () => {
    const v = change(judgeAt('2026-10-02T06:00:00.000Z')('2026-08-01', '2026-09-01', 'themes'))
    expect(v.state).toBe('refused')
    expect(pairSentence(v.pair!)).toBe(PAIR_REFUSED_SEARCHES('2026-09-01'))
  })

  it('a rename still refuses first, whatever the sides', () => {
    const v = monthChange({
      object: LOOKS, audience: PATAGONIA,
      curr: { month: '2026-09-01', videos: 5, k: 0, audience: PATAGONIA, regime: 'n/a' },
      prev: { month: '2026-08-01', videos: 0, k: 0, audience: 'competitor:Patagonia Inc', regime: 'n/a' },
      comparability: judgeAt('2026-10-02T06:00:00.000Z')('2026-08-01', '2026-09-01', 'brands'),
    })
    expect(v.refusedReason).toBe('rename')
  })
})

describe('the views (decision E)', () => {
  const at = '2026-12-07T12:00:00.000Z'
  const inOct = (surface: OurChange['surface']): OurChange => ({ id: `${surface}-1015`, surface, changedAt: '2026-10-15T12:00:00.000Z', note: null, affects: VIEWS_BY_SURFACE[surface] })

  it('an attribution or entity_retag change refuses the themes and brands views but not the market view', () => {
    for (const c of [inOct('attribution'), inOct('entity_retag')]) {
      const judge = judgeAt(at, [HYPOTHETICAL_SAME_WAY], [c])
      expect(judge('2026-10-01', '2026-11-01', 'market').mode).toBe('comparable')
      expect(judge('2026-10-01', '2026-11-01', 'themes').mode).toBe('refuse')
      expect(judge('2026-10-01', '2026-11-01', 'brands').mode).toBe('refuse')
    }
  })

  it('a segment change refuses nothing', () => {
    const judge = judgeAt(at, [HYPOTHETICAL_SAME_WAY], [inOct('segment')])
    for (const view of ['market', 'themes', 'brands', 'lens'] as const) expect(judge('2026-10-01', '2026-11-01', view).mode).toBe('comparable')
  })

  it('a strike-only or probe-only subreddits row is ignored (the 20 Sep probe, 20 → 20); a knobs row refuses', () => {
    const probe = changesFromLog([{ ...PROBE_0920, changed_at: '2026-10-18T04:04:00.000Z' }])
    expect(probe).toEqual([])
    expect(judgeAt(at, [HYPOTHETICAL_SAME_WAY], probe)('2026-10-01', '2026-11-01', 'market').mode).toBe('comparable')
    const knobs = changesFromLog([row({ id: 'knobs-1020', changed_at: '2026-10-20T09:00:00.000Z', surface: 'knobs', field: 'max_videos' })])
    const v = monthChange({ object: LOOKS, audience: 'market', curr: NOV, prev: OCT, comparability: judgeAt(at, [HYPOTHETICAL_SAME_WAY], knobs)('2026-10-01', '2026-11-01', 'market') })
    expect(v.refusedReason).toBe('tracking_change')
    expect(pairSentence(v.pair!)).toBe(PAIR_REFUSED_OURS('2026-10-01'))
  })

  it('an audience is judged for its view: the category for themes, the market for the market, any other key for brands', () => {
    expect(CATEGORY_AUDIENCE).toBe(INDUSTRY_AUDIENCE)
    expect(viewForAudience(INDUSTRY_AUDIENCE)).toBe('themes')
    expect(viewForAudience('market')).toBe('market')
    expect(viewForAudience('client')).toBe('brands')
    expect(viewForAudience('competitor:Freitag')).toBe('brands')
    expect(viewForAudience(BRANDS_PANEL)).toBe('brands')
  })
})

// ---- The later month, and the update a refusal is read with ------------------------------

describe('laterMonthOf', () => {
  it('September on 2 Oct: ended, read to its end by no update yet (the 27 Sep update is before its end)', () => {
    expect(laterMonthOf('2026-09-01', '2026-10-02T06:00:00.000Z', SEALAND_UPDATES)).toEqual({
      state: 'ended', readToEnd: false, latestUpdateRunId: 'run-2026-09-27',
    })
  })

  it('September on 5 Oct: read to its end by the 4 Oct update, which is its latest', () => {
    expect(laterMonthOf('2026-09-01', '2026-10-05T12:00:00.000Z', SEALAND_UPDATES)).toEqual({
      state: 'ended', readToEnd: true, latestUpdateRunId: 'run-2026-10-04',
    })
  })

  it('the run past the freeze line is the month\'s last: nothing after it reads September', () => {
    // September's line is 31 Oct; the 1 Nov update freezes it.
    expect(laterMonthOf('2026-09-01', '2026-12-20T12:00:00.000Z', SEALAND_UPDATES).latestUpdateRunId).toBe('run-2026-11-01')
  })

  it('a month in progress is so far', () => {
    expect(laterMonthOf('2026-09-01', '2026-09-24T18:00:00.000Z', SEALAND_UPDATES).state).toBe('so_far')
  })

  it('Össur\'s September, read only to 13 Sep: not read to its end', () => {
    expect(laterMonthOf('2026-09-01', '2026-10-02T12:00:00.000Z', OSSUR_UPDATES)).toEqual({
      state: 'ended', readToEnd: false, latestUpdateRunId: 'ossur-0913',
    })
  })
})

describe('pairJudge', () => {
  it('Össur\'s August against September is not_read_to_end, and names no update (paused)', () => {
    const judge = pairJudge({ now: '2026-10-02T12:00:00.000Z', changes: [], rows: [], updates: OSSUR_UPDATES, nextUpdateAfter: SEALAND_SCHEDULE })
    const pair = judge('2026-08-01', '2026-09-01', 'themes')
    expect(pair.reasons).toEqual([{ kind: 'not_read_to_end', changeId: null, share: null }])
    expect(pair.checkWith).toBeNull()
    const v = change(pair)
    expect(v.refusedReason).toBe('incomplete')
    expect(pairSentence(v.pair!)).toBe(PAIR_NOT_YET(null))
    expect(PAIR_NOT_YET(null)).toBe('Not compared yet.')
  })

  it('October so far on 16 Oct is checked with the 1 Nov update, the first after it ends', () => {
    const pair = judgeAt('2026-10-16T12:00:00.000Z')('2026-09-01', '2026-10-01', 'themes')
    expect(pair.reasons[0].kind).toBe('incomplete')
    expect(pair.checkWith).toBe('2026-11-01T04:00:00.000Z')
  })

  it('a later month past its freeze line promises no update', () => {
    const pair = judgeAt('2026-12-20T12:00:00.000Z')('2026-08-01', '2026-09-01', 'themes')
    expect(pair.mode).toBe('refuse')
    expect(pair.checkWith).toBeNull()
  })

  it('without a schedule no update is named', () => {
    const judge = pairJudge({ now: '2026-10-02T06:00:00.000Z', changes: [], rows: [], updates: SEALAND_UPDATES })
    expect(judge('2026-08-01', '2026-09-01', 'market').checkWith).toBeNull()
  })

  it('answers the same pair once per view', () => {
    const judge = judgeAt('2026-10-02T06:00:00.000Z')
    expect(judge('2026-08-01', '2026-09-01', 'market')).toBe(judge('2026-08-01', '2026-09-01', 'market'))
  })

  // A CHANGE THE ROW MEASURED UNDER 1% IS NOT BLAMED (WP1.3 review fix). On
  // a so-far September the rule refuses before it reads the row; the words
  // named every in-span change even when a row measured it as nothing.
  it('a so-far pair whose row measures the searches under 1% says the month is still running, not a search change', () => {
    const measured = judgeAt('2026-09-20T13:30:00.000Z', [HYPOTHETICAL_SEARCHES_UNDER_FLAG])('2026-08-01', '2026-09-01', 'market')
    expect(measured.mode).toBe('refuse')
    expect(measured.reasons.map((r) => r.kind)).toEqual(['incomplete'])
    expect(pairSentence(pairOnVerdict(measured).note!)).toBe('September is not compared until it has ended.')
    // With no row, the same pair names our September search change.
    const unmeasured = judgeAt('2026-09-20T13:30:00.000Z')('2026-08-01', '2026-09-01', 'market')
    expect(pairSentence(pairOnVerdict(unmeasured).note!)).toBe('Not read as a change: we changed our searches in September.')
  })

  it('a change the row measures from 1% to under 10% is listed with its share and not named as the cause', () => {
    const flagged = { ...HYPOTHETICAL_SEARCHES_UNDER_FLAG, searchOutside: { prev: { k: 2, n: 351 }, curr: { k: 9, n: 625 } } }
    const pair = judgeAt('2026-09-20T13:30:00.000Z', [flagged])('2026-08-01', '2026-09-01', 'market')
    const searches = pair.reasons.filter((r) => r.kind === 'searches')
    expect(searches.length).toBeGreaterThan(0)
    for (const r of searches) expect(r.share).toBeCloseTo(9 / 625)
    expect(pairOnVerdict(pair).refused).toBe('incomplete')
    expect(pairSentence(pairOnVerdict(pair).note!)).toBe('September is not compared until it has ended.')
  })

  it('refuseEveryPair fails closed', () => {
    expect(refuseEveryPair('2026-10-01', '2026-11-01', INDUSTRY_AUDIENCE).mode).toBe('refuse')
    expect(change(refuseEveryPair('2026-08-01', '2026-09-01', INDUSTRY_AUDIENCE)).refusedReason).toBe('unmeasured')
  })
})

// ---- directionWord --------------------------------------------------------------------------

describe('directionWord under the rule', () => {
  // October, November and December read the same way, rising (the shape the
  // plan's first words need, late January 2027): HYPOTHETICAL_RISING_RUN.
  const run = HYPOTHETICAL_RISING_RUN
  const all = () => true

  it('earns a word when the newest month has ended and every step is comparable', () => {
    expect(directionWord(run, { asOf: '2027-01-20T12:00:00.000Z', comparable: all })).toBe('growing')
  })

  it('returns null when the newest point\'s month ends after asOf', () => {
    expect(directionWord(run, { asOf: '2026-12-20T12:00:00.000Z', comparable: all })).toBeNull()
    expect(directionWord(run, { asOf: 'not a date', comparable: all })).toBeNull()
  })

  it('returns null when any step is not comparable', () => {
    expect(directionWord(run, { asOf: '2027-01-20T12:00:00.000Z', comparable: (p) => p !== '2026-11-01' })).toBeNull()
  })

  it('no word on any Sealand series while the pairs behind it are refused (August to October, read in January)', () => {
    const judge = pairOn(judgeAt('2027-01-20T12:00:00.000Z'))
    const sealand: SeriesPoint[] = [aug, sep, { ...sep, month: '2026-10-01', k: 150 }]
    expect(directionWord(sealand, { asOf: '2027-01-20T12:00:00.000Z', comparable: comparableOn(judge, INDUSTRY_AUDIENCE) })).toBeNull()
  })
})

// ---- A direct bandVerdict (This week's riser, the standings) ------------------------------

describe('pairedVerdict', () => {
  const input = {
    objectKind: 'subject' as const, objectId: LOOKS.id, objectLabel: LOOKS.label, audience: INDUSTRY_AUDIENCE,
    window: { kind: 'month' as const, from: '2026-09-01', to: '2026-10-01' },
    value: { k: 104, n: 626 }, baseline: { k: 38, n: 351 },
  }

  it('refuses where the pair refuses, keeping the counts', () => {
    const v = pairedVerdict(input, judgeAt('2026-10-02T06:00:00.000Z')('2026-08-01', '2026-09-01', 'themes'))
    expect(v.state).toBe('refused')
    expect(v.value).toEqual({ k: 104, n: 626 })
    expect(pairSentence(v.pair!)).toBe(PAIR_REFUSED_SEARCHES('2026-09-01'))
  })

  it('a refusal the caller already holds wins, without the pair\'s words', () => {
    const v = pairedVerdict({ ...input, refused: 'rename' }, judgeAt('2026-10-02T06:00:00.000Z')('2026-08-01', '2026-09-01', 'themes'))
    expect(v.refusedReason).toBe('rename')
    expect(v.pair).toBeUndefined()
  })

  it('no pair is the band as before', () => {
    expect(pairedVerdict(input, null).state).toBe('moved')
  })
})

// ---- pairOnVerdict ------------------------------------------------------------------------

describe('pairOnVerdict', () => {
  it('a comparable pair, or none, leaves the verdict alone', () => {
    expect(pairOnVerdict(null)).toEqual({ refused: null, flag: false, note: null })
    expect(pairOnVerdict(comparabilityOf('2026-10-01', '2026-11-01', {
      row: HYPOTHETICAL_SAME_WAY, changes: [], view: 'market', later: { state: 'ended', readToEnd: true, latestUpdateRunId: 'run-2026-12-06' },
    }))).toEqual({ refused: null, flag: false, note: null })
  })

  it('a pair flagged only for run health adds no verdict flag: a partial run is not a change of ours', () => {
    const partial = { ...HYPOTHETICAL_SAME_WAY, gather: [{ month: '2026-11-01', runs: 5, partial: 1, searchesShort: 0 }] }
    const pair = comparabilityOf('2026-10-01', '2026-11-01', {
      row: partial, changes: [], view: 'market', later: { state: 'ended', readToEnd: true, latestUpdateRunId: 'run-2026-12-06' },
    })
    expect(pair.mode).toBe('flag')
    expect(pairOnVerdict(pair)).toEqual({ refused: null, flag: false, note: null })
  })

  // THE PAIR'S OWN TWO MONTHS FIRST (WP1.3 review fix). July against August
  // spans to August's freeze line, so it holds September's changes too; the
  // August point said "we changed our searches in September". The change
  // dated inside July or August is named first: on the category, the 17 Aug
  // own-handles row. The market view, which re-filing does not move, holds no
  // change in those two months and names the later search change.
  it('names a change dated in the pair\'s own two months before a later one in its span', () => {
    const judge = judgeAt('2026-10-02T06:00:00.000Z')
    expect(pairSentence(pairOnVerdict(judge('2026-07-01', '2026-08-01', 'themes')).note!))
      .toBe('Not read as a change: we changed how we check or file videos in August.')
    expect(pairSentence(pairOnVerdict(judge('2026-07-01', '2026-08-01', 'market')).note!))
      .toBe('Not read as a change: we changed our searches in September.')
  })

  it('an unmeasured pair with a code change and a search change in span names the search change', () => {
    const pair = judgeAt('2026-10-02T06:00:00.000Z')('2026-08-01', '2026-09-01', 'themes')
    expect(pair.reasons.some((r) => r.kind === 'code_change')).toBe(true)
    expect(pairOnVerdict(pair).note?.cause).toBe('searches')
  })
})

// ---- The chart's steps ----------------------------------------------------------------------

describe('refusedSteps', () => {
  it('breaks Aug→Sep with the sentence, and never judges months that are not neighbours', () => {
    const judge = pairOn(judgeAt('2026-10-02T06:00:00.000Z'))
    const steps = refusedSteps(['2026-07-01', '2026-08-01', '2026-09-01', '2026-11-01'], (a, b) => judge(a, b, INDUSTRY_AUDIENCE))
    expect(steps['2026-09-01']).toBe('Not read as a change: we changed our searches in September.')
    // July to August names the change dated in those two months (17 Aug).
    expect(steps['2026-08-01']).toBe('Not read as a change: we changed how we check or file videos in August.')
    expect(steps['2026-11-01']).toBeUndefined()
    expect(steps['2026-07-01']).toBeUndefined()
  })

  it('a comparable step is not broken', () => {
    const judge = pairOn(judgeAt('2026-12-07T12:00:00.000Z', [HYPOTHETICAL_SAME_WAY], []))
    expect(refusedSteps(['2026-10-01', '2026-11-01'], (a, b) => judge(a, b, 'market'))).toEqual({})
  })
})

describe('pairTools', () => {
  it('with no judge nothing is refused and no break list is made (a fixture)', () => {
    const t = pairTools(null)
    expect(t.pairFor('2026-08-01', '2026-09-01', INDUSTRY_AUDIENCE)).toBeNull()
    expect(t.comparableFor(INDUSTRY_AUDIENCE)('2026-08-01', '2026-09-01')).toBe(true)
    expect(t.stepBreaks(['2026-08-01', '2026-09-01'], INDUSTRY_AUDIENCE)).toBeUndefined()
  })

  it('with a judge, the spark breaks line up with the months', () => {
    const t = pairTools(pairOn(judgeAt('2026-10-02T06:00:00.000Z')))
    expect(t.stepBreaks(['2026-08-01', '2026-09-01'], INDUSTRY_AUDIENCE)).toEqual([false, true])
    expect(joins(t.pairFor('2026-08-01', '2026-09-01', INDUSTRY_AUDIENCE))).toBe(false)
  })

  it('and the sentence for each refused step, where a chart prints why (the quarterly\'s subject line)', () => {
    const t = pairTools(pairOn(judgeAt('2026-10-02T06:00:00.000Z')))
    expect(t.stepReasons(['2026-08-01', '2026-09-01', '2026-11-01'], INDUSTRY_AUDIENCE)).toEqual([
      null,
      'Not read as a change: we changed our searches in September.',
      // Not neighbours on the calendar: not a step, not judged.
      null,
    ])
    expect(pairTools(null).stepReasons(['2026-08-01', '2026-09-01'], INDUSTRY_AUDIENCE)).toBeUndefined()
  })
})

// ---- The words ------------------------------------------------------------------------------

describe('the pair words (lib/calibration.ts)', () => {
  it('read as the plan writes them, with no em dash and no "still filling"', () => {
    const all = [
      PAIR_REFUSED_SEARCHES('2026-09-01'),
      PAIR_REFUSED_OURS('2026-09-01'),
      PAIR_NOT_YET('2026-10-04T04:00:00.000Z'),
      PAIR_NOT_YET(null),
      PAIR_FLAG_NOTE('2026-09-01'),
      PAIR_FLAG_NOTE(null),
    ]
    expect(all[0]).toBe('Not read as a change: we changed our searches in September.')
    expect(all[2]).toBe('Not compared yet: checked with the 4 Oct update.')
    for (const s of all) {
      expect(s).not.toMatch(/\u2014/)
      expect(s).not.toMatch(/filling|how sound|complete/i)
    }
  })
})

// T0a (the one condition): months printed side by side are a comparison, so a
// trail or a move's read stops at a refused step.
describe('joinedRun: the months a reader may print side by side', () => {
  const pts = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'].map((month) => ({ month }))
  const refusedInto = (bad: string[]) => (_prev: string, month: string) => !bad.includes(month)

  it('keeps every month where every step joins', () => {
    expect(joinedRun(pts, '2026-09-01', () => true).map((p) => p.month)).toEqual(pts.map((p) => p.month))
  })

  it('from the newest month back, stops at the latest refused step', () => {
    expect(joinedRun(pts, '2026-09-01', refusedInto(['2026-09-01'])).map((p) => p.month)).toEqual(['2026-09-01'])
    expect(joinedRun(pts, '2026-09-01', refusedInto(['2026-08-01'])).map((p) => p.month)).toEqual(['2026-08-01', '2026-09-01'])
  })

  it('from a move\'s month forward, stops at the first refused step', () => {
    expect(joinedRun(pts, '2026-07-01', refusedInto(['2026-08-01'])).map((p) => p.month)).toEqual(['2026-06-01', '2026-07-01'])
    expect(joinedRun(pts, '2026-07-01', refusedInto(['2026-09-01'])).map((p) => p.month)).toEqual(['2026-06-01', '2026-07-01', '2026-08-01'])
  })

  it('Sealand on 2 Oct: August against September is refused on the market, so September stands alone', () => {
    const judge = pairOn(sealandJudge('2026-10-02T06:00:00.000Z'))
    const run = joinedRun(pts.slice(2), '2026-09-01', (a, b) => joins(judge(a, b, 'market')))
    expect(run.map((p) => p.month)).toEqual(['2026-09-01'])
  })

  it('does not judge a step between months that are not consecutive, and returns nothing without the anchor', () => {
    const gap = [{ month: '2026-06-01' }, { month: '2026-08-01' }]
    expect(joinedRun(gap, '2026-08-01', () => false).map((p) => p.month)).toEqual(['2026-06-01', '2026-08-01'])
    expect(joinedRun(pts, '2026-10-01', () => true)).toEqual([])
  })
})
