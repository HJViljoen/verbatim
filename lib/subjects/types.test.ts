import { describe, expect, it } from 'vitest'

import {
  JUDGE_VERSION,
  MOVE_PROMISE,
  SUBJECTS_MAX,
  SUBJECTS_MIN,
  SUBJECT_JUDGE_MODEL,
  SUBJECT_JUDGE_PROMPT_VERSION,
  SUBJECT_MATCH_HIGH,
  SUBJECT_MATCH_LOW,
  SUBJECT_MIN_COVERAGE,
  SUBJECT_PRECISION_FLOOR,
  SUBJECT_EMBED_INPUT_VERSION,
  isMissingSubjects,
  subjectCalibration,
  subjectEmbedInput,
  subjectPositiveGloss,
} from './types'

describe('the promise a move carries', () => {
  it('is one string, so the list and the control that creates one cannot drift', async () => {
    const { MOVES_MASTHEAD } = await import('../pages/overview')
    expect(MOVES_MASTHEAD).toBe(MOVE_PROMISE)
    expect(MOVE_PROMISE).toContain('never claim you caused it')
  })
})

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

describe('subjectPositiveGloss', () => {
  // The six real Sealand descriptions are the fixtures, because they are what
  // the formula was measured on (status/subject-band-2026-09-23.md PART THREE).
  it('drops the exclusion clause — a vector has no negation, so "excluding X" puts X in it', () => {
    expect(subjectPositiveGloss('Comments about product pricing, sales, discounts, or value for money, excluding unrelated purchasing logistics.'))
      .toBe('Product pricing, sales, discounts, or value for money.')
    expect(subjectPositiveGloss('Comments about how comfortable the products are to use or carry, excluding style or weight complaints.'))
      .toBe('How comfortable the products are to use or carry.')
  })

  it('drops the meta-register frame, which is the edit that measured largest', () => {
    expect(subjectPositiveGloss('Comments about the aesthetic appeal, beauty, or fashionability of the products.'))
      .toBe('The aesthetic appeal, beauty, or fashionability of the products.')
    expect(subjectPositiveGloss('Feedback on how long the products last.'))
      .toBe('How long the products last.')
    expect(subjectPositiveGloss('What people say about the straps.')).toBe('The straps.')
  })

  it('takes every exclusion marker at a clause boundary, and only at one', () => {
    expect(subjectPositiveGloss('Fabric and seams; excluding zips.')).toBe('Fabric and seams.')
    expect(subjectPositiveGloss('Fabric and seams (but not zips).')).toBe('Fabric and seams.')
    expect(subjectPositiveGloss('Fabric and seams — except zips.')).toBe('Fabric and seams.')
    expect(subjectPositiveGloss('Fabric and seams. Excludes zips.')).toBe('Fabric and seams.')
    expect(subjectPositiveGloss('Fabric and seams, not including zips.')).toBe('Fabric and seams.')
    // Mid-phrase, no clause boundary: the description keeps its own words.
    expect(subjectPositiveGloss('An exclusive finish on the leather.'))
      .toBe('An exclusive finish on the leather.')
  })

  it('leaves a sentence, not a fragment — the shape the corpus vectors were built from', () => {
    expect(subjectPositiveGloss('comments about the zips and the seams and, excluding X'))
      .toBe('The zips and the seams.')
    expect(subjectPositiveGloss('how the bag wears')).toBe('How the bag wears.')
    expect(subjectPositiveGloss('Does it leak?')).toBe('Does it leak?')
  })

  it('is empty when there is nothing positive left to say', () => {
    expect(subjectPositiveGloss(null)).toBe('')
    expect(subjectPositiveGloss(undefined)).toBe('')
    expect(subjectPositiveGloss('   ')).toBe('')
    // Nothing but a frame and an exclusion: the name alone is the honest phrase.
    expect(subjectPositiveGloss('Comments about, excluding everything.')).toBe('')
    // A frame with something after it keeps that something, however thin.
    expect(subjectPositiveGloss('Comments about anything, excluding everything.')).toBe('Anything.')
  })
})

describe('subjectEmbedInput', () => {
  it('reads as a name, a full stop and a sentence — the insight formula shape', () => {
    expect(subjectEmbedInput({ name: 'comfort', description: 'How it feels to wear all day.' }))
      .toBe('comfort. How it feels to wear all day.')
  })

  it('embeds the positive gloss, never the description as written', () => {
    expect(subjectEmbedInput({
      name: 'Waterproofing',
      description: 'Comments about how well the bags keep their contents dry in rain and travel, excluding general durability or material sourcing.',
    })).toBe('Waterproofing. How well the bags keep their contents dry in rain and travel.')
  })

  it('falls back to the bare name when there is no description, or none left', () => {
    expect(subjectEmbedInput({ name: 'price', description: null })).toBe('price')
    expect(subjectEmbedInput({ name: 'price' })).toBe('price')
    expect(subjectEmbedInput({ name: ' price ', description: '   ' })).toBe('price')
    expect(subjectEmbedInput({ name: 'price', description: 'Comments about, excluding all of it.' })).toBe('price')
  })

  it('is stamped, so a stored vector says which formula built it', () => {
    // subjectsNeedingVectors re-embeds on a version mismatch; that IS the
    // repair, and it only works if the string moves with the formula.
    expect(SUBJECT_EMBED_INPUT_VERSION).toBe('subject_embed_v2')
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
