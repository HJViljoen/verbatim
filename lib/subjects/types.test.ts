import { describe, expect, it } from 'vitest'

import {
  JUDGE_VERSION,
  SUBJECTS_MAX,
  SUBJECTS_MIN,
  SUBJECT_JUDGE_MODEL,
  SUBJECT_JUDGE_PROMPT_VERSION,
  SUBJECT_MATCH_HIGH,
  SUBJECT_MATCH_LOW,
  SUBJECT_MIN_COVERAGE,
  SUBJECT_PRECISION_FLOOR,
  isMissingSubjects,
  subjectCalibration,
  subjectEmbedInput,
} from './types'

describe('the band', () => {
  it('has a high threshold above its low one, both inside a cosine range', () => {
    expect(SUBJECT_MATCH_LOW).toBeGreaterThan(0)
    expect(SUBJECT_MATCH_HIGH).toBeGreaterThan(SUBJECT_MATCH_LOW)
    expect(SUBJECT_MATCH_HIGH).toBeLessThanOrEqual(1)
  })

  it('keeps the tenant subject count a range, not a number', () => {
    expect(SUBJECTS_MIN).toBeLessThan(SUBJECTS_MAX)
  })
})

describe('JUDGE_VERSION', () => {
  // The whole point of the string: everything that could change the answer
  // without changing the question is IN it. A month read under one is not
  // comparable with a month read under another, and subject_band() re-judges
  // the corpus when it moves — so a test that pins the parts is a test that
  // stops someone moving a threshold and quietly keeping the old months.
  it('carries the prompt, the model and both thresholds', () => {
    expect(JUDGE_VERSION).toContain(SUBJECT_JUDGE_PROMPT_VERSION)
    expect(JUDGE_VERSION).toContain(SUBJECT_JUDGE_MODEL)
    expect(JUDGE_VERSION).toContain(String(SUBJECT_MATCH_HIGH))
    expect(JUDGE_VERSION).toContain(String(SUBJECT_MATCH_LOW))
  })

  it('is one line, so it fits a column and a log', () => {
    expect(JUDGE_VERSION).not.toContain('\n')
    expect(JUDGE_VERSION.length).toBeLessThan(120)
  })
})

describe('subjectEmbedInput', () => {
  it('reads as a name, a full stop and a sentence — the insight formula shape', () => {
    expect(subjectEmbedInput({ name: 'comfort', description: 'How it feels to wear all day.' }))
      .toBe('comfort. How it feels to wear all day.')
  })

  it('falls back to the bare name when there is no description', () => {
    expect(subjectEmbedInput({ name: 'price', description: null })).toBe('price')
    expect(subjectEmbedInput({ name: 'price' })).toBe('price')
    expect(subjectEmbedInput({ name: ' price ', description: '   ' })).toBe('price')
  })
})

describe('subjectCalibration', () => {
  const ready = {
    calibrated_at: '2026-09-20T00:00:00.000Z',
    calibration_precision: 0.9,
    calibration_judge_version: JUDGE_VERSION,
  }

  it('is ready when precision was measured, clears the floor, and under this judge', () => {
    expect(subjectCalibration(ready)).toBe('ready')
  })

  it('is calibrating when nothing has been measured', () => {
    expect(subjectCalibration({ calibrated_at: null, calibration_precision: null, calibration_judge_version: null }))
      .toBe('calibrating')
  })

  it('is calibrating when the measurement missed the floor', () => {
    expect(subjectCalibration({ ...ready, calibration_precision: SUBJECT_PRECISION_FLOOR - 0.01 })).toBe('calibrating')
  })

  it('is ready exactly AT the floor — the design says "under 85%" prints calibrating', () => {
    expect(subjectCalibration({ ...ready, calibration_precision: SUBJECT_PRECISION_FLOOR })).toBe('ready')
  })

  it('is calibrating again when the judge moved under it', () => {
    // An 85% measured against a band that no longer exists is not evidence
    // about the numbers the subject is carrying now.
    expect(subjectCalibration({ ...ready, calibration_judge_version: 'subject_judge_v1·gpt-4.1-mini·0.8/0.6' }))
      .toBe('calibrating')
  })

  it('is calibrating when a figure names no judge at all — the gate fails CLOSED', () => {
    // Every writer of calibrated_at writes the judge version beside it
    // (scripts/subject-calibration.ts), so a figure with none is a figure from
    // a band nobody can name. Reading that as `ready` would empty the gate of
    // its meaning for every subject a loader forgot to select the column for.
    expect(subjectCalibration({ ...ready, calibration_judge_version: null })).toBe('calibrating')
  })
})

describe('SUBJECT_MIN_COVERAGE', () => {
  it('is a share, not a percentage', () => {
    expect(SUBJECT_MIN_COVERAGE).toBeGreaterThan(0)
    expect(SUBJECT_MIN_COVERAGE).toBeLessThanOrEqual(1)
  })
})

describe('isMissingSubjects', () => {
  it('recognises the function and the table by code', () => {
    expect(isMissingSubjects({ code: 'PGRST202', message: 'Could not find the function public.subject_band' })).toBe(true)
    expect(isMissingSubjects({ code: 'PGRST205', message: "Could not find the table 'public.subjects' in the schema cache" })).toBe(true)
    expect(isMissingSubjects({ code: '42P01', message: 'relation "month_subject_readings" does not exist' })).toBe(true)
  })

  it('recognises it by sentence when selectAll has flattened the code away', () => {
    expect(isMissingSubjects(new Error('Could not find the function public.monthly_subject_readings in the schema cache'))).toBe(true)
  })

  it('never swallows an error that does not name one of this migration’s objects', () => {
    expect(isMissingSubjects({ code: '42P01', message: 'relation "videos" does not exist' })).toBe(false)
    expect(isMissingSubjects(new Error('subjects upsert: duplicate key value'))).toBe(false)
    expect(isMissingSubjects(null)).toBe(false)
    expect(isMissingSubjects(undefined)).toBe(false)
  })

  it('does not match a longer name that merely contains one of ours', () => {
    // `subjects_live_name_idx` is not `subjects`; a blanket substring test
    // would swallow a unique-violation report as "the migration is missing".
    expect(isMissingSubjects({ code: '42P01', message: 'relation "subjects_archive" does not exist' })).toBe(false)
  })
})
