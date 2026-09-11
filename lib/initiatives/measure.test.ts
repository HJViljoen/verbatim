import { describe, it, expect } from 'vitest'
import {
  measureInitiative, initiativeLine, wentTheirWay, INITIATIVE_FLAT_BAND, type ObservationPoint,
} from './measure'

// One observation of one theme in one update.
const obs = (runId: string, date: string, evidence: number, sentiment: string | null = 'neutral', createdAt = `${date}T08:00:00Z`): ObservationPoint =>
  ({ runId, runDate: date, createdAt, evidenceCount: evidence, sentiment })

describe('measureInitiative', () => {
  it('is too early on nothing, and on a single update', () => {
    const none = measureInitiative([], {}, '2026-08-01')
    expect(none).toMatchObject({ verdict: 'too_early', points: [], delta: null, startShare: null })

    const one = measureInitiative([obs('r1', '2026-08-03', 10)], { r1: 100 }, '2026-08-01')
    expect(one.verdict).toBe('too_early')
    expect(one.points).toEqual([{ date: '2026-08-03', share: 10, sentiment: 0, evidence: 10 }])
    expect(one.delta).toBeNull()
  })

  it('reads share as a percentage of everything that update heard, not a raw count', () => {
    // The count doubles; so does the corpus. The share has not moved.
    const m = measureInitiative(
      [obs('r1', '2026-08-03', 10), obs('r2', '2026-08-10', 20)],
      { r1: 100, r2: 200 },
      '2026-08-01',
    )
    expect(m.points.map((p) => p.share)).toEqual([10, 10])
    expect(m.verdict).toBe('flat')
    expect(m.delta).toBe(0)
  })

  it('moves up when the share grows past the flat band, and reports the gap in points', () => {
    const m = measureInitiative(
      [obs('r1', '2026-08-03', 10), obs('r2', '2026-08-10', 14), obs('r3', '2026-08-17', 16)],
      { r1: 100, r2: 100, r3: 100 },
      '2026-08-01',
    )
    expect(m.verdict).toBe('moving_up')
    expect(m.delta).toBe(6)
    expect(m.startShare).toBe(10)
    expect(m.latestShare).toBe(16)
  })

  it('moves down when it shrinks', () => {
    const m = measureInitiative(
      [obs('r1', '2026-08-03', 20), obs('r2', '2026-08-10', 12)],
      { r1: 100, r2: 100 },
      '2026-08-01',
    )
    expect(m.verdict).toBe('moving_down')
    expect(m.delta).toBe(-8)
  })

  it('stays flat just inside the band and moves just outside it', () => {
    const inside = measureInitiative([obs('r1', '2026-08-03', 100), obs('r2', '2026-08-10', 109)], { r1: 1000, r2: 1000 }, '2026-08-01')
    expect(inside.delta).toBe(0.9)
    expect(Math.abs(inside.delta!)).toBeLessThan(INITIATIVE_FLAT_BAND)
    expect(inside.verdict).toBe('flat')

    const outside = measureInitiative([obs('r1', '2026-08-03', 100), obs('r2', '2026-08-10', 111)], { r1: 1000, r2: 1000 }, '2026-08-01')
    expect(outside.delta).toBe(1.1)
    expect(outside.verdict).toBe('moving_up')
  })

  it('sums every theme of the initiative into one line', () => {
    const m = measureInitiative(
      [obs('r1', '2026-08-03', 6), obs('r1', '2026-08-03', 4), obs('r2', '2026-08-10', 20)],
      { r1: 100, r2: 100 },
      '2026-08-01',
    )
    expect(m.points.map((p) => p.evidence)).toEqual([10, 20])
    expect(m.points.map((p) => p.share)).toEqual([10, 20])
  })

  it('ignores everything before the day it was declared', () => {
    const m = measureInitiative(
      [obs('r0', '2026-07-27', 50), obs('r1', '2026-08-03', 10), obs('r2', '2026-08-10', 11)],
      { r0: 100, r1: 100, r2: 100 },
      '2026-08-01',
    )
    expect(m.points.map((p) => p.date)).toEqual(['2026-08-03', '2026-08-10'])
    expect(m.startShare).toBe(10)
  })

  it('collapses two updates on one calendar day to the later one', () => {
    const m = measureInitiative(
      [
        obs('r1', '2026-08-03', 10, 'neutral', '2026-08-03T06:00:00Z'),
        obs('r1b', '2026-08-03', 30, 'neutral', '2026-08-03T19:00:00Z'),
        obs('r2', '2026-08-10', 12),
      ],
      { r1: 100, r1b: 100, r2: 100 },
      '2026-08-01',
    )
    expect(m.points.map((p) => p.date)).toEqual(['2026-08-03', '2026-08-10'])
    expect(m.points[0].share).toBe(30)
  })

  it('weights sentiment by evidence and leaves it null when nothing was rated', () => {
    const m = measureInitiative(
      [obs('r1', '2026-08-03', 6, 'negative'), obs('r1', '2026-08-03', 4, 'positive'), obs('r2', '2026-08-10', 10, 'positive')],
      { r1: 100, r2: 100 },
      '2026-08-01',
    )
    expect(m.points[0].sentiment).toBe(-0.2) // (4 − 6) / 10
    expect(m.points[1].sentiment).toBe(1)
    expect(m.sentimentDelta).toBe(1.2)

    const unrated = measureInitiative([obs('r1', '2026-08-03', 5, null), obs('r2', '2026-08-10', 5, null)], { r1: 100, r2: 100 }, '2026-08-01')
    expect(unrated.points.every((p) => p.sentiment === null)).toBe(true)
    expect(unrated.sentimentDelta).toBeNull()
  })

  it('reads 0% rather than dividing by an update with no themes at all', () => {
    const m = measureInitiative([obs('r1', '2026-08-03', 10), obs('r2', '2026-08-10', 10)], { r1: 100 }, '2026-08-01')
    expect(m.points[1].share).toBe(0)
  })
})

describe('initiativeLine', () => {
  const measure = (evidences: number[]) =>
    measureInitiative(
      evidences.map((e, i) => obs(`r${i}`, `2026-08-0${i + 1}`, e)),
      Object.fromEntries(evidences.map((_, i) => [`r${i}`, 100])),
      '2026-08-01',
    )

  it('says what the share did and never that it worked', () => {
    expect(initiativeLine(measure([10, 14]), '1 Aug')).toBe('Up 4.0 points since 1 Aug · 2 updates')
    expect(initiativeLine(measure([20, 12]), '1 Aug')).toBe('Down 8.0 points since 1 Aug · 2 updates')
    expect(initiativeLine(measure([10, 10]), '1 Aug')).toBe('Holding steady since 1 Aug · 2 updates')
  })

  it('is honest about having too little to say', () => {
    expect(initiativeLine(measure([]), '1 Aug')).toBe('Nothing heard on this since 1 Aug — it lands with the next update.')
    expect(initiativeLine(measure([10]), '1 Aug')).toBe('One update in since 1 Aug — movement needs a second.')
  })
})

describe('wentTheirWay', () => {
  const up = measureInitiative([obs('r1', '2026-08-03', 10), obs('r2', '2026-08-10', 20)], { r1: 100, r2: 100 }, '2026-08-01')
  const down = measureInitiative([obs('r1', '2026-08-03', 20), obs('r2', '2026-08-10', 10)], { r1: 100, r2: 100 }, '2026-08-01')
  const flat = measureInitiative([obs('r1', '2026-08-03', 10), obs('r2', '2026-08-10', 10)], { r1: 100, r2: 100 }, '2026-08-01')

  it('answers only when there is a movement to judge', () => {
    expect(wentTheirWay(up, 'up')).toBe(true)
    expect(wentTheirWay(up, 'down')).toBe(false)
    expect(wentTheirWay(down, 'down')).toBe(true)
    expect(wentTheirWay(flat, 'up')).toBeNull()
  })
})
