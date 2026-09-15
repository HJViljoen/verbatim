import { describe, expect, it } from 'vitest'

import {
  candidateThresholds,
  clearsPrecisionGate,
  formatPrecisionTable,
  precisionAt,
  precisionTable,
  predictAt,
  sampleForCalibration,
  type LabelledPair,
} from './calibration'
import { SUBJECT_MATCH_HIGH, SUBJECT_MATCH_LOW, SUBJECT_PRECISION_FLOOR } from './types'

const pair = (over: Partial<LabelledPair>): LabelledPair => ({
  subjectId: 's', audienceInsightId: 'i', score: 0.6, judged: null, label: false, ...over,
})

describe('sampleForCalibration', () => {
  const ids = Array.from({ length: 500 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`)

  it('is deterministic — the sheet a person labels is the sheet that gets scored', () => {
    expect(sampleForCalibration(ids, 200)).toEqual(sampleForCalibration(ids, 200))
  })

  it('does not depend on the order the ids arrived in', () => {
    const shuffled = [...ids].reverse()
    expect(sampleForCalibration(shuffled, 50)).toEqual(sampleForCalibration(ids, 50))
  })

  it('takes everything when the population is smaller than the sample', () => {
    expect(sampleForCalibration(ids.slice(0, 7), 200)).toHaveLength(7)
  })

  it('does not spread by id order — the ids are minted per run, so a stride would sample a run', () => {
    // A strided sample of a sorted id list would take every 10th id and come
    // back perfectly evenly spaced. A hashed one does not.
    const picked = sampleForCalibration(ids, 50)
    const positions = picked.map((id) => ids.indexOf(id)).sort((a, b) => a - b)
    const gaps = positions.slice(1).map((p, i) => p - positions[i])
    expect(new Set(gaps).size).toBeGreaterThan(1)
  })
})

describe('predictAt', () => {
  it('lets the vector decide above the high threshold and below the low one', () => {
    expect(predictAt({ score: 0.9, judged: null }, 0.7, 0.55)).toBe(true)
    expect(predictAt({ score: 0.2, judged: null }, 0.7, 0.55)).toBe(false)
  })

  it('takes the judge inside the band, either way', () => {
    expect(predictAt({ score: 0.6, judged: true }, 0.7, 0.55)).toBe(true)
    expect(predictAt({ score: 0.6, judged: false }, 0.7, 0.55)).toBe(false)
  })

  it('answers null — not false — for a band pair nobody judged', () => {
    // The difference matters: scoring an unasked pair as a miss would make a
    // wider band look worse than it is, which is exactly the comparison the
    // table exists to make.
    expect(predictAt({ score: 0.6, judged: null }, 0.7, 0.55)).toBeNull()
  })

  it('treats the thresholds as inclusive at the top and exclusive at the bottom, like subject_band', () => {
    expect(predictAt({ score: 0.7, judged: null }, 0.7, 0.55)).toBe(true)
    expect(predictAt({ score: 0.55, judged: null }, 0.7, 0.55)).toBeNull()
    expect(predictAt({ score: 0.5499, judged: null }, 0.7, 0.55)).toBe(false)
  })
})

describe('precisionAt', () => {
  it('scores precision over the members it would name, and counts the ones it would miss', () => {
    const row = precisionAt([
      pair({ score: 0.9, label: true }),   // named, right
      pair({ score: 0.9, label: false }),  // named, wrong
      pair({ score: 0.6, judged: true, label: true }),  // named, right
      pair({ score: 0.1, label: true }),   // missed
      pair({ score: 0.1, label: false }),  // correctly rejected
    ], 0.7, 0.55)
    expect(row.predicted).toBe(3)
    expect(row.correct).toBe(2)
    expect(row.precision).toBeCloseTo(2 / 3)
    expect(row.missed).toBe(1)
    expect(row.unknown).toBe(0)
  })

  it('counts an unjudged band pair as unknown, and as a miss only when it was a member', () => {
    const row = precisionAt([
      pair({ score: 0.6, judged: null, label: true }),
      pair({ score: 0.6, judged: null, label: false }),
    ], 0.7, 0.55)
    expect(row.unknown).toBe(2)
    expect(row.predicted).toBe(0)
    expect(row.precision).toBeNull()
    expect(row.missed).toBe(1)
  })

  it('reports no precision rather than 0% when nothing was predicted', () => {
    expect(precisionAt([pair({ score: 0.1, label: false })], 0.7, 0.55).precision).toBeNull()
  })

  it('shows a subject shrinking to nothing as recall, not as a good score', () => {
    // A very high threshold names one member and gets it right — 100% precision
    // on a subject that has stopped measuring anything. `missed` is what says so.
    const pairs = [pair({ score: 0.95, label: true }), ...Array.from({ length: 9 }, () => pair({ score: 0.6, judged: null, label: true }))]
    const tight = precisionAt(pairs, 0.9, 0.85)
    expect(tight.precision).toBe(1)
    expect(tight.missed).toBe(9)
  })
})

describe('candidateThresholds', () => {
  it('never offers a low threshold at or above its high one', () => {
    expect(candidateThresholds().every((t) => t.low < t.high)).toBe(true)
  })

  it('always contains the shipped pair, so the table compares against what is running', () => {
    expect(candidateThresholds()).toContainEqual({ high: SUBJECT_MATCH_HIGH, low: SUBJECT_MATCH_LOW })
    expect(candidateThresholds([0.9], [0.8])).toContainEqual({ high: SUBJECT_MATCH_HIGH, low: SUBJECT_MATCH_LOW })
  })
})

describe('clearsPrecisionGate', () => {
  it('needs a measurement, not an absence of one', () => {
    expect(clearsPrecisionGate({ high: 0.7, low: 0.55, predicted: 0, correct: 0, precision: null, missed: 0, unknown: 0 })).toBe(false)
  })

  it('clears at the floor', () => {
    expect(clearsPrecisionGate({ high: 0.7, low: 0.55, predicted: 20, correct: 17, precision: SUBJECT_PRECISION_FLOOR, missed: 0, unknown: 0 })).toBe(true)
    expect(clearsPrecisionGate({ high: 0.7, low: 0.55, predicted: 20, correct: 16, precision: 0.8, missed: 0, unknown: 0 })).toBe(false)
  })
})

describe('formatPrecisionTable', () => {
  it('marks the shipped pair so the reader knows which row they are living in', () => {
    const text = formatPrecisionTable(precisionTable([pair({ score: 0.9, label: true })]))
    expect(text).toContain('<- shipped')
    expect(text.split('\n')[0]).toContain('precision')
  })

  it('prints an em dash rather than 0% for a row that predicted nothing', () => {
    const text = formatPrecisionTable([{ high: 0.8, low: 0.7, predicted: 0, correct: 0, precision: null, missed: 3, unknown: 0 }])
    expect(text).toContain('—')
  })
})
