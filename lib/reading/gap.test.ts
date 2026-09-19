import { describe, expect, it } from 'vitest'
import { directionRe } from '../test/copy-contract'
import {
  GAP_WORDS,
  gapBasisLine,
  gapBetween,
  gapDirection,
  gapFigures,
  gapLine,
  gapPrintsLevel,
  inheritRefusal,
  sidePct,
  type GapReading,
  type GapSide,
} from './gap'
import type { VerdictWindow } from './verdicts'

// D1's tests. The shape under them is the mock's own reading — Sealand's
// September against Freitag's, and the June pair the mock writes as "narrowed
// from 19".

const monthWindow = (month: string, next: string): VerdictWindow => ({ kind: 'month', from: month, to: next })

const SEP = monthWindow('2026-09-01', '2026-10-01')
const JUN = monthWindow('2026-06-01', '2026-07-01')

const side = (over: Partial<GapSide> = {}): GapSide => ({
  audience: 'client',
  label: 'you',
  value: { k: 26, n: 84 },
  pct: 31,
  observed: true,
  ...over,
})

const them = (over: Partial<GapSide> = {}): GapSide =>
  side({ audience: 'competitor:Freitag', label: 'Freitag', value: { k: 62, n: 142 }, pct: 43.7, ...over })

const durability = {
  objectKind: 'subject' as const,
  objectId: 's1',
  objectLabel: 'Durability',
}

describe('sidePct', () => {
  it('prints what the surface prints, so the gap cannot disagree with the levels beside it', () => {
    expect(sidePct(side({ pct: 31 }))).toBe(31)
  })

  it('derives the share from the counts where the side prints none', () => {
    expect(sidePct(side({ pct: null, value: { k: 26, n: 84 } }))).toBe(31)
  })

  it('has no share where there is no denominator', () => {
    expect(sidePct(side({ pct: null, value: { k: 0, n: 0 } }))).toBeNull()
  })
})

describe('gapBetween — both sides present', () => {
  it('is apart where the difference clears its band', () => {
    // A quarter's n, which is where the mock's claim first becomes sayable:
    // 31% of 252 against 43.7% of 426.
    const gap = gapBetween({
      ...durability,
      a: side({ value: { k: 78, n: 252 } }),
      b: them({ value: { k: 186, n: 426 } }),
      window: { kind: 'quarter', from: '2026-07-01', to: '2026-10-01' },
    })
    expect(gap.state).toBe('apart')
    expect(gap.gapPts).toBe(-12.7)
    expect(gap.bandPts).toBeGreaterThan(0)
    expect(gap.bandPts as number).toBeLessThan(12.7)
    expect(gap.direction).toBeNull()
    expect(gap.basis).toBeNull()
  })

  it('is level where the difference is inside the band', () => {
    const gap = gapBetween({
      ...durability,
      a: side({ value: { k: 78, n: 252 }, pct: 31 }),
      b: them({ value: { k: 134, n: 426 }, pct: 31.5 }),
      window: SEP,
    })
    expect(gap.state).toBe('level')
    expect(gap.gapPts).toBe(-0.5)
    expect(Math.abs(gap.gapPts as number)).toBeLessThanOrEqual(gap.bandPts as number)
  })

  it('reads too few to compare on the mock’s own September numbers — your audience is 84 videos, under the 100-video floor', () => {
    const gap = gapBetween({ ...durability, a: side(), b: them(), window: SEP })
    expect(gap.state).toBe('too_little_data')
    expect(gapLine(gap)).toContain(GAP_WORDS.too_little_data)
  })

  it('refuses a side that clears the denominator floor but not the object’s own ten videos', () => {
    const gap = gapBetween({
      ...durability,
      a: side({ value: { k: 4, n: 252 }, pct: 1.6 }),
      b: them({ value: { k: 186, n: 426 } }),
      window: SEP,
    })
    expect(gap.state).toBe('too_little_data')
    // The counts are real and still print; the difference does not exist on the
    // object at all, so no port can bind it by accident.
    expect(gap.gapPts).toBeNull()
    expect(gap.bandPts).toBeNull()
    expect(gap.a.value).toEqual({ k: 4, n: 252 })
  })

  it('never draws a band narrower than two points', () => {
    // Two near-identical, enormous denominators: 2×SE is a fraction of a point.
    const gap = gapBetween({
      ...durability,
      a: side({ value: { k: 5000, n: 100000 }, pct: 5 }),
      b: them({ value: { k: 5010, n: 100000 }, pct: 5.01 }),
      window: SEP,
    })
    expect(gap.bandPts).toBe(2)
    expect(gap.state).toBe('level')
  })
})

describe('gapBetween — a side that was never read', () => {
  it('is too few to compare where one side carried no row at all', () => {
    const gap = gapBetween({
      ...durability,
      a: side({ value: { k: 78, n: 252 } }),
      b: them({ observed: false, value: { k: 0, n: 0 }, pct: null }),
      window: SEP,
    })
    expect(gap.state).toBe('too_little_data')
    expect(gap.gapPts).toBeNull()
    expect(gap.bandPts).toBeNull()
    expect(gapLine(gap)).toContain('Freitag — not tracked')
  })

  it('is too few to compare where neither side was read — the M3/M4-unapplied state', () => {
    const gap = gapBetween({
      ...durability,
      a: side({ observed: false, value: { k: 0, n: 0 }, pct: null }),
      b: them({ observed: false, value: { k: 0, n: 0 }, pct: null }),
      window: SEP,
    })
    expect(gap.state).toBe('too_little_data')
    expect(gapFigures(gap, 'durability')).toEqual({})
  })
})

describe('gapBetween — refusals', () => {
  const causes = ['rename', 'tracking_change', 'clustering_changed', 'unlogged_era'] as const

  for (const cause of causes) {
    it(`refuses the difference on ${cause}, keeps the counts, states no magnitude`, () => {
      const gap = gapBetween({
        ...durability,
        a: side({ value: { k: 78, n: 252 } }),
        b: them({ value: { k: 186, n: 426 } }),
        window: SEP,
        refused: cause,
      })
      expect(gap.state).toBe('refused')
      expect(gap.refusedReason).toBe(cause)
      expect(gap.gapPts).toBeNull()
      expect(gap.bandPts).toBeNull()
      // The levels survive a refusal; only the difference is withheld.
      expect(gap.a.value).toEqual({ k: 78, n: 252 })
      expect(gapLine(gap)).toContain(GAP_WORDS.refused)
      expect(gapLine(gap)).toContain('of 252')
    })
  }

  it('carries the refusal to the basis, so no earlier gap prints beside a refused one', () => {
    const gap = gapBetween({
      ...durability,
      a: side({ value: { k: 78, n: 252 } }),
      b: them({ value: { k: 186, n: 426 } }),
      window: SEP,
      basis: { a: side({ value: { k: 60, n: 273 } }), b: them({ value: { k: 175, n: 427 } }), window: JUN },
      refused: 'rename',
    })
    expect(gap.basis?.state).toBe('refused')
    expect(gap.basis?.gapPts).toBeNull()
    expect(gapBasisLine(gap)).toBe('comparison refused in June')
  })
})

describe('the basis — the mock’s "from 19 in June"', () => {
  const withBasis = () =>
    gapBetween({
      ...durability,
      a: side({ value: { k: 78, n: 252 }, pct: 31 }),
      b: them({ value: { k: 186, n: 426 }, pct: 43.7 }),
      window: SEP,
      basis: {
        a: side({ value: { k: 60, n: 273 }, pct: 22 }),
        b: them({ value: { k: 175, n: 427 }, pct: 41 }),
        window: JUN,
      },
    })

  it('is a second dated reading with its own band, never the word "narrowed"', () => {
    const gap = withBasis()
    expect(gap.basis?.state).toBe('apart')
    expect(gap.basis?.gapPts).toBe(-19)
    const line = gapBasisLine(gap)
    expect(line).toMatch(/^19 points apart in June \(band \d/)
    expect(line).not.toContain('narrowed')
  })

  it('is null where no earlier window was handed in', () => {
    const gap = gapBetween({ ...durability, a: side(), b: them(), window: SEP })
    expect(gapBasisLine(gap)).toBeNull()
  })

  it('says the basis was too thin rather than printing a magnitude for it', () => {
    const gap = gapBetween({
      ...durability,
      a: side({ value: { k: 78, n: 252 }, pct: 31 }),
      b: them({ value: { k: 186, n: 426 }, pct: 43.7 }),
      window: SEP,
      basis: { a: side({ value: { k: 16, n: 73 }, pct: 22 }), b: them({ value: { k: 52, n: 127 }, pct: 41 }), window: JUN },
    })
    expect(gap.basis?.state).toBe('too_little_data')
    expect(gapBasisLine(gap)).toBe('too few to compare in June')
  })
})

describe('gapLine', () => {
  it('prints both levels with their "of N" and the magnitude only where the gap is apart', () => {
    const gap = gapBetween({
      ...durability,
      a: side({ value: { k: 78, n: 252 }, pct: 31 }),
      b: them({ value: { k: 186, n: 426 }, pct: 43.7 }),
      window: SEP,
    })
    expect(gapLine(gap)).toBe('you 31.0% of 252 · Freitag 43.7% of 426 · 12.7 points apart (band 7.6)')
  })

  it('states no magnitude beside a word that refuses the comparison (D2)', () => {
    const thin = gapBetween({ ...durability, a: side(), b: them(), window: SEP })
    expect(gapLine(thin)).toBe('you 31.0% of 84 · Freitag 43.7% of 142 · too few to compare')
    expect(gapLine(thin)).not.toMatch(/\d+(\.\d)? points/)
  })

  it('prints the band beside "no clear difference", because the band is the evidence for it', () => {
    const level = gapBetween({
      ...durability,
      a: side({ value: { k: 78, n: 252 }, pct: 31 }),
      b: them({ value: { k: 134, n: 426 }, pct: 31.5 }),
      window: SEP,
    })
    expect(gapLine(level)).toMatch(/· no clear difference \(band \d/)
    // NOT the bare word "level": the two clauses before it ARE levels, and
    // `GLOSSARY.level` has that word for something else entirely.
    expect(gapLine(level)).not.toMatch(/· level/)
    expect(level.state).toBe('level')
  })

  it('names its window where the figures beside it are of another period', () => {
    const quarter = gapBetween({
      ...durability,
      a: side({ value: { k: 78, n: 252 }, pct: 31 }),
      b: them({ value: { k: 186, n: 426 }, pct: 43.7 }),
      window: { kind: 'quarter', from: '2026-07-01', to: '2026-10-01' },
    })
    expect(gapLine(quarter, { period: true })).toBe(
      'The quarter from July 2026 · you 31.0% of 252 · Freitag 43.7% of 426 · 12.7 points apart (band 7.6)',
    )
    // And it is opt-in: a surface whose other figures are of the same window
    // prints the bare sentence, exactly as before.
    expect(gapLine(quarter)).toBe('you 31.0% of 252 · Freitag 43.7% of 426 · 12.7 points apart (band 7.6)')
    expect(gapLine(quarter, {})).toBe(gapLine(quarter))
  })

  it('names a month window the same way', () => {
    const thin = gapBetween({ ...durability, a: side(), b: them(), window: SEP })
    expect(gapLine(thin, { period: true })).toBe(
      'September 2026 · you 31.0% of 84 · Freitag 43.7% of 142 · too few to compare',
    )
  })

  it('carries no direction word anywhere in any state — the copy contract’s rule (c)', () => {
    const gaps = [
      gapBetween({ ...durability, a: side({ value: { k: 78, n: 252 } }), b: them({ value: { k: 186, n: 426 } }), window: SEP, basis: { a: side({ value: { k: 60, n: 273 } }), b: them({ value: { k: 175, n: 427 } }), window: JUN } }),
      gapBetween({ ...durability, a: side(), b: them(), window: SEP }),
      gapBetween({ ...durability, a: side(), b: them({ observed: false, value: { k: 0, n: 0 }, pct: null }), window: SEP }),
      gapBetween({ ...durability, a: side(), b: them(), window: SEP, refused: 'rename' }),
    ]
    for (const gap of gaps) {
      const text = `${gapLine(gap)} ${gapBasisLine(gap) ?? ''}`
      expect(text.match(directionRe())).toBeNull()
    }
  })
})

// THE MARKER'S CONDITION, NOT THE RENDERED STRING (the fix pass, E-monthly
// review [Minor]). The monthly email decided `data-copy="level"` by testing
// the line for /\bof\s\d/, which is true exactly when rule (b) would already
// pass — so the rule could never fail on that node, and a `levelOf` that
// printed "31% (84 videos)" would have dropped the marker instead of turning a
// test red.
describe('gapPrintsLevel', () => {
  it('is true where either side was read and carries a denominator', () => {
    expect(gapPrintsLevel(gapBetween({ ...durability, a: side(), b: them(), window: SEP }))).toBe(true)
    expect(gapPrintsLevel(gapBetween({ ...durability, a: side({ observed: false }), b: them(), window: SEP }))).toBe(true)
  })

  it('is false where neither side printed a level, so there is no evidence to owe', () => {
    const neither = gapBetween({
      ...durability,
      a: side({ observed: false }),
      b: them({ observed: false }),
      window: SEP,
    })
    expect(gapPrintsLevel(neither)).toBe(false)
    expect(gapLine(neither)).toBe('you — not tracked · Freitag — not tracked · too few to compare')
  })

  it('agrees with what the line actually printed, on every shape the module makes', () => {
    const shapes = [
      gapBetween({ ...durability, a: side(), b: them(), window: SEP }),
      gapBetween({ ...durability, a: side({ value: { k: 78, n: 252 }, pct: 31 }), b: them({ value: { k: 186, n: 426 }, pct: 43.7 }), window: SEP }),
      gapBetween({ ...durability, a: side({ observed: false }), b: them({ observed: false }), window: SEP }),
      gapBetween({ ...durability, a: side({ value: { k: 0, n: 0 }, pct: null }), b: them({ value: { k: 0, n: 0 }, pct: null }), window: SEP }),
    ]
    for (const gap of shapes) expect(gapPrintsLevel(gap)).toBe(/\bof\s\d/.test(gapLine(gap)))
  })
})

describe('gapFigures', () => {
  it('names the gap only where the product would print it', () => {
    const apart = gapBetween({
      ...durability,
      a: side({ value: { k: 78, n: 252 } }),
      b: them({ value: { k: 186, n: 426 } }),
      window: SEP,
    })
    const table = gapFigures(apart, 'durability')
    expect(table.durability_gap_pts).toEqual({
      value: 12.7,
      unit: 'pts',
      label: 'points between you and Freitag on Durability',
    })
    expect(table.durability_you_k.value).toBe(78)
    expect(table.durability_you_n.value).toBe(252)
    expect(table.durability_them_k.value).toBe(186)
    expect(table.durability_them_n.value).toBe(426)
  })

  it('withholds the magnitude from a model wherever the page withholds it from a reader', () => {
    const thin = gapBetween({ ...durability, a: side(), b: them(), window: SEP })
    // And it is withheld from the DATA too, not only from the two printers: a
    // `too few to compare` gap carries no magnitude and no band, so a surface
    // that binds the field cannot print the number the word refused.
    expect(thin.gapPts).toBeNull()
    expect(thin.bandPts).toBeNull()
    expect(gapFigures(thin, 'durability').durability_gap_pts).toBeUndefined()
    expect(gapFigures(thin, 'durability').durability_you_n.value).toBe(84)
  })
})

describe('gapDirection', () => {
  const reading = (month: string, next: string, gapPts: number, over: Partial<GapReading> = {}): GapReading => ({
    window: monthWindow(month, next),
    gapPts,
    bandPts: 2,
    state: 'apart',
    regime: 'c1',
    pair: 'client|competitor:Freitag',
    ...over,
  })

  const widening: GapReading[] = [
    reading('2026-07-01', '2026-08-01', -8),
    reading('2026-08-01', '2026-09-01', -14),
    reading('2026-09-01', '2026-10-01', -19),
  ]

  it('returns null with allowed: false even on three clean readings — no reader flag is true in wave 1', () => {
    expect(gapDirection(widening, false)).toBeNull()
  })

  it('reads a widening gap as growing when a reader is allowed one', () => {
    expect(gapDirection(widening, true)).toBe('growing')
  })

  it('reads a closing gap as fading — the mock’s "narrowed", earned', () => {
    const closing = [
      reading('2026-07-01', '2026-08-01', -19),
      reading('2026-08-01', '2026-09-01', -14),
      reading('2026-09-01', '2026-10-01', -8),
    ]
    expect(gapDirection(closing, true)).toBe('fading')
  })

  it('returns null below three readings', () => {
    expect(gapDirection(widening.slice(1), true)).toBeNull()
  })

  it('returns null across a skipped month — September against June is not a run', () => {
    const skipped = [
      reading('2026-06-01', '2026-07-01', -8),
      reading('2026-08-01', '2026-09-01', -14),
      reading('2026-09-01', '2026-10-01', -19),
    ]
    expect(gapDirection(skipped, true)).toBeNull()
  })

  it('returns null across a re-grouping, and across two unknown regimes', () => {
    const regrouped = widening.map((r, i) => ({ ...r, regime: i === 0 ? 'c0' : 'c1' }))
    expect(gapDirection(regrouped, true)).toBeNull()
    const unknown = widening.map((r) => ({ ...r, regime: null }))
    expect(gapDirection(unknown, true)).toBeNull()
  })

  it('returns null where a reading in the run refused or was too thin', () => {
    const holed = widening.map((r, i) => (i === 1 ? { ...r, state: 'too_little_data' as const } : r))
    expect(gapDirection(holed, true)).toBeNull()
  })

  it('is flat where three readings exist and do not agree', () => {
    const wobble = [
      reading('2026-07-01', '2026-08-01', -14),
      reading('2026-08-01', '2026-09-01', -8),
      reading('2026-09-01', '2026-10-01', -19),
    ]
    expect(gapDirection(wobble, true)).toBe('flat')
  })

  it('returns null where the run changes which two audiences it compares', () => {
    const swapped = widening.map((r, i) => (i === 0 ? { ...r, pair: 'client|competitor:Cotopaxi' } : r))
    expect(gapDirection(swapped, true)).toBeNull()
    // And two unknown pairs are not one pair, as two unknown regimes are not
    // one regime.
    expect(gapDirection(widening.map((r) => ({ ...r, pair: null })), true)).toBeNull()
  })

  it('bands the whole move across BOTH endpoints, not on the newest reading alone', () => {
    // First to last is 3 points against a newest band of 2.5 — a word under
    // the old rule. The move is a difference of differences, so its band is
    // sqrt(2.5² + 2.5²) = 3.5, and 3 does not clear it.
    const crawl = [
      reading('2026-07-01', '2026-08-01', -8, { bandPts: 2.5 }),
      reading('2026-08-01', '2026-09-01', -10, { bandPts: 2.5 }),
      reading('2026-09-01', '2026-10-01', -11, { bandPts: 2.5 }),
    ]
    expect(gapDirection(crawl, true)).toBe('flat')
    // A move that clears the wider band still earns its word.
    expect(gapDirection(widening, true)).toBe('growing')
  })

  it('is flat where the readings agree but the whole move is inside the band', () => {
    const crawl = [
      reading('2026-07-01', '2026-08-01', -8, { bandPts: 4 }),
      reading('2026-08-01', '2026-09-01', -9, { bandPts: 4 }),
      reading('2026-09-01', '2026-10-01', -10, { bandPts: 4 }),
    ]
    expect(gapDirection(crawl, true)).toBe('flat')
  })

  it('returns null on a quarter series — a direction is read off consecutive months', () => {
    const quarters = widening.map((r) => ({ ...r, window: { ...r.window, kind: 'quarter' as const } }))
    expect(gapDirection(quarters, true)).toBeNull()
  })
})

describe('the basis names its year only when it is not the reading’s own', () => {
  const DEC = monthWindow('2025-12-01', '2026-01-01')
  const JAN = monthWindow('2026-01-01', '2026-02-01')

  const across = () =>
    gapBetween({
      ...durability,
      a: side({ value: { k: 78, n: 252 }, pct: 31 }),
      b: them({ value: { k: 186, n: 426 }, pct: 43.7 }),
      window: JAN,
      basis: {
        a: side({ value: { k: 60, n: 273 }, pct: 22 }),
        b: them({ value: { k: 175, n: 427 }, pct: 41 }),
        window: DEC,
      },
    })

  it('prints the year where the basis is in another one — December is not this January’s December', () => {
    expect(gapBasisLine(across())).toBe('19 points apart in December 2025 (band 6.9)')
  })

  it('leaves the year off where both readings sit in one, as the house does', () => {
    const inYear = gapBetween({
      ...durability,
      a: side({ value: { k: 78, n: 252 }, pct: 31 }),
      b: them({ value: { k: 186, n: 426 }, pct: 43.7 }),
      window: SEP,
      basis: {
        a: side({ value: { k: 60, n: 273 }, pct: 22 }),
        b: them({ value: { k: 175, n: 427 }, pct: 41 }),
        window: JUN,
      },
    })
    expect(gapBasisLine(inYear)).toMatch(/^19 points apart in June \(band /)
  })
})

describe('inheritRefusal — the refusal a gap takes from the readings beside it', () => {
  const answered = { state: 'moved' as const }
  const refused = (reason?: 'rename' | 'tracking_change') => ({ state: 'refused' as const, refusedReason: reason })

  it('draws the gap where neither side refused', () => {
    expect(inheritRefusal([answered, answered])).toEqual({ refused: false, reason: null })
  })

  it('asks EVERY side, not only the first — a refused first side with no reason hid the second', () => {
    expect(inheritRefusal([refused(), refused('tracking_change')])).toEqual({
      refused: true,
      reason: 'tracking_change',
    })
  })

  it('refuses on either side alone', () => {
    expect(inheritRefusal([answered, refused('rename')]).reason).toBe('rename')
    expect(inheritRefusal([refused('rename'), answered]).reason).toBe('rename')
  })

  it('says a side refused even where none of them said why, so the caller can draw nothing', () => {
    expect(inheritRefusal([refused(), answered])).toEqual({ refused: true, reason: null })
  })
})
