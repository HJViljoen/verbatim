import { describe, it, expect } from 'vitest'

import type { ConfigChange } from '../config-log'
import { changesFromLog, comparabilityOf, type OurChange, type PairComparability } from '../reading/comparability'
import { buildSeries, type DenominatorPoint, type MonthSeries } from '../reading/series'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, rivalKey } from '../rivals'
import type { Verdict } from '../reading/verdicts'
import { proseFigures } from '../prose/figures'
import { substituteFigures } from '../reports/cover'
import {
  buildCategory,
  HEADLINE_MAX_MAKER_SHARE,
  headline,
  isMissingThemeMakerShares,
  levelRows,
  LEVELS_SHOWN,
  makerSharesOf,
  laterSide,
  marketSizeOf,
  mayLead,
  pairChip,
  sizeSentence,
  type MarketSize,
} from './overview'

// The size headline (market-first WP1.5): the pure half. The numbers are
// Sealand's, production, to 24 Sep (research F1 and the grounding digest):
// 626 category videos and 15,821 comments in September, 29 videos and 412
// comments filed under a tracked brand, 9 of the client's own; August 351 in
// the category. The change log is GC F2's (the 9, 13 and 17 Sep term changes).

// ---- fixtures ---------------------------------------------------------------

const SEP = '2026-09-01'
const AUG = '2026-08-01'
const RIVALS = ['Cotopaxi', 'Freitag', 'Patagonia', 'The North Face'].map(rivalKey)

/** September so far, as `marketSizeOf` pools it: 626 + 29 videos, 15,821 +
 *  412 comments (F1). The rivals' split is not in the research, only their
 *  total, so it is carried on one rival's row; the pool is the same. */
const DENOMINATORS = [
  { month: SEP, audience: INDUSTRY_AUDIENCE, videos: 626, comments: 15821 },
  { month: SEP, audience: RIVALS[0], videos: 29, comments: 412 },
  { month: SEP, audience: CLIENT_AUDIENCE, videos: 9, comments: 234 },
  { month: AUG, audience: INDUSTRY_AUDIENCE, videos: 351, comments: 10188 },
]

const SEPTEMBER_SO_FAR: MarketSize = { month: SEP, soFar: true, videos: 655, comments: 16233 }

let seq = 0
function change(over: Partial<ConfigChange> & Pick<ConfigChange, 'changed_at' | 'surface'>): ConfigChange {
  seq += 1
  return {
    id: over.id ?? `row-${seq}`,
    client_id: 'sealand',
    field: null,
    before: null,
    after: null,
    actor_kind: 'reconstructed',
    actor_user_id: null,
    actor_label: null,
    run_id: null,
    source: 'reconstructed',
    rows_affected: null,
    note: null,
    affects_audiences: null,
    affects_months: null,
    ...over,
  }
}

/** Sealand's three September term changes (GC F2): one change each. */
const SEALAND_CHANGES: OurChange[] = changesFromLog([
  change({ id: 'terms-0909', changed_at: '2026-09-09T18:17:56.000Z', surface: 'terms', after: ['cotopaxi backpack'] }),
  change({ id: 'terms-0913', changed_at: '2026-09-13T10:00:58.000Z', surface: 'terms', field: 'industry_keywords', actor_kind: 'sql' }),
  change({ id: 'terms-0917', changed_at: '2026-09-17T16:02:56.000Z', surface: 'terms', field: 'exclude_terms', source: 'trigger', actor_kind: 'script' }),
])

/** Sealand's Sunday updates, by start (06:00 SAST = 04:00 UTC). */
const RUNS = [
  { id: 'run-0906', started_at: '2026-09-06T04:00:00.000Z' },
  { id: 'run-0913', started_at: '2026-09-13T04:00:00.000Z' },
  { id: 'run-0920', started_at: '2026-09-20T04:00:00.000Z' },
  { id: 'run-0927', started_at: '2026-09-27T04:00:00.000Z' },
  { id: 'run-1004', started_at: '2026-10-04T04:00:00.000Z' },
]

const moved = (over: Partial<Verdict> & Pick<Verdict, 'objectKind' | 'objectId' | 'objectLabel'>): Verdict => ({
  audience: INDUSTRY_AUDIENCE,
  window: { kind: 'month', from: SEP, to: '2026-10-01' },
  basis: { from: AUG, to: SEP },
  value: { k: 69, n: 626 },
  baseline: { k: 23, n: 351 },
  changePts: 4.5,
  bandPts: 3.6,
  state: 'moved',
  flags: [],
  ...over,
})

/** The two moves the shipped rule printed on September (DR F39, time-and-change
 *  §138): Looks & style, a subject, 38 of 351 to 104 of 626; and "Ready to buy
 *  handmade bags", a theme, 23 of 351 to 69 of 626, which is about a third
 *  makers by analogy (CQ F29: 50 of 140). */
const LOOKS_AND_STYLE = moved({
  objectKind: 'subject', objectId: 'looks-and-style', objectLabel: 'Looks & style',
  value: { k: 104, n: 626 }, baseline: { k: 38, n: 351 }, changePts: 5.8, bandPts: 3.9,
})
const READY_TO_BUY = moved({ objectKind: 'theme', objectId: 'ready-to-buy', objectLabel: 'Ready to buy handmade bags' })
/** Its staging twin's measured maker share (CQ F29): 50 of 140. */
const READY_TO_BUY_MAKERS = 50 / 140

/** A later month, as `laterSide` reads it off the stored row and the runs. */
const pairAt = (prevMonth: string, month: string, now: string, row: Parameters<typeof laterSide>[0]['row'] = null): PairComparability =>
  comparabilityOf(prevMonth, month, {
    row: null,
    changes: SEALAND_CHANGES,
    view: 'market',
    later: laterSide({ month, now, runs: RUNS, row }),
  })

// ---- the market's size --------------------------------------------------------

describe('marketSizeOf', () => {
  it('pools the category with the videos filed under a tracked brand, never the client’s own', () => {
    const size = marketSizeOf(DENOMINATORS, RIVALS, SEP, '2026-09-24T12:00:00.000Z')
    expect(size).toEqual(SEPTEMBER_SO_FAR)
  })

  it('reads "so far" off the clock: an ended month is not so far', () => {
    expect(marketSizeOf(DENOMINATORS, RIVALS, SEP, '2026-10-02T06:00:00.000Z').soFar).toBe(false)
    expect(marketSizeOf(DENOMINATORS, RIVALS, SEP, '2026-09-30T23:59:59.000Z').soFar).toBe(true)
  })

  it('says null, never zero, for a month with no row', () => {
    const size = marketSizeOf(DENOMINATORS, RIVALS, '2026-10-01', '2026-10-02T06:00:00.000Z')
    expect(size.videos).toBeNull()
    expect(size.comments).toBeNull()
  })
})

describe('sizeSentence', () => {
  it('states the size with its figures as tokens, and no digit typed into it', () => {
    const s = sizeSentence(SEPTEMBER_SO_FAR)
    expect(s.body).toBe('Your market in September so far: [[market_videos]] videos and [[market_comments]] comments.')
    const text = substituteFigures(s.body, proseFigures(s.figures)).map((p) => ('text' in p ? p.text : p.figure)).join('')
    expect(text).toBe('Your market in September so far: 655 videos and 16,233 comments.')
    expect(s.body.replace(/\[\[[a-z0-9_]+\]\]/g, '')).not.toMatch(/\d/)
  })

  it('drops "so far" once the month has ended', () => {
    expect(sizeSentence({ ...SEPTEMBER_SO_FAR, soFar: false }).body).toBe(
      'Your market in September: [[market_videos]] videos and [[market_comments]] comments.',
    )
  })

  it('says nothing was read rather than printing a zero', () => {
    const s = sizeSentence({ month: '2026-10-01', soFar: true, videos: null, comments: null })
    expect(s.body).toBe('Nothing has been read into October yet.')
    expect(s.figures).toEqual({})
  })
})

// ---- who may lead -----------------------------------------------------------------

describe('mayLead', () => {
  const measured = (share: number | null) => new Map([[READY_TO_BUY.objectId, share]])

  it('never lets a subject lead, whatever it did', () => {
    expect(mayLead(LOOKS_AND_STYLE, new Map([[LOOKS_AND_STYLE.objectId, 0]]))).toBe(false)
  })

  it('never lets a theme lead whose maker share was not measured', () => {
    expect(mayLead(READY_TO_BUY, null)).toBe(false)
    expect(mayLead(READY_TO_BUY, new Map())).toBe(false)
    expect(mayLead(READY_TO_BUY, measured(null))).toBe(false)
    expect(mayLead(READY_TO_BUY, measured(Number.NaN))).toBe(false)
  })

  it('lets a theme lead only at a quarter makers or fewer', () => {
    expect(mayLead(READY_TO_BUY, measured(READY_TO_BUY_MAKERS))).toBe(false)
    expect(mayLead(READY_TO_BUY, measured(HEADLINE_MAX_MAKER_SHARE))).toBe(true)
    // "Confusion over airline bag sizes": 3 of 17 makers on staging (CQ F29).
    expect(mayLead(READY_TO_BUY, measured(3 / 17))).toBe(true)
  })

  it('takes only a category theme that moved', () => {
    const quiet: Verdict = { ...READY_TO_BUY, state: 'no_clear_change' }
    expect(mayLead(quiet, measured(0))).toBe(false)
    const refused: Verdict = { ...READY_TO_BUY, state: 'refused', changePts: null, refusedReason: 'tracking_change' }
    expect(mayLead(refused, measured(0))).toBe(false)
    const yours: Verdict = { ...READY_TO_BUY, audience: CLIENT_AUDIENCE }
    expect(mayLead(yours, measured(0))).toBe(false)
  })
})

// ---- the headline ------------------------------------------------------------------

describe('headline, with the market’s size', () => {
  const chip = 'not read as a change: we changed our searches in September'

  // WP1.5's done-when: "every subject provisional, and no themes readable → the
  // headline is the size; no path makes a subject or a maker-led theme the
  // headline". Every production subject is provisional (none calibrated,
  // decision C); a subject never leads at all, so its calibration cannot
  // change the answer.
  it('states the size when every subject is provisional and no theme is readable', () => {
    const h = headline({ verdicts: [LOOKS_AND_STYLE], size: SEPTEMBER_SO_FAR, makerShares: null, chip })
    expect(h.lead).toBeNull()
    expect(h.body).toBe('Your market in September so far: [[market_videos]] videos and [[market_comments]] comments.')
    expect(h.figures.market_videos.value).toBe(655)
    expect(h.figures.market_comments.value).toBe(16233)
    expect(h.chip).toBe(chip)
  })

  it('never makes a subject or a theme that might be maker-led the headline', () => {
    const upcycling = moved({ objectKind: 'theme', objectId: 'upcycling', objectLabel: 'Admiration for upcycled bag creativity', value: { k: 71, n: 626 }, baseline: { k: 42, n: 351 }, changePts: -0.6 })
    const verdicts = [LOOKS_AND_STYLE, READY_TO_BUY, upcycling]
    // Unmeasured: nothing may lead.
    expect(headline({ verdicts, size: SEPTEMBER_SO_FAR, makerShares: null }).lead).toBeNull()
    // Measured: a third makers (buying) and 81% (upcycling, CQ F29: 112 of 138),
    // and the subject still has no maker share to be measured against.
    const shares = new Map<string, number | null>([
      ['ready-to-buy', READY_TO_BUY_MAKERS],
      ['upcycling', 112 / 138],
      ['looks-and-style', 0],
    ])
    const h = headline({ verdicts, size: SEPTEMBER_SO_FAR, makerShares: shares, chip })
    expect(h.lead).toBeNull()
    expect(h.body).toContain('Your market in September so far')
    expect(h.chip).toBe(chip)
  })

  it('leads with a moved category theme of few makers, where one is measured, and prints no chip', () => {
    const airline = moved({
      objectKind: 'theme', objectId: 'airline-sizes', objectLabel: 'Confusion over airline bag sizes',
      value: { k: 21, n: 626 }, baseline: { k: 9, n: 351 }, changePts: 0.8, bandPts: 2,
    })
    const h = headline({
      verdicts: [LOOKS_AND_STYLE, READY_TO_BUY, airline],
      size: SEPTEMBER_SO_FAR,
      makerShares: new Map([['airline-sizes', 3 / 17], ['ready-to-buy', READY_TO_BUY_MAKERS]]),
      chip,
    })
    expect(h.lead?.objectId).toBe('airline-sizes')
    expect(h.body).toContain('Confusion over airline bag sizes came up in')
    expect(h.chip).toBeNull()
  })

  it('keeps the Phase 1 rule for a caller that hands it no size', () => {
    const h = headline({ verdicts: [LOOKS_AND_STYLE] })
    expect(h.lead?.objectId).toBe('looks-and-style')
    expect(h.chip).toBeNull()
  })
})

// ---- the later month, and the chip ------------------------------------------------

describe('laterSide', () => {
  it('reads September so far on 24 Sep, with the 20 Sep update the latest', () => {
    const s = laterSide({ month: SEP, now: '2026-09-24T12:00:00.000Z', runs: RUNS, row: { status: 'filling', origin: 'live', videos: 655 } })
    expect(s).toEqual({ state: 'so_far', readToEnd: false, latestUpdateRunId: 'run-0920' })
  })

  it('reads September ended but not read to its end on 2 Oct', () => {
    const s = laterSide({ month: SEP, now: '2026-10-02T06:00:00.000Z', runs: RUNS, row: { status: 'filling', origin: 'live', videos: 655 } })
    expect(s).toEqual({ state: 'ended', readToEnd: false, latestUpdateRunId: 'run-0927' })
  })

  it('reads September read to its end once the 4 Oct update has run', () => {
    const s = laterSide({ month: SEP, now: '2026-10-05T06:00:00.000Z', runs: RUNS, row: { status: 'filling', origin: 'live', videos: 655 } })
    expect(s.readToEnd).toBe(true)
    expect(s.latestUpdateRunId).toBe('run-1004')
  })

  it('reads Össur’s September, updates paused since 13 Sep, as never read to its end', () => {
    const ossur = [{ id: 'ossur-0913', started_at: '2026-09-13T04:00:00.000Z' }]
    const s = laterSide({ month: SEP, now: '2026-11-02T06:00:00.000Z', runs: ossur, row: { status: 'filling', origin: 'live', videos: 430 } })
    expect(s).toEqual({ state: 'ended', readToEnd: false, latestUpdateRunId: 'ossur-0913' })
  })
})

describe('pairChip', () => {
  it('names our September searches on September so far (the deploy 1 headline)', () => {
    const pair = pairAt(AUG, SEP, '2026-09-29T12:00:00.000Z', { status: 'filling', origin: 'live', videos: 655 })
    expect(pair.mode).toBe('refuse')
    expect(pairChip(pair, SEALAND_CHANGES)).toBe('not read as a change: we changed our searches in September')
  })

  it('names them again on 1 to 3 Oct, before September is read to its end', () => {
    const pair = pairAt(AUG, SEP, '2026-10-02T06:00:00.000Z', { status: 'filling', origin: 'live', videos: 655 })
    expect(pair.reasons.map((r) => r.kind)).toEqual(['not_read_to_end'])
    expect(pairChip(pair, SEALAND_CHANGES)).toBe('not read as a change: we changed our searches in September')
  })

  it('names them once September has been read to its end and the pair is not measured', () => {
    const pair = pairAt(AUG, SEP, '2026-10-05T06:00:00.000Z', { status: 'filling', origin: 'live', videos: 655 })
    expect(pair.reasons[0].kind).toBe('unmeasured')
    expect(pairChip(pair, SEALAND_CHANGES)).toBe('not read as a change: we changed our searches in September')
  })

  it('says October is not compared while it is so far, when our change fell in September', () => {
    const pair = pairAt(SEP, '2026-10-01', '2026-10-16T06:00:00.000Z')
    expect(pairChip(pair, SEALAND_CHANGES)).toBe('October is not compared until it has ended')
  })

  it('names the September change that refuses September against October, once October has ended', () => {
    const runs = [...RUNS, { id: 'run-1101', started_at: '2026-11-01T04:00:00.000Z' }]
    const pair = comparabilityOf(SEP, '2026-10-01', {
      row: null,
      changes: SEALAND_CHANGES,
      view: 'market',
      later: laterSide({ month: '2026-10-01', now: '2026-11-02T06:00:00.000Z', runs, row: { status: 'filling', origin: 'live', videos: null } }),
    })
    expect(pairChip(pair, SEALAND_CHANGES)).toBe('not read as a change: we changed our searches in September')
  })

  it('says Össur’s September was not read to its end, where no change of ours fell in it', () => {
    const pair = comparabilityOf(AUG, SEP, {
      row: null,
      changes: [],
      view: 'market',
      later: laterSide({ month: SEP, now: '2026-10-02T06:00:00.000Z', runs: [{ id: 'ossur-0913', started_at: '2026-09-13T04:00:00.000Z' }], row: null }),
    })
    expect(pairChip(pair, [])).toBe('September is not compared: it was not read to its end')
  })

  it('names the change by what it changed, not only searches', () => {
    const gate: OurChange = { id: 'gate', surface: 'gate_rule', changedAt: '2026-09-26T10:00:00.000Z', note: null, affects: ['market', 'themes', 'brands', 'lens'] }
    const pair = pairAt(AUG, SEP, '2026-09-29T12:00:00.000Z')
    expect(pairChip(pair, [gate])).toBe('not read as a change: we changed how we check relevance in September')
  })

  it('ignores a change that cannot move the market (a re-filing moves themes and brands only)', () => {
    const retag: OurChange = { id: 'retag', surface: 'entity_retag', changedAt: '2026-09-29T10:00:00.000Z', note: null, affects: ['themes', 'brands'] }
    const pair = pairAt(AUG, SEP, '2026-09-29T12:00:00.000Z')
    expect(pairChip({ ...pair }, [retag])).toBe('September is not compared until it has ended')
  })

  it('says "not compared yet" for a pair nobody has measured and nothing of ours touched', () => {
    const pair = comparabilityOf(AUG, SEP, {
      row: null,
      changes: [],
      view: 'market',
      later: laterSide({ month: SEP, now: '2026-10-05T06:00:00.000Z', runs: RUNS, row: null }),
    })
    expect(pairChip(pair, [])).toBe('not compared yet')
  })

  it('prints nothing where the pair is compared, or where there is no pair', () => {
    const comparable: PairComparability = { prevMonth: AUG, month: SEP, mode: 'comparable', reasons: [], row: null }
    const flagged: PairComparability = { ...comparable, mode: 'flag', reasons: [{ kind: 'gather', changeId: null, share: null }] }
    expect(pairChip(comparable, SEALAND_CHANGES)).toBeNull()
    expect(pairChip(flagged, SEALAND_CHANGES)).toBeNull()
    expect(pairChip(null, SEALAND_CHANGES)).toBeNull()
  })

  it('carries no digit and no em dash in any of its words', () => {
    const chips = [
      pairChip(pairAt(AUG, SEP, '2026-09-29T12:00:00.000Z'), SEALAND_CHANGES),
      pairChip(pairAt(SEP, '2026-10-01', '2026-10-16T06:00:00.000Z'), SEALAND_CHANGES),
      pairChip(pairAt(AUG, SEP, '2026-10-05T06:00:00.000Z'), []),
    ]
    for (const c of chips) {
      expect(c).not.toBeNull()
      expect(c).not.toMatch(/\d|—/)
    }
  })
})

// ---- the level list ------------------------------------------------------------------

/** Sealand's biggest category themes, September (of 626) and August (of 351),
 *  production labels and counts as the grounding digest lists them (24 Sep):
 *  every theme at 15 videos or more, and the two at 18 that tie for eighth. */
const SEALAND_THEMES: [id: string, label: string, sep: number, aug: number][] = [
  ['th-upcycling', 'Admiration for upcycled bag creativity', 71, 42],
  ['th-ready-to-buy', 'Ready to buy handmade bags', 69, 23],
  ['th-craftsmanship', 'Respect for handmade craftsmanship', 64, 29],
  ['th-bag-design', 'Love for stylish bag design', 60, 23],
  ['th-tutorials', 'Requests for step-by-step tutorials', 30, 15],
  ['th-airline', 'Confusion over airline bag sizes', 21, 9],
  ['th-shipping', 'Questions about buying and shipping', 20, 7],
  ['th-price-checks', 'Price checks before purchase', 18, 6],
  ['th-brand-comparisons', 'Backpack brand and model comparisons', 18, 12],
  ['th-packing', 'Praise for practical packing tips', 15, 8],
  ['th-measurements', 'Need for exact measurements', 15, 6],
]

const denominatorRow = (month: string, videos: number, comments: number): DenominatorPoint => ({
  month,
  audience: INDUSTRY_AUDIENCE,
  videos,
  comments,
  status: 'filling',
  origin: 'live',
  read_at: '2026-09-24T12:00:00.000Z',
  run_id: 'run-0920',
  frozen_at: null,
  clustering_key: 'k1',
})

const CATEGORY_DENOMINATORS = [denominatorRow(AUG, 351, 10188), denominatorRow(SEP, 626, 15821)]

function levelSeries(themes = SEALAND_THEMES): MonthSeries[] {
  return themes.map(([id, label, sep, aug]) =>
    buildSeries({
      axis: [AUG, SEP],
      audience: INDUSTRY_AUDIENCE,
      objectId: id,
      objectLabel: label,
      denominators: CATEGORY_DENOMINATORS,
      readings: [
        { month: AUG, audience: INDUSTRY_AUDIENCE, videos: aug, comments: 0, run_id: 'run-0920', clustering_key: 'k1' },
        { month: SEP, audience: INDUSTRY_AUDIENCE, videos: sep, comments: 0, run_id: 'run-0920', clustering_key: 'k1' },
      ],
      changeLogFrom: '2026-07-06T00:00:00.000Z',
    }),
  )
}

describe('levelRows', () => {
  it('lists the eight biggest category themes by September’s k, August beside', () => {
    const rows = levelRows({ series: levelSeries(), audience: INDUSTRY_AUDIENCE, month: SEP, prevMonth: AUG })
    expect(rows).toHaveLength(LEVELS_SHOWN)
    expect(rows.map((r) => [r.label, r.k, r.prevK])).toEqual([
      ['Admiration for upcycled bag creativity', 71, 42],
      ['Ready to buy handmade bags', 69, 23],
      ['Respect for handmade craftsmanship', 64, 29],
      ['Love for stylish bag design', 60, 23],
      ['Requests for step-by-step tutorials', 30, 15],
      ['Confusion over airline bag sizes', 21, 9],
      ['Questions about buying and shipping', 20, 7],
      // Two themes at 18: the one with the larger August k takes the row.
      ['Backpack brand and model comparisons', 18, 12],
    ])
    // Every row is over the category's n, never the pooled market's 655.
    expect(new Set(rows.map((r) => r.n))).toEqual(new Set([626]))
    // Nothing was measured: no row claims a maker share.
    expect(rows.every((r) => r.makerShare === null)).toBe(true)
  })

  it('orders the same way however the series arrive', () => {
    const forward = levelRows({ series: levelSeries(), audience: INDUSTRY_AUDIENCE, month: SEP, prevMonth: AUG })
    const reversed = levelRows({ series: [...levelSeries()].reverse(), audience: INDUSTRY_AUDIENCE, month: SEP, prevMonth: AUG })
    expect(reversed).toEqual(forward)
  })

  it('carries each theme’s measured maker share, and null where it was not measured', () => {
    const shares = new Map<string, number | null>([['th-upcycling', 112 / 138], ['th-ready-to-buy', 50 / 140]])
    const rows = levelRows({ series: levelSeries(), audience: INDUSTRY_AUDIENCE, month: SEP, prevMonth: AUG, makerShares: shares })
    expect(rows[0].makerShare).toBeCloseTo(0.81, 2)
    expect(rows[1].makerShare).toBeCloseTo(0.36, 2)
    expect(rows[2].makerShare).toBeNull()
  })

  // "Laundry planning for travel": 10 September videos and none in August
  // (staging, plan §2.4 C2).
  it('reads a theme absent from a month that has a row as 0, and a month with no row as null', () => {
    const series = [buildSeries({
      axis: [AUG, SEP],
      audience: INDUSTRY_AUDIENCE,
      objectId: 'th-laundry',
      objectLabel: 'Laundry planning for travel',
      denominators: CATEGORY_DENOMINATORS,
      readings: [{ month: SEP, audience: INDUSTRY_AUDIENCE, videos: 10, comments: 0, run_id: 'run-0920', clustering_key: 'k1' }],
      changeLogFrom: '2026-07-06T00:00:00.000Z',
    })]
    expect(levelRows({ series, audience: INDUSTRY_AUDIENCE, month: SEP, prevMonth: AUG })[0].prevK).toBe(0)
    expect(levelRows({ series, audience: INDUSTRY_AUDIENCE, month: SEP, prevMonth: '2026-07-01' })[0].prevK).toBeNull()
  })

  it('leaves off a theme with no video in the month read, and every other audience', () => {
    // August's list: "Laundry planning for travel" had no August video (0, a
    // month with a row), so it is not one of August's themes.
    const laundry = buildSeries({
      axis: [AUG, SEP],
      audience: INDUSTRY_AUDIENCE,
      objectId: 'th-laundry',
      objectLabel: 'Laundry planning for travel',
      denominators: CATEGORY_DENOMINATORS,
      readings: [{ month: SEP, audience: INDUSTRY_AUDIENCE, videos: 10, comments: 0, run_id: 'run-0920', clustering_key: 'k1' }],
      changeLogFrom: '2026-07-06T00:00:00.000Z',
    })
    const rival = levelSeries(SEALAND_THEMES.slice(2, 3)).map((s) => ({ ...s, audience: rivalKey('Cotopaxi') }))
    const rows = levelRows({ series: [laundry, ...levelSeries(SEALAND_THEMES.slice(0, 2)), ...rival], audience: INDUSTRY_AUDIENCE, month: AUG, prevMonth: null })
    expect(rows.map((r) => [r.registryId, r.k, r.n, r.prevK])).toEqual([['th-upcycling', 42, 351, null], ['th-ready-to-buy', 23, 351, null]])
  })
})

describe('makerSharesOf', () => {
  it('divides each theme’s maker videos by its videos', () => {
    const shares = makerSharesOf([
      { registry_id: 'th-upcycling', videos: 138, maker: 112, noise: 0, labelled: 138 },
      { registry_id: 'th-shipping', videos: 28, maker: 0, noise: 0, labelled: 28 },
    ])
    expect(shares.get('th-upcycling')).toBeCloseTo(0.81, 2)
    expect(shares.get('th-shipping')).toBe(0)
  })

  it('says null, never a share, for a row that is not a count', () => {
    const shares = makerSharesOf([
      { registry_id: 'a', videos: 0, maker: 0, noise: 0, labelled: 0 },
      { registry_id: 'b', videos: 10, maker: 11, noise: 0, labelled: 10 },
      { registry_id: 'c', videos: Number.NaN, maker: 1, noise: 0, labelled: 1 },
      { registry_id: 'd', videos: 10, maker: -1, noise: 0, labelled: 10 },
    ])
    expect([...shares.values()]).toEqual([null, null, null, null])
  })
})

describe('isMissingThemeMakerShares', () => {
  it('knows the function is not there before MF1', () => {
    expect(isMissingThemeMakerShares({ code: 'PGRST202', message: 'Could not find the function public.theme_maker_shares(p_client, p_month, p_run) in the schema cache' })).toBe(true)
    expect(isMissingThemeMakerShares({ code: '42883', message: 'function public.theme_maker_shares(uuid, date, uuid) does not exist' })).toBe(true)
  })

  it('does not mistake another failure for an absent migration', () => {
    expect(isMissingThemeMakerShares(null)).toBe(false)
    expect(isMissingThemeMakerShares({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false)
    expect(isMissingThemeMakerShares({ code: 'PGRST202', message: 'Could not find the function public.market_segment_counts' })).toBe(false)
  })
})

describe('buildCategory, with the level list', () => {
  const perAudience = new Map([[`${AUG}|${INDUSTRY_AUDIENCE}`, 351], [`${SEP}|${INDUSTRY_AUDIENCE}`, 626]])
  const base = {
    audience: INDUSTRY_AUDIENCE, axis: [AUG, SEP], month: SEP, prevMonth: AUG, series: [], kindRows: null, statsRows: null,
    panel: null, perAudience, recordFrom: AUG, attentionVerdict: null, dormant: [], thin: false,
  }

  it('carries the level list and the previous month’s n for its column head', () => {
    const c = buildCategory({ ...base, levelSeries: levelSeries(), makerShares: null })
    expect(c.levels?.map((l) => l.k)).toEqual([71, 69, 64, 60, 30, 21, 20, 18])
    expect(c.levelsPrev).toEqual({ month: AUG, n: 351 })
  })

  it('prints the list in a thin month too: a level is not a comparison', () => {
    const c = buildCategory({ ...base, thin: true, levelSeries: levelSeries() })
    expect(c.levels).toHaveLength(LEVELS_SHOWN)
  })

  it('adds no field for a caller that read no list', () => {
    const c = buildCategory(base)
    expect('levels' in c).toBe(false)
    expect('levelsPrev' in c).toBe(false)
  })
})
