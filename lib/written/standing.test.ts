import { describe, expect, it } from 'vitest'

import { objectReading, type MarketPoint } from '../agent/movement'
import { SEALAND_CLIENT_ID } from '../config'
import { quoteGate, type QuoteVideo } from '../quote-gate'
import type { PairComparability } from '../reading/comparability'
import { DIRECTION_RUN_LABEL } from '../reading/bands'
import { refuseEveryPair, type PairOn } from '../reading/pairs'
import { substituteFigures } from '../reports/cover'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '../rivals'
import type { SubjectCalibration } from '../subjects/calibration-state'
import type { DatedEvidence } from './evidence'
import { invertMembers } from './pool'
import {
  contentsOf, factsFromReadings, marketComparable, materialThemes, rungOf, standingKey, standingLine, subjectGate, subjectLenientGate,
  subjectMaterial, type SubjectReading,
} from './standing'
import type { StandingFact } from './types'

// Where the market stands (plan T2), on fixtures. The readings are built by
// the product's own `objectReading` (lib/agent/movement.ts), the function
// `loadObjectReadings` applies per subject, so the verdict, the band and the
// direction word here are the ones the loader returns; what is pinned is what
// this file adds: the rung, the rank, the sentence, and the subject's month.

const SEP = '2026-09-01'
const AFTER_2026 = '2027-01-01T00:00:00.000Z'
const TODAY = '2026-09-30T12:00:00.000Z'

/** A judge that reads every pair the same way (decision D's comparable). */
const joinEveryPair: PairOn = (prevMonth, month): PairComparability => ({ prevMonth, month, mode: 'comparable', reasons: [], row: null })

let n = 0
function subjectReading(o: {
  name: string
  calibration?: SubjectCalibration
  points: MarketPoint[]
  month?: string
  pair?: PairOn
  asOf?: string
  thin?: string[]
}): SubjectReading {
  n += 1
  const calibration = o.calibration ?? 'ready'
  const subject = { id: `s${n}`, name: o.name }
  const reading = objectReading(
    { object: { kind: 'subject', id: subject.id, label: o.name, calibration }, points: o.points, thin: new Set(o.thin ?? []) },
    o.month ?? SEP,
    o.pair ?? refuseEveryPair,
    o.asOf ?? TODAY,
  )
  return { subject, calibration, reading }
}

// Sealand's September as research C reads it: every pair before October is
// refused (Aug→Sep on the searches added in September), so a level only.
const AUG_SEP = (aug: [number, number], sep: [number, number]): MarketPoint[] => [
  { month: '2026-08-01', k: aug[0], n: aug[1] },
  { month: SEP, k: sep[0], n: sep[1] },
]

describe('the ladder: rungOf', () => {
  const base = { verdict: null, direction: null } as Pick<StandingFact, 'verdict' | 'direction'>
  it('prints nothing for anything but a ready subject, whatever it carries', () => {
    const moved = subjectReading({ name: 'x', points: AUG_SEP([66, 378], [196, 852]), pair: joinEveryPair }).reading?.verdict ?? null
    expect(rungOf({ calibration: 'provisional', verdict: moved, direction: 'growing' })).toBe('none')
    expect(rungOf({ calibration: 'unread', ...base })).toBe('none')
    expect(rungOf({ calibration: 'failed', ...base })).toBe('none')
    expect(rungOf({ calibration: 'ready', ...base, level: null })).toBe('none')
  })
  it('is the level with no comparable pair', () => {
    expect(rungOf({ calibration: 'ready', ...base })).toBe('level')
  })
  it('flat is not a direction to print', () => {
    const moved = subjectReading({ name: 'x', points: AUG_SEP([66, 378], [196, 852]), pair: joinEveryPair }).reading?.verdict ?? null
    expect(rungOf({ calibration: 'ready', verdict: moved, direction: 'flat' })).toBe('changed')
    expect(rungOf({ calibration: 'ready', verdict: null, direction: 'flat' })).toBe('level')
  })
})

describe('factsFromReadings: each rung, on the product readings', () => {
  it('Sealand today: the Aug→Sep pair is refused, so every ready subject is at the level', () => {
    const readings = [
      subjectReading({ name: 'Buying & delivery', points: AUG_SEP([66, 378], [196, 852]) }),
      subjectReading({ name: 'Looks & style', points: AUG_SEP([38, 378], [145, 852]) }),
      subjectReading({ name: 'Comfort', points: AUG_SEP([27, 378], [58, 852]) }),
    ]
    // The product itself refuses it; a comparison would otherwise say "moved".
    expect(readings[0].reading?.verdict?.state).toBe('refused')
    const facts = factsFromReadings(readings, marketComparable(refuseEveryPair, SEP))
    expect(facts.map((f) => [f.name, f.rung, f.verdict, f.direction, f.rank])).toEqual([
      ['Buying & delivery', 'level', null, null, 1],
      ['Looks & style', 'level', null, null, 2],
      ['Comfort', 'level', null, null, 3],
    ])
    expect(facts[0].level).toEqual({ k: 196, n: 852 })
    expect(facts[0].trail).toEqual([{ month: '2026-08-01', k: 66, n: 378 }, { month: SEP, k: 196, n: 852 }])
  })

  it('a comparable pair that moved earns the change rung', () => {
    const [fact] = factsFromReadings([subjectReading({ name: 'Buying & delivery', points: AUG_SEP([66, 378], [196, 852]), pair: joinEveryPair })], true)
    expect(fact.verdict?.state).toBe('moved')
    expect(fact.rung).toBe('changed')
  })

  it('a comparable pair with no clear change earns the change rung too', () => {
    const [fact] = factsFromReadings([subjectReading({ name: 'Comfort', points: AUG_SEP([60, 378], [140, 852]), pair: joinEveryPair })], true)
    expect(fact.verdict?.state).toBe('no_clear_change')
    expect(fact.rung).toBe('changed')
  })

  it('a thin month keeps its verdict but not the rung', () => {
    const [fact] = factsFromReadings([subjectReading({ name: 'Comfort', points: AUG_SEP([66, 378], [196, 852]), pair: joinEveryPair, thin: [SEP] })], true)
    expect(fact.verdict?.flags).toContain('thin')
    expect(fact.rung).toBe('level')
  })

  it('three comparable ended months in one direction earn the direction rung', () => {
    const points: MarketPoint[] = [
      { month: '2026-10-01', k: 38, n: 377 }, { month: '2026-11-01', k: 60, n: 377 }, { month: '2026-12-01', k: 90, n: 377 },
    ]
    const [fact] = factsFromReadings([subjectReading({ name: 'Looks & style', points, month: '2026-12-01', pair: joinEveryPair, asOf: AFTER_2026 })], true)
    expect(fact.direction).toBe('growing')
    expect(fact.rung).toBe('direction')
  })

  it('every tracked subject appears: provisional keeps its level unprinted, unread has none, failed is the name alone', () => {
    const facts = factsFromReadings([
      subjectReading({ name: 'Price', calibration: 'provisional', points: AUG_SEP([6, 378], [31, 852]), pair: joinEveryPair }),
      subjectReading({ name: 'Repair & warranty', calibration: 'failed', points: AUG_SEP([15, 378], [41, 852]), pair: joinEveryPair }),
      subjectReading({ name: 'Community & purpose', points: [{ month: '2026-08-01', k: 4, n: 378 }, { month: SEP, k: null, n: 852 }] }),
      subjectReading({ name: 'Comfort', points: AUG_SEP([27, 378], [58, 852]) }),
    ], true)
    expect(facts.map((f) => [f.name, f.calibration, f.rung, f.rank])).toEqual([
      ['Comfort', 'ready', 'level', 1],
      ['Price', 'provisional', 'none', 2],
      ['Community & purpose', 'unread', 'none', 0],
      ['Repair & warranty', 'failed', 'none', 0],
    ])
    expect(facts[1]).toMatchObject({ verdict: null, direction: null, level: { k: 31, n: 852 } })
    expect(facts[2]).toMatchObject({ level: null, verdict: null, direction: null })
    expect(facts[2].trail).toEqual([{ month: '2026-08-01', k: 4, n: 378 }, { month: SEP, k: null, n: 852 }])
    // Name only: no figure, no trail, no material. Nothing says why.
    expect(facts[3]).toEqual({
      subjectId: facts[3].subjectId, name: 'Repair & warranty', calibration: 'failed', level: null, rank: 0, trail: [],
      verdict: null, direction: null, rung: 'none', contents: [], notes: [], quoteRef: null,
    })
  })

  it('a failed subject that was never read is still listed, by name', () => {
    const facts = factsFromReadings([{ subject: { id: 'sf', name: 'Repair & warranty' }, calibration: 'failed', reading: null }], false)
    expect(facts).toMatchObject([{ subjectId: 'sf', name: 'Repair & warranty', calibration: 'failed', level: null, rung: 'none' }])
  })

  it('ranks by the level among the subjects that have one, largest first, ties by name', () => {
    const facts = factsFromReadings([
      subjectReading({ name: 'b', points: AUG_SEP([1, 378], [40, 852]) }),
      subjectReading({ name: 'd', points: [{ month: SEP, k: null, n: 852 }] }),
      subjectReading({ name: 'a', points: AUG_SEP([1, 378], [40, 852]) }),
      subjectReading({ name: 'c', calibration: 'provisional', points: AUG_SEP([1, 378], [90, 852]) }),
    ], false)
    expect(facts.map((f) => [f.name, f.rank])).toEqual([['c', 1], ['a', 2], ['b', 3], ['d', 0]])
  })
})

/** The sentence with its figures put back, as a surface renders it. */
const rendered = (s: { body: string; figures: Parameters<typeof substituteFigures>[1] }): string =>
  substituteFigures(s.body, s.figures).map((p) => ('text' in p ? p.text : p.figure)).join('')

describe('standingLine: one code sentence per rung', () => {
  const one = (o: Parameters<typeof subjectReading>[0], comparable = true): StandingFact => factsFromReadings([subjectReading(o)], comparable)[0]

  it('level: a whole percent of N at 100 videos, the rank as a word', () => {
    const f = one({ name: 'Buying & delivery', points: AUG_SEP([66, 378], [196, 852]) }, false)
    const line = standingLine(f, SEP)
    expect(line.body).toBe('[[subj_buying_delivery_level]] of [[subj_buying_delivery_n]] videos in your market in September, the biggest subject.')
    expect(line.figures.subj_buying_delivery_level).toMatchObject({ value: '23%', kind: 'pct' })
    expect(rendered(line)).toBe('23% of 852 videos in your market in September, the biggest subject.')
    // Code writes the figures; the words carry no digit of their own.
    expect(line.body.replace(/\[\[[a-z0-9_]+\]\]/g, '')).not.toMatch(/\d/)
  })

  it('level under 100 videos: the count of N', () => {
    const f = one({ name: 'Comfort', points: [{ month: SEP, k: 12, n: 80 }] }, false)
    expect(rendered(standingLine(f, SEP))).toBe('12 of 80 videos in your market in September, the biggest subject.')
  })

  it('changed: up or down on last month, beyond the normal swing; or no clear change', () => {
    const up = one({ name: 'Buying & delivery', points: AUG_SEP([66, 378], [196, 852]), pair: joinEveryPair })
    expect(rendered(standingLine(up, SEP))).toBe('23% of 852 videos in your market in September, the biggest subject; up on August, beyond the normal swing.')
    const down = one({ name: 'Comfort', points: AUG_SEP([90, 378], [60, 852]), pair: joinEveryPair })
    expect(standingLine(down, SEP).body).toContain('; down on August, beyond the normal swing.')
    const level = one({ name: 'Comfort', points: AUG_SEP([60, 378], [140, 852]), pair: joinEveryPair })
    expect(standingLine(level, SEP).body).toContain('; no clear change on August.')
  })

  it('direction: growing, 3rd month', () => {
    const f = one({
      name: 'Looks & style',
      points: [{ month: '2026-10-01', k: 38, n: 377 }, { month: '2026-11-01', k: 60, n: 377 }, { month: '2026-12-01', k: 90, n: 377 }],
      month: '2026-12-01', pair: joinEveryPair, asOf: AFTER_2026,
    })
    expect(rendered(standingLine(f, '2026-12-01'))).toBe(`24% of 377 videos in your market in December, the biggest subject; growing, ${DIRECTION_RUN_LABEL}.`)
  })

  it('a provisional, unread or failed subject has no sentence: its figure is not one we stand behind (§0a)', () => {
    const empty = { body: '', figures: {} }
    expect(standingLine(one({ name: 'Price', calibration: 'provisional', points: AUG_SEP([6, 378], [31, 852]) }, false), SEP)).toEqual(empty)
    expect(standingLine(one({ name: 'Community', points: [{ month: SEP, k: null, n: 852 }] }, false), SEP)).toEqual(empty)
    expect(standingLine(one({ name: 'Repair', calibration: 'failed', points: AUG_SEP([15, 378], [41, 852]) }, false), SEP)).toEqual(empty)
  })

  it('past the twelfth, no rank is said', () => {
    const f = { ...one({ name: 'Comfort', points: AUG_SEP([27, 378], [58, 852]) }, false), rank: 13 }
    expect(standingLine(f, SEP).body).toBe('[[subj_comfort_level]] of [[subj_comfort_n]] videos in your market in September.')
  })

  it('keys a subject by its name, folded to a figure key', () => {
    expect(standingKey({ name: 'Looks & style', subjectId: 'x' })).toBe('subj_looks_style')
    expect(standingKey({ name: 'Précio', subjectId: 'x' })).toBe('subj_precio')
    expect(standingKey({ name: '£$', subjectId: 'AB-12cd' })).toBe('subj_ab12cd')
  })
})

describe('marketComparable', () => {
  it('reads the reading month against the month before on the market view', () => {
    expect(marketComparable(refuseEveryPair, SEP)).toBe(false)
    expect(marketComparable(joinEveryPair, SEP)).toBe(true)
  })
})

// ---- The subject's month ---------------------------------------------------------------

const video = (n: number, over: Partial<QuoteVideo> = {}): QuoteVideo => ({
  platform: 'youtube', videoId: `yt${n}`, caption: 'Carry-on backpack review after a month of travel', hashtags: ['backpack'],
  topics: ['travel backpack'], accountName: `Creator ${n}`, isClient: false, isCompetitor: false, competitorName: null,
  source: 'discovered', segment: 'market', ...over,
})
let seq = 0
function ev(o: { insight: string; video: number; text: string; date?: string; audience?: string; segment?: string; author?: string; description?: string; insider?: boolean }): DatedEvidence {
  seq += 1
  const ctx = video(o.video, o.segment ? { segment: o.segment } : {})
  return {
    insightId: o.insight, kind: 'pain_point', description: o.description ?? `About ${o.insight}`, evidenceId: `e${String(seq).padStart(3, '0')}`,
    rank: 1, commentId: `c${seq}`, commentDate: o.date ?? '2026-09-10T00:00:00+00:00', author: o.author ?? `viewer${seq}`, text: o.text,
    lang: 'en', english: null,
    video: { uuid: `v${o.video}`, platform: 'youtube', videoId: `yt${o.video}`, audience: o.audience ?? INDUSTRY_AUDIENCE, lane: 'full', accountName: `Creator ${o.video}` },
    context: ctx,
    ...(o.insider ? { insider: true } : {}),
  }
}

const COMFORT = { name: 'Comfort', description: 'How comfortable a bag is to carry: straps, back panel, weight on the shoulders.' }
const WEEK = { from: '2026-09-20T04:18:00+00:00', to: '2026-09-27T04:03:00+00:00' }
const MARKET = new Set([INDUSTRY_AUDIENCE, 'competitor:Cotopaxi'])
const LINES = [
  'The straps on this backpack dig into my shoulders after an hour of walking.',
  'My back hurts when the backpack is full, the shoulder straps need more padding.',
  'The hip belt on this backpack is too thin and my hips are sore by the end of the day.',
  'This backpack has no load lifters so the weight pulls on my shoulders all day.',
]

describe('subjectMaterial', () => {
  const gate = subjectGate(SEALAND_CLIENT_ID, COMFORT)
  it('the fixtures pass the subject gate', () => {
    for (const text of LINES) expect(quoteGate({ text, lang: 'en', english: null, video: video(1) }, gate)).toMatchObject({ ok: true })
  })

  it("prefers this week's quote to the month's, and the category's to a brand's", () => {
    const evidence = [
      ev({ insight: 'i1', video: 1, text: LINES[0], date: '2026-09-03T00:00:00+00:00' }),
      ev({ insight: 'i2', video: 2, text: LINES[1], date: '2026-09-24T00:00:00+00:00', audience: 'competitor:Cotopaxi' }),
      ev({ insight: 'i3', video: 3, text: LINES[2], date: '2026-09-25T00:00:00+00:00' }),
    ]
    const m = subjectMaterial({ gate, memberIds: new Set(['i1', 'i2', 'i3']), evidence, market: MARKET, window: WEEK })
    expect(m.quoteRef).toMatchObject({ ref: `e:${evidence[2].evidenceId}`, text: '', date: '2026-09-25', thread: 'youtube::yt3' })
    // With no category quote this week, the brand's week quote.
    const m2 = subjectMaterial({ gate, memberIds: new Set(['i1', 'i2']), evidence, market: MARKET, window: WEEK })
    expect(m2.quoteRef?.ref).toBe(`e:${evidence[1].evidenceId}`)
    // With nothing this week, the month's.
    const m3 = subjectMaterial({ gate, memberIds: new Set(['i1']), evidence, market: MARKET, window: WEEK })
    expect(m3.quoteRef?.ref).toBe(`e:${evidence[0].evidenceId}`)
  })

  it("never quotes the client's own audience, a maker's video or the video's own account", () => {
    const evidence = [
      ev({ insight: 'i1', video: 1, text: LINES[0], audience: CLIENT_AUDIENCE }),
      ev({ insight: 'i2', video: 2, text: LINES[1], segment: 'maker' }),
      ev({ insight: 'i3', video: 3, text: LINES[2], author: 'Creator 3' }),
    ]
    const m = subjectMaterial({ gate, memberIds: new Set(['i1', 'i2', 'i3']), evidence, market: MARKET, window: WEEK })
    expect(m.quoteRef).toBeNull()
    // The own account's line still speaks to the subject: its insight is material.
    expect(m.notes).toEqual(['About i3'])
    expect([...m.insights]).toEqual(['i3'])
  })

  it('notes are descriptions of the insights the gate passes, one per wording, never the words', () => {
    const evidence = [
      ev({ insight: 'i1', video: 1, text: LINES[0], description: 'Straps dig in.' }),
      ev({ insight: 'i2', video: 2, text: LINES[1], description: 'Straps dig in.' }),
      ev({ insight: 'i3', video: 3, text: 'These jeans fit perfectly and the fabric is soft on my legs.', description: 'Jeans.' }),
      ev({ insight: 'i4', video: 4, text: LINES[3], description: 'No load lifters.' }),
    ]
    const m = subjectMaterial({ gate, memberIds: new Set(['i1', 'i2', 'i3', 'i4']), evidence, market: MARKET, window: WEEK })
    expect(m.notes).toEqual(['Straps dig in.', 'No load lifters.'])
    const json = JSON.stringify({ notes: m.notes, quoteRef: m.quoteRef })
    for (const e of evidence) expect(json).not.toContain(e.text.slice(0, 24))
  })
})

describe('the material is the market\'s (T3b)', () => {
  const lenient = subjectLenientGate(SEALAND_CLIENT_ID, COMFORT)
  const gate = subjectGate(SEALAND_CLIENT_ID, COMFORT)
  // A carry line the lenient subject gate passes but the strict one refuses.
  const ASIDE = 'I bought this backpack in green last spring for my trips.'

  it('the lenient subject gate is the strict one with nothing required', () => {
    expect(lenient).toEqual({ ...gate, requireRelevance: undefined })
    expect(quoteGate({ text: ASIDE, lang: 'en', english: null, video: video(1) }, gate).ok).toBe(false)
    expect(quoteGate({ text: ASIDE, lang: 'en', english: null, video: video(1) }, lenient).ok).toBe(true)
  })

  // Three themes inside Comfort: one the market carried on three videos, one
  // a single thread (Hermès's retail ritual, 27 Sep), one mostly makers'.
  const carried = { label: 'Straps dig in', memberIds: ['c1', 'c2', 'c3'] }
  const oneThread = { label: 'One thread only', memberIds: ['o1', 'o2'] }
  const makers = { label: 'Makers talk straps', memberIds: ['k1', 'k2', 'k3', 'k4'] }
  const evidence = [
    ev({ insight: 'c1', video: 1, text: LINES[0], description: 'Straps dig into the shoulders.' }),
    ev({ insight: 'c2', video: 2, text: ASIDE, description: 'Bought one for trips.' }), // lenient only
    ev({ insight: 'c3', video: 3, text: LINES[2], description: 'Hip belt too thin.' }),
    ev({ insight: 'o1', video: 9, text: LINES[1], description: 'One thread, first.' }),
    ev({ insight: 'o2', video: 9, text: LINES[3], description: 'One thread, second.' }),
    ev({ insight: 'k1', video: 11, text: LINES[0], segment: 'maker' }),
    ev({ insight: 'k2', video: 12, text: LINES[1], segment: 'maker' }),
    ev({ insight: 'k3', video: 13, text: LINES[2], description: 'Maker theme, market video 1.' }),
    ev({ insight: 'k4', video: 14, text: LINES[3], description: 'Maker theme, market video 2.' }),
    ev({ insight: 'k4', video: 15, text: LINES[0], description: 'Maker theme, market video 2.' }),
  ]
  const members = new Set(['c1', 'c2', 'c3', 'o1', 'o2', 'k1', 'k2', 'k3', 'k4', 'loose'])

  it('keeps a theme carried on three lenient-gated market videos; drops a one-thread theme and a maker-led one', () => {
    const kept = materialThemes({ lenient, memberIds: members, evidence, market: MARKET, themes: [carried, oneThread, makers] })
    expect(kept.map((t) => t.label)).toEqual(['Straps dig in'])
  })

  it('a brand insider does not carry a theme', () => {
    const withInsider = evidence.map((e) => (e.insightId === 'c3' ? { ...e, insider: true } : e))
    expect(materialThemes({ lenient, memberIds: members, evidence: withInsider, market: MARKET, themes: [carried] })).toEqual([])
  })

  it('notes come only from insights of a carried theme, on the lenient gate; the quote is still strict', () => {
    const m = subjectMaterial({ gate, lenient, memberIds: members, evidence: [...evidence, ev({ insight: 'loose', video: 20, text: LINES[1], description: 'In no theme.' })], market: MARKET, window: WEEK, themes: [carried, oneThread, makers] })
    expect(m.material.map((t) => t.label)).toEqual(['Straps dig in'])
    expect(m.notes.sort()).toEqual(['Bought one for trips.', 'Hip belt too thin.', 'Straps dig into the shoulders.'])
    expect(m.quoteRef?.ref).not.toBe(`e:${evidence[1].evidenceId}`) // the aside never prints
  })

  it('without themes, the notes are every lenient-gated insight (the pure default)', () => {
    const m = subjectMaterial({ gate, memberIds: new Set(['c1', 'c2']), evidence, market: MARKET, window: WEEK })
    expect(m.notes.sort()).toEqual(['Bought one for trips.', 'Straps dig into the shoulders.'])
    expect(m.material).toEqual([])
  })

  it('never quotes or notes a brand insider', () => {
    const inside = [ev({ insight: 'c1', video: 1, text: LINES[0], description: 'Insider praise.', insider: true, date: '2026-09-24T00:00:00+00:00' })]
    const m = subjectMaterial({ gate, lenient, memberIds: new Set(['c1']), evidence: inside, market: MARKET, window: WEEK })
    expect(m.quoteRef).toBeNull()
    expect(m.notes).toEqual([])
  })
})

describe('contentsOf', () => {
  const subjectsOf = invertMembers(new Map([
    ['comfort', ['i1', 'i2', 'i3', 'i4', 'i5', 'i6']],
    ['price', ['p1', 'p2', 'p3']],
  ]))
  it('names the themes inside the subject heard this month, the most of its insights first', () => {
    const themes = [
      { label: 'Straps and padding', memberIds: ['i1', 'i2', 'i3', 'x1'] },          // comfort 3 of 4, 2 heard
      { label: 'Heavy packs hurt', memberIds: ['i4', 'i5', 'i6', 'x2'] },            // comfort 3 of 4, 1 heard
      { label: 'Comfort not heard this month', memberIds: ['i5', 'i6', 'i3', 'x3'] }, // comfort, 0 heard
      { label: 'Mostly about price', memberIds: ['p1', 'p2', 'p3', 'i1'] },          // price's, not comfort's
      { label: 'A little comfort', memberIds: ['i2', 'x4', 'x5', 'x6', 'x7'] },      // comfort 1 of 5: under three members
    ]
    expect(contentsOf('comfort', new Set(['i1', 'i2', 'i4']), themes, subjectsOf, ['comfort', 'price'])).toEqual(['Straps and padding', 'Heavy packs hurt'])
  })
  it('names at most five', () => {
    const themes = Array.from({ length: 8 }, (_, i) => ({ label: `T${i}`, memberIds: [`a${i}`, `b${i}`, `c${i}`] }))
    const members = invertMembers(new Map([['s', themes.flatMap((t) => t.memberIds)]]))
    expect(contentsOf('s', new Set(themes.map((t) => t.memberIds[0])), themes, members, ['s'])).toHaveLength(5)
  })
})
