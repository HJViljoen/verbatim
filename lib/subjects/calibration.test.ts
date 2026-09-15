import { describe, expect, it } from 'vitest'

import {
  calibrationQuota,
  calibrationScoreFloor,
  candidateThresholds,
  pickCalibrationPairs,
  clearsPrecisionGate,
  formatPrecisionTable,
  precisionAt,
  precisionTable,
  predictAt,
  sampleForCalibration,
  type LabelledPair,
} from './calibration'
import { SUBJECT_CALIBRATION_SAMPLE, SUBJECT_MATCH_HIGH, SUBJECT_MATCH_LOW, SUBJECT_PRECISION_FLOOR } from './types'

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

  it('counts an unjudged band pair as unknown and NOT as a miss — nobody asked', () => {
    const row = precisionAt([
      pair({ score: 0.6, judged: null, label: true }),
      pair({ score: 0.6, judged: null, label: false }),
    ], 0.7, 0.55)
    expect(row.unknown).toBe(2)
    expect(row.predicted).toBe(0)
    expect(row.precision).toBeNull()
    // Counting it in both columns made recall read worse than the procedure is
    // and made `missed` non-additive with `predicted`.
    expect(row.missed).toBe(0)
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

describe('calibrationQuota', () => {
  it('splits ONE tenant sheet across its subjects — the unit is the pair', () => {
    // 200 insights x 8 subjects would be 1,600 labels. The sheet is 200 labels.
    expect(calibrationQuota(5)).toBe(40)
    expect(calibrationQuota(8)).toBe(25)
    expect(calibrationQuota(5) * 5).toBeLessThanOrEqual(SUBJECT_CALIBRATION_SAMPLE)
    expect(calibrationQuota(8) * 8).toBeLessThanOrEqual(SUBJECT_CALIBRATION_SAMPLE)
  })

  it('still asks about something when a tenant has more subjects than labels', () => {
    expect(calibrationQuota(400)).toBe(1)
    expect(calibrationQuota(0)).toBe(0)
  })
})

describe('calibrationScoreFloor', () => {
  it('is the lowest threshold the table would ever call a member', () => {
    const floor = calibrationScoreFloor()
    expect(floor).toBe(Math.min(...candidateThresholds().map((t) => t.low)))
    // A pair under the floor is predicted "not a member" at every row of the
    // table, so its label cannot move a single precision figure.
    for (const t of candidateThresholds()) {
      expect(predictAt({ score: floor - 0.01, judged: true }, t.high, t.low)).toBe(false)
    }
  })
})

describe('pickCalibrationPairs', () => {
  const scored = Array.from({ length: 200 }, (_, i) => ({
    audienceInsightId: `i${i}`,
    score: i / 200,
  }))

  it('asks only about pairs a label could change an answer for', () => {
    const picked = pickCalibrationPairs('s1', scored, 50, 0.45)
    expect(picked.every((p) => p.score >= 0.45)).toBe(true)
  })

  it('holds the quota', () => {
    expect(pickCalibrationPairs('s1', scored, 20, 0.45)).toHaveLength(20)
  })

  it('asks the same questions twice — the labels are expensive', () => {
    expect(pickCalibrationPairs('s1', scored, 20, 0.45)).toEqual(pickCalibrationPairs('s1', scored, 20, 0.45))
  })

  it('samples per PAIR, so two subjects do not get one insight set', () => {
    const a = pickCalibrationPairs('s1', scored, 20, 0.45).map((p) => p.audienceInsightId)
    const b = pickCalibrationPairs('s2', scored, 20, 0.45).map((p) => p.audienceInsightId)
    expect(a).not.toEqual(b)
  })

  it('walks the reader down from the obvious members into the band', () => {
    const picked = pickCalibrationPairs('s1', scored, 20, 0.45)
    const scores = picked.map((p) => p.score)
    expect([...scores].sort((x, y) => y - x)).toEqual(scores)
  })

  it('returns everything eligible when the quota exceeds it', () => {
    const few = scored.filter((p) => p.score >= 0.98)
    expect(pickCalibrationPairs('s1', few, 100, 0.45)).toHaveLength(few.length)
  })
})
