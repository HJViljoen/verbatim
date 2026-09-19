import { describe, it, expect } from 'vitest'

import { concludedBasisLine, gapTile, leadGap, leadVerdict, overviewTiles, verdictTile } from './overview'
import type { Gap, GapSide } from '../../reading/gap'
import type { Verdict } from '../../reading/verdicts'
import type { DocumentSnapshotData } from './types'

// The brief's overview logic, in the LOGIC tier (package E-marketing, fix
// pass). `leadGap`, `leadVerdict`, `gapTile`, `verdictTile`,
// `concludedBasisLine` and the reading branch of `overviewTiles` are pure, and
// they were exercised only through one fixture in the render tier — so the
// ranking rules, the tie-break on n, the refusal branch and the no-reading
// fallback were each covered by whatever that one month happened to contain.
// The repo rule is that new pure logic gets a test here.

const side = (over: Partial<GapSide> = {}): GapSide =>
  ({ audience: 'client', label: 'you', value: { k: 26, n: 84 }, pct: 31, observed: true, ...over })

const WINDOW = { kind: 'month' as const, from: '2026-09-01', to: '2026-10-01' }

const gap = (over: Partial<Gap> = {}): Gap => ({
  objectKind: 'subject',
  objectId: 's1',
  objectLabel: 'Durability',
  a: side(),
  b: side({ audience: 'competitor:Freitag', label: 'Freitag', value: { k: 62, n: 142 }, pct: 44 }),
  window: WINDOW,
  gapPts: -13,
  bandPts: 11.8,
  state: 'apart',
  basis: null,
  direction: null,
  flags: [],
  ...over,
})

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  objectKind: 'subject',
  objectId: 's1',
  objectLabel: 'Durability',
  audience: 'industry-other',
  window: WINDOW,
  value: { k: 305, n: 1388 },
  changePts: 3.2,
  bandPts: 2.1,
  state: 'moved',
  flags: [],
  ...over,
})

describe('leadGap', () => {
  it('leads with the gap that concluded something, in the page’s own order', () => {
    const apart = gap({ objectId: 's2', objectLabel: 'Price' })
    const level = gap({ objectId: 's3', objectLabel: 'Fit', state: 'level', gapPts: 1.1 })
    const refused = gap({ objectId: 's4', objectLabel: 'Colour', state: 'refused', gapPts: null, bandPts: null })
    // A refusal and a level are both ahead of an `apart` in the page's order,
    // and the `apart` still leads; within a state the page's order stands.
    expect(leadGap([refused, level, apart])?.objectId).toBe('s2')
    expect(leadGap([refused, level])?.objectId).toBe('s3')
    expect(leadGap([refused])?.objectId).toBe('s4')
  })

  it('is null for a workspace whose reading holds no gap at all', () => {
    expect(leadGap(undefined)).toBeNull()
    expect(leadGap([])).toBeNull()
  })

  it('does not re-order the reading it was handed', () => {
    const gaps = [gap({ objectId: 'a' }), gap({ objectId: 'b' })]
    leadGap(gaps)
    expect(gaps.map((g) => g.objectId)).toEqual(['a', 'b'])
  })
})

describe('gapTile', () => {
  it('prints the magnitude only where one was earned', () => {
    expect(gapTile(gap())).toMatchObject({ value: '13 pts' })
    expect(gapTile(gap()).word).toBeUndefined()
  })

  // D2: a refusal typeset at the artboard's 38px numeral reads as a
  // measurement, so the tile's value IS the word and carries no digit.
  it('sets a refusal as the state’s word, with no magnitude anywhere in it', () => {
    for (const state of ['too_little_data', 'refused'] as const) {
      const tile = gapTile(gap({ state, gapPts: null, bandPts: null }))
      expect(tile.word).toBe(true)
      expect(tile.value).not.toMatch(/\d/)
    }
    expect(gapTile(gap({ state: 'too_little_data', gapPts: null, bandPts: null })).value).toBe('too few to compare')
  })

  // The label under a word-valued tile carries the LEVELS, which is the half of
  // `gapLine` that still says something — and a level prints its "of N".
  it('carries both sides’ levels with their denominators, and "not tracked" for a side that carried no row', () => {
    const tile = gapTile(gap({ state: 'level', gapPts: 1, b: side({ audience: 'industry-other', label: 'the category', observed: false, pct: null, value: { k: 0, n: 0 } }) }))
    expect(tile.label).toContain('you 31% of 84')
    expect(tile.label).toContain('the category — not tracked')
    expect(tile.label).not.toContain('0%')
  })

  it('prints the earlier reading only where the earlier reading concluded something', () => {
    const concluded = gap({ basis: { window: { kind: 'month', from: '2026-08-01', to: '2026-09-01' }, gapPts: -19, bandPts: 11.2, state: 'apart' } })
    expect(concludedBasisLine(concluded)).toContain('19')
    expect(gapTile(concluded).label).toContain('19')
    // A second refusal beside the first says nothing about August the line
    // above has not already said about September.
    const refusedBasis = gap({ basis: { window: { kind: 'month', from: '2026-08-01', to: '2026-09-01' }, gapPts: null, bandPts: null, state: 'too_little_data' } })
    expect(concludedBasisLine(refusedBasis)).toBeNull()
    expect(gapTile(refusedBasis).label).not.toContain('August')
  })
})

describe('leadVerdict', () => {
  it('takes the largest banded move, and only a move', () => {
    const small = verdict({ objectId: 's2', objectLabel: 'Price', changePts: -3.1 })
    const big = verdict({ objectId: 's3', objectLabel: 'Fit', changePts: 5.5 })
    const flat = verdict({ objectId: 's4', objectLabel: 'Colour', state: 'no_clear_change', changePts: 0.4 })
    const thin = verdict({ objectId: 's5', state: 'too_little_data', changePts: null, bandPts: null })
    expect(leadVerdict([small, big, flat, thin])?.objectId).toBe('s3')
    expect(leadVerdict([flat, thin])).toBeNull()
    expect(leadVerdict(undefined)).toBeNull()
  })

  it('breaks a tie on the larger n, so the one measured on more videos wins', () => {
    const few = verdict({ objectId: 'few', value: { k: 30, n: 200 }, changePts: 4 })
    const many = verdict({ objectId: 'many', value: { k: 300, n: 2000 }, changePts: -4 })
    expect(leadVerdict([few, many])?.objectId).toBe('many')
  })

  // TWO SURFACES CAN PUBLISH A VERDICT FOR ONE MEASUREMENT, and taking the
  // maximum meant the LOUDER reading won the brief's most prominent tile over a
  // sheet whose table prints the other.
  it('collapses two surfaces that agree about one measurement', () => {
    const a = verdict()
    const b = { ...verdict(), objectLabel: 'Durability (again)' }
    expect(leadVerdict([a, b])?.objectId).toBe('s1')
    expect(leadVerdict([a, b])?.changePts).toBe(3.2)
  })

  it('refuses a measurement two surfaces disagree about, and lets the next one lead', () => {
    const loud = verdict({ value: { k: 340, n: 1388 }, changePts: 5.5, bandPts: 3.1 })
    const quiet = verdict()
    const price = verdict({ objectId: 's2', objectLabel: 'Price', changePts: -3.1 })
    expect(leadVerdict([loud, quiet, price])?.objectId).toBe('s2')
    expect(leadVerdict([loud, quiet])).toBeNull()
  })

  // `CountedOver.measure` exists because two readings of one object are two
  // statements — a rival's cut of the panel's videos and of its comments are
  // both true, and neither is a duplicate of the other.
  it('keeps two readings of one object that measure different things', () => {
    const comments = verdict({ objectKind: 'rival', objectId: 'competitor:Freitag', objectLabel: 'Freitag', countedOver: { measure: 'comments', population: 'the panel’s comments' }, value: { k: 6200, n: 41200 }, changePts: 3 })
    const videos = verdict({ objectKind: 'rival', objectId: 'competitor:Freitag', objectLabel: 'Freitag', countedOver: { measure: 'videos', population: 'the panel’s videos' }, value: { k: 150, n: 1000 }, changePts: 4.2 })
    expect(leadVerdict([comments, videos])?.countedOver?.measure).toBe('videos')
  })
})

describe('verdictTile', () => {
  it('prints an arrow, a magnitude, the level with its "of N" and the band — and no direction word', () => {
    const tile = verdictTile(verdict())
    expect(tile.value).toBe('▲ 3.2 pts')
    expect(tile.label).toBe('Durability — 22%, 305 of 1,388. Band 2.1.')
    for (const word of ['growing', 'fading', 'rising', 'up', 'down']) expect(tile.label).not.toContain(word)
  })

  it('points the arrow down for a fall', () => {
    expect(verdictTile(verdict({ changePts: -3.1 })).value).toBe('▼ 3.1 pts')
  })
})

const doc = (over: Partial<DocumentSnapshotData> = {}): DocumentSnapshotData => ({
  version: 1,
  kind: 'document',
  template: 'market_brief',
  reportId: 'r',
  title: 'Marketing brief',
  audience: 'marketing',
  company: 'Sealand',
  period: 'September 2026',
  runId: null,
  figures: {},
  delta: null,
  pages: [],
  lens: { means: 'What it means', short: 'for it' },
  method: { conversations: 9120, videos: 2359, clientVideos: 84, competitorVideos: 142, period: 'p', sources: [], heldBack: 0, thin: false },
  notSureYet: [],
  generatedAt: '2026-09-28T09:00:00.000Z',
  model: 'm',
  promptVersion: 'v',
  ...over,
})

const reading = (over: Partial<NonNullable<DocumentSnapshotData['reading']>> = {}) => ({
  month: '2026-09-01',
  monthLabel: 'September 2026',
  monthStatus: 'filling' as const,
  readingAt: '2026-09-28T09:00:00.000Z',
  stamp: 'September 2026',
  denominators: [{ audience: 'industry-other', label: 'the category', videos: 1388, comments: 9120 }],
  platformMix: {},
  crossesClustering: false,
  ...over,
})

describe('overviewTiles', () => {
  it('with a reading: the gap, the largest banded move, and what the month was read on', () => {
    const tiles = overviewTiles(doc({ reading: reading({ gaps: [gap()], verdicts: [verdict()] }) }))
    expect(tiles).toHaveLength(3)
    expect(tiles[0].label).toContain('Durability')
    expect(tiles[1].value).toBe('▲ 3.2 pts')
    expect(tiles[2].label).toBe('comments read in September 2026, on 1,388 videos in the category')
    // The label a reader meets first never says "this update" over a month.
    for (const t of tiles) expect(t.label).not.toContain('this update')
  })

  it('drops a tile it cannot fill rather than printing an empty one', () => {
    expect(overviewTiles(doc({ reading: reading() }))).toHaveLength(1)
  })

  // A ZERO IS NOT A BASIS. `documentFigures` sets `f.conversations` from the
  // reading's own denominators whenever a reading exists, so the old fallback
  // could only ever re-print the zero that sent it there: the first tile of the
  // first sheet read "0 · comments read", with no month named.
  it('refuses the basis, in words, where the month has no denominators', () => {
    const tiles = overviewTiles(doc({
      reading: reading({ denominators: [] }),
      figures: { conversations: { label: 'comments read in September 2026', value: '0', kind: 'count' } },
    }))
    expect(tiles).toHaveLength(1)
    expect(tiles[0].value).toBe('not read yet')
    expect(tiles[0].word).toBe(true)
    expect(tiles[0].label).toContain('September 2026')
    expect(tiles[0].label).toContain('No denominator recorded for this month.')
  })

  // WITHOUT A READING nothing changes: the update's own three, exactly as they
  // were, and the method sheet says which basis the brief used.
  it('without a reading: the update’s own figures, with the rival beside the share', () => {
    const tiles = overviewTiles(doc({
      figures: {
        conversations: { label: 'conversations', value: '3,270', kind: 'count' },
        videos: { label: 'videos', value: '469', kind: 'count' },
        client_share_pct: { label: 'share', value: '2.8%', kind: 'pct' },
        ottobock_share_pct: { label: 'share', value: '9%', kind: 'pct' },
        positive_pct: { label: 'positive', value: '69.4%', kind: 'pct' },
      },
      pages: [{ id: 'c_ottobock', kind: 'competitor', title: 'Competitor', blocks: [], meta: { name: 'Ottobock' } }],
    }))
    expect(tiles.map((t) => t.value)).toEqual(['3,270', '2.8%', '69.4%'])
    expect(tiles[0].label).toBe('conversations read this update, on 469 videos')
    expect(tiles[1].label).toContain('Ottobock 9%')
  })
})
