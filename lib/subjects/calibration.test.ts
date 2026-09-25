import { describe, expect, it } from 'vitest'

import {
  calibrationNote,
  calibrationQuota,
  calibrationRecorded,
  lastCalibrationLogged,
  candidateThresholds,
  pickCalibrationPairs,
  clearsPrecisionGate,
  formatPrecisionTable,
  parseLabelledSheet,
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

describe('pickCalibrationPairs', () => {
  // 200 pairs spread over [0, 1): 80 at or above the shipped high (0.60) are
  // members by vector; the 40 in the band [0.40, 0.60) alternate judge yes /
  // judge no, with every tenth left undecided; the 80 below the low are out.
  const scored = Array.from({ length: 200 }, (_, i) => {
    const score = i / 200
    const judged = score >= SUBJECT_MATCH_LOW && score < SUBJECT_MATCH_HIGH
      ? (i % 10 === 0 ? null : i % 2 === 1)
      : null
    return { audienceInsightId: `i${i}`, score, judged }
  })
  const predicted = scored.filter((p) => predictAt(p, SUBJECT_MATCH_HIGH, SUBJECT_MATCH_LOW) === true)

  it('draws only from the predicted members — the pairs precision is a share of', () => {
    const picked = pickCalibrationPairs('s1', scored, 50)
    expect(picked.length).toBe(50)
    for (const p of picked) expect(predictAt(p, SUBJECT_MATCH_HIGH, SUBJECT_MATCH_LOW)).toBe(true)
  })

  it('never asks about a band pair the judge said no to, or one nobody judged', () => {
    const picked = pickCalibrationPairs('s1', scored, 1000)
    expect(picked.some((p) => p.judged === false)).toBe(false)
    expect(picked.some((p) => p.score < SUBJECT_MATCH_HIGH && p.judged === null)).toBe(false)
    expect(picked.some((p) => p.score < SUBJECT_MATCH_LOW)).toBe(false)
  })

  // The defect it replaces: Sealand's Repair & warranty had 3 predicted members
  // in a 33-pair sheet drawn over its score range, so its precision was 1 of 3.
  it('gives a subject whose judge rejects most of its band a full sheet of members', () => {
    const rejecting = Array.from({ length: 400 }, (_, i) => ({
      audienceInsightId: `r${i}`,
      score: 0.4 + (i / 400) * 0.21,
      judged: i % 8 === 0,
    }))
    const members = rejecting.filter((p) => predictAt(p, SUBJECT_MATCH_HIGH, SUBJECT_MATCH_LOW) === true)
    expect(members.length).toBeGreaterThan(33)
    expect(pickCalibrationPairs('s1', rejecting, 33)).toHaveLength(33)
  })

  it('takes every predicted member when there are fewer than the quota', () => {
    expect(pickCalibrationPairs('s1', scored, 1000)).toHaveLength(predicted.length)
  })

  it('asks the same questions twice, whatever order the pairs arrive in — the labels are expensive', () => {
    const a = pickCalibrationPairs('s1', scored, 20)
    expect(a).toEqual(pickCalibrationPairs('s1', scored, 20))
    expect(a).toEqual(pickCalibrationPairs('s1', [...scored].reverse(), 20))
  })

  it('samples per PAIR, so two subjects do not get one insight set', () => {
    const a = pickCalibrationPairs('s1', scored, 20).map((p) => p.audienceInsightId)
    const b = pickCalibrationPairs('s2', scored, 20).map((p) => p.audienceInsightId)
    expect(a).not.toEqual(b)
  })

  it('walks the reader down from the obvious members into the band', () => {
    const scores = pickCalibrationPairs('s1', scored, 20).map((p) => p.score)
    expect([...scores].sort((x, y) => y - x)).toEqual(scores)
  })

  it('makes precision at the shipped pair correct over sampled', () => {
    const picked = pickCalibrationPairs('s1', scored, 30)
    const labelled = picked.map((p, i) => pair({ ...p, subjectId: 's1', label: i % 3 !== 0 }))
    const row = precisionAt(labelled)
    expect(row.predicted).toBe(picked.length)
    expect(row.precision).toBe(labelled.filter((p) => p.label).length / picked.length)
  })
})

describe('parseLabelledSheet — a label is a JSON boolean or it is refused', () => {
  const line = (label: unknown, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ subjectId: 's1', subject: 'Price', audienceInsightId: 'i1', said: 'x', score: 0.62, label, ...extra })

  it('reads true, false and null, and ignores blank lines and extra keys', () => {
    const { rows, refused } = parseLabelledSheet([line(true, { reason: 'about price' }), '', line(false), line(null)])
    expect(refused).toEqual([])
    expect(rows.map((r) => r.label)).toEqual([true, false, null])
    expect(rows[0]).toEqual({ subjectId: 's1', audienceInsightId: 'i1', score: 0.62, label: true })
  })

  // What it was for: `if (p.label) correct++` counted every one of these as a
  // CORRECT prediction, so a sheet written in the CSV's own words scored its
  // "not" answers as yeses.
  it('refuses a string, a number or a missing label, by line number', () => {
    const noLabel = JSON.stringify({ subjectId: 's1', audienceInsightId: 'i2', score: 0.7 })
    const { refused } = parseLabelledSheet([line('false'), line('not'), line('member'), line(0), line(1), noLabel, line(true)])
    expect(refused).toEqual([
      'line 1: label "false" is not true, false or null',
      'line 2: label "not" is not true, false or null',
      'line 3: label "member" is not true, false or null',
      'line 4: label 0 is not true, false or null',
      'line 5: label 1 is not true, false or null',
      'line 6: label missing is not true, false or null',
    ])
  })

  it('refuses a line that is not JSON', () => {
    expect(parseLabelledSheet(['{"label": tru']).refused).toEqual(['line 1: not JSON'])
  })

  // A lost id was scored as the subject "undefined" and dropped silently; a
  // lost or edited score became NaN — 'unknown' at score time, while
  // calibration_n still counted it.
  it('refuses a line whose ids or score were lost or rewritten, by line number', () => {
    const noSubject = JSON.stringify({ audienceInsightId: 'i1', score: 0.62, label: true })
    const blankInsight = line(true, { audienceInsightId: ' ' })
    const stringScore = line(true, { score: '0.62' })
    const noScore = JSON.stringify({ subjectId: 's1', audienceInsightId: 'i1', label: false })
    const nanScore = line(false, { score: null })
    expect(parseLabelledSheet([noSubject, blankInsight, stringScore, noScore, nanScore, line(true)]).refused).toEqual([
      'line 1: subjectId missing is not an id',
      'line 2: audienceInsightId " " is not an id',
      'line 3: score "0.62" is not a number',
      'line 4: score missing is not a number',
      'line 5: score null is not a number',
    ])
  })

  it('is the gate the scorer needed: a string "false" scores as correct without it', () => {
    const hazard = precisionAt([pair({ score: 0.9, label: 'false' as unknown as boolean })])
    expect(hazard.correct).toBe(1)
  })
})

describe('calibrationRecorded — a re-run of --apply completes only what is missing', () => {
  const next = { calibration_precision: 22 / 25, calibration_n: 25, calibration_judge_version: 'j1' }
  const none = { calibration_precision: null, calibration_n: null, calibration_judge_version: null }

  it('skips a subject whose figure is stored AND logged', () => {
    // numeric comes back from the database as a number, or as its string.
    expect(calibrationRecorded({ ...next, calibration_precision: '0.88' }, next, next)).toBe(true)
  })

  it('writes a subject whose update landed but whose change-log row did not — the one the re-run is for', () => {
    expect(calibrationRecorded(next, undefined, next)).toBe(false)
    expect(calibrationRecorded(next, none, next)).toBe(false)
  })

  it('writes a subject whose figure is new or whose key moved', () => {
    expect(calibrationRecorded(none, null, next)).toBe(false)
    expect(calibrationRecorded({ ...next, calibration_n: 24 }, next, next)).toBe(false)
    expect(calibrationRecorded({ ...next, calibration_judge_version: 'j0' }, { ...next, calibration_judge_version: 'j0' }, next)).toBe(false)
  })

  it('reads each subject’s NEWEST logged figure', () => {
    const rows = [
      { after: { id: 's1', calibration_precision: 0.88, calibration_n: 25, calibration_judge_version: 'j1' } },
      { after: { id: 's1', calibration_precision: 0.5, calibration_n: 33, calibration_judge_version: 'j0' } },
      { after: null },
      { after: { id: 's2', calibration_precision: null, calibration_n: 0, calibration_judge_version: 'j1' } },
    ]
    const last = lastCalibrationLogged(rows)
    expect(last.get('s1')).toEqual({ calibration_precision: 0.88, calibration_n: 25, calibration_judge_version: 'j1' })
    expect(last.get('s2')?.calibration_n).toBe(0)
    expect(last.size).toBe(2)
  })
})

describe('calibrationNote — the tenant-readable change-log line', () => {
  it('is plain words: no "by hand", no threshold', () => {
    const note = calibrationNote('Looks & style', 25)
    expect(note).toBe('Matching checked for Looks & style on 25 sampled viewer points.')
    expect(note).not.toMatch(/by hand/i)
    expect(note).not.toMatch(/\d\.\d|\d\/\d|precision|pair/i)
  })

  // A sampled pair is an audience insight — one point drawn from one video's
  // comments — and "comments" has a fixed meaning on client copy (GLOSSARY).
  it('does not call the sampled unit a comment', () => {
    expect(calibrationNote('Looks & style', 25)).not.toMatch(/comment/i)
    expect(calibrationNote('Price', 1)).not.toMatch(/comment/i)
  })

  it('counts one sample as one', () => {
    expect(calibrationNote('Price', 1)).toBe('Matching checked for Price on 1 sampled viewer point.')
  })
})
