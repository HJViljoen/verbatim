import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { subjectCalibration } from './calibration-state'
import { judgeThresholds, pickCalibrationPairs, precisionAt } from './calibration'
import {
  buildJudgeSystemPrompt,
  buildStrictJudgeSystemPrompt,
  judgeCallCost,
  judgeSampling,
  judgeSystemPrompt,
  membershipRows,
  splitBand,
} from './membership'
import { subjectFreezeHold } from './read'
import {
  bandArgs,
  DEFAULT_SUBJECT_JUDGE,
  JUDGE_VERSION,
  judgeFor,
  judgeVersionFor,
  judgeVersionOf,
  NO_AUTO_TIER_HIGH,
  STRICT_SUBJECT_JUDGE,
  SUBJECT_JUDGE_BY_CLIENT,
  subjectExclusionSplit,
  subjectCalibration as twoStateCalibration,
  type BandedPair,
} from './types'

// The judge, per tenant (14 Oct; plans/verbatim-depth-v2/judge-report.md).
// Sealand keeps today's judge byte for byte (no re-judge, no calibration
// reset); Össur gets gpt-5.4 at low effort, the strict prompt the replay
// measured, and no auto tier.

const SEALAND_JUDGE = 'subject_judge_v1·gpt-4.1-mini·0.6/0.4·subject_embed_v2'
const OSSUR_JUDGE = 'subject_judge_strict_v1·gpt-5.4:low·none/0.4·subject_embed_v2'

describe('the judge map', () => {
  it("pins Sealand's key exactly: today's judge, unchanged", () => {
    expect(judgeVersionFor(SEALAND_CLIENT_ID)).toBe(SEALAND_JUDGE)
    expect(judgeVersionFor(SEALAND_CLIENT_ID)).toBe(JUDGE_VERSION)
    expect(judgeFor(SEALAND_CLIENT_ID)).toBe(DEFAULT_SUBJECT_JUDGE)
    expect(judgeVersionOf(DEFAULT_SUBJECT_JUDGE)).toBe(JUDGE_VERSION)
    expect(DEFAULT_SUBJECT_JUDGE).toEqual({
      promptVersion: 'subject_judge_v1', prompt: 'v1', model: 'gpt-4.1-mini', reasoningEffort: null,
      high: 0.6, low: 0.4, embedVersion: 'subject_embed_v2', concurrency: 1,
    })
  })

  it("gives Össur its own judge, and its key names all of it", () => {
    expect(judgeFor(OSSUR_CLIENT_ID)).toBe(STRICT_SUBJECT_JUDGE)
    expect(judgeVersionFor(OSSUR_CLIENT_ID)).toBe(OSSUR_JUDGE)
    expect(STRICT_SUBJECT_JUDGE).toEqual({
      promptVersion: 'subject_judge_strict_v1', prompt: 'strict', model: 'gpt-5.4', reasoningEffort: 'low',
      high: null, low: 0.4, embedVersion: 'subject_embed_v2', concurrency: 4,
    })
    expect(OSSUR_JUDGE).not.toBe(JUDGE_VERSION)
  })

  it('holds one tenant only, and every other client (or none) gets the default', () => {
    expect(Object.keys(SUBJECT_JUDGE_BY_CLIENT)).toEqual([OSSUR_CLIENT_ID])
    for (const c of ['some-other-client', '', null, undefined]) {
      expect(judgeFor(c)).toBe(DEFAULT_SUBJECT_JUDGE)
      expect(judgeVersionFor(c)).toBe(JUDGE_VERSION)
    }
    // The map is read through the function; a test can hand it another.
    expect(judgeVersionFor('x', { x: STRICT_SUBJECT_JUDGE })).toBe(OSSUR_JUDGE)
    expect(judgeVersionFor(OSSUR_CLIENT_ID, {})).toBe(JUDGE_VERSION)
  })

  it('asks subject_band() for the band each judge means', () => {
    expect(bandArgs(DEFAULT_SUBJECT_JUDGE)).toEqual({ p_low: 0.4, p_high: 0.6, p_judge: SEALAND_JUDGE })
    // No auto tier: a p_high no similarity reaches, so every pair bands `judge`.
    expect(bandArgs(STRICT_SUBJECT_JUDGE)).toEqual({ p_low: 0.4, p_high: NO_AUTO_TIER_HIGH, p_judge: OSSUR_JUDGE })
    expect(NO_AUTO_TIER_HIGH).toBeGreaterThan(1)
  })

  it('samples each judge as its model takes it', () => {
    expect(judgeSampling(DEFAULT_SUBJECT_JUDGE)).toEqual({ temperature: 0 })
    expect(judgeSampling(STRICT_SUBJECT_JUDGE)).toEqual({ reasoning_effort: 'low' })
  })

  it("prices a call at the judge's model (MODEL_PRICING: gpt-5.4 bills $2.50 in, $15 out per million)", () => {
    // The dry run's shape, 1,900 in and 500 out a call.
    expect(judgeCallCost(1)).toBeCloseTo(0.00156, 6)
    expect(judgeCallCost(1, 'gpt-5.4')).toBeCloseTo(0.01225, 6)
  })
})

describe('the strict prompt', () => {
  // Fit & comfort as the first 14 Oct seed worded it: the replay's own input.
  const FIT = 'Comments about how a prosthetic fits and feels on the body: socket and liner fit, fit changing over time, length, pressure, pain, sores and skin irritation, and whether it is comfortable to wear all day, excluding how hard it is to put on, which liner or part to buy, choosing a clinic, and footwear.'

  it('splits a description at "excluding" into what belongs and what never does, as the replay did', () => {
    expect(subjectExclusionSplit(FIT)).toEqual({
      belongs: 'Comments about how a prosthetic fits and feels on the body: socket and liner fit, fit changing over time, length, pressure, pain, sores and skin irritation, and whether it is comfortable to wear all day.',
      never: 'how hard it is to put on, which liner or part to buy, choosing a clinic, and footwear.',
    })
    // No marker: all of it belongs, as written; nothing never does.
    const cost = 'Comments about what prosthetic devices cost, insurance, medical aid and funding.'
    expect(subjectExclusionSplit(cost)).toEqual({ belongs: cost, never: null })
    expect(subjectExclusionSplit('  ')).toEqual({ belongs: null, never: null })
    expect(subjectExclusionSplit(null)).toEqual({ belongs: null, never: null })
    // Only an exclusion: nothing belongs, the name decides.
    expect(subjectExclusionSplit('Excluding price.')).toEqual({ belongs: null, never: 'price.' })
  })

  it('is the replay\'s prompt, word for word', () => {
    expect(buildStrictJudgeSystemPrompt({ name: 'Fit & comfort', description: FIT })).toBe([
      'You decide whether a single piece of customer feedback belongs to one named SUBJECT that a brand is tracking.',
      '',
      'THE SUBJECT: "Fit & comfort"',
      'WHAT BELONGS: Comments about how a prosthetic fits and feels on the body: socket and liner fit, fit changing over time, length, pressure, pain, sores and skin irritation, and whether it is comfortable to wear all day.',
      'WHAT NEVER BELONGS: how hard it is to put on, which liner or part to buy, choosing a clinic, and footwear.',
      '',
      'Each numbered block is one thing the brand’s audience said, as the product recorded it: a short slug and a sentence describing what people said. For each block, decide whether this subject is the CENTRAL point of what was said.',
      '',
      'Say yes only when what the block is mainly about is described under WHAT BELONGS. A subject that comes up in passing, as one item in a list, as a side effect, or as the reason for something else does not make the block a member.',
      '',
      'WHAT NEVER BELONGS is a hard rule, not a hint. When a block is mainly about anything listed there, say no, even when it also touches this subject.',
      '',
      'Judge the subject matter, not the mood. "This is far too expensive" and "great value for what it is" are both about price. A complaint and a compliment about the same thing are both members.',
      '',
      'Sharing a word with the subject is not belonging to it. Feedback about something adjacent, broader or merely related is a no. A subject that swallows everything measures nothing.',
      '',
      'When you are unsure, say no.',
      '',
      'Return exactly one decision per block, using the block’s own ref. Never invent a ref and never skip one.',
    ].join('\n'))
  })

  it('drops the hard-rule lines where nothing never belongs', () => {
    const p = buildStrictJudgeSystemPrompt({ name: 'Cost & access', description: 'Comments about what prosthetic devices cost.' })
    expect(p).toContain('WHAT BELONGS: Comments about what prosthetic devices cost.')
    expect(p).not.toContain('WHAT NEVER BELONGS')
  })

  it("is asked only by a judge that names it: the default still asks today's prompt", () => {
    const s = { name: 'Fit & comfort', description: FIT }
    expect(judgeSystemPrompt(s)).toBe(buildJudgeSystemPrompt(s))
    expect(judgeSystemPrompt(s, judgeFor(SEALAND_CLIENT_ID))).toBe(buildJudgeSystemPrompt(s))
    expect(judgeSystemPrompt(s, judgeFor(OSSUR_CLIENT_ID))).toBe(buildStrictJudgeSystemPrompt(s))
    expect(buildJudgeSystemPrompt(s)).toContain(`WHAT IT MEANS: ${FIT}`)
  })
})

describe('the band, with no auto tier', () => {
  const band: BandedPair[] = [
    { audience_insight_id: 'a', score: 0.71, band: 'member' },
    { audience_insight_id: 'b', score: 0.52, band: 'judge' },
    { audience_insight_id: 'c', score: 0.41, band: 'judge' },
  ]

  it("keeps subject_band()'s labels under today's judge", () => {
    expect(splitBand(band, DEFAULT_SUBJECT_JUDGE)).toEqual({ vector: [band[0]], judge: [band[1], band[2]] })
    expect(splitBand(band)).toEqual(splitBand(band, DEFAULT_SUBJECT_JUDGE))
  })

  it('sends every pair to the model under a judge with none, whatever the label says', () => {
    expect(splitBand(band, STRICT_SUBJECT_JUDGE)).toEqual({ vector: [], judge: band })
  })

  it("stamps each row with the tenant's key; the default's is JUDGE_VERSION", () => {
    const args = { clientId: 'c', subjectId: 's', runId: null, decisions: new Map([['a', true]]), scores: new Map([['a', 0.71]]), method: 'judge' as const }
    expect(membershipRows(args)[0].judge_version).toBe(JUDGE_VERSION)
    expect(membershipRows({ ...args, judgeVersion: OSSUR_JUDGE })[0].judge_version).toBe(OSSUR_JUDGE)
  })

  it('calibrates at the judge\'s own pair: with no auto tier a predicted member is a judged yes', () => {
    const t = judgeThresholds(STRICT_SUBJECT_JUDGE)
    expect(t).toEqual({ high: Number.POSITIVE_INFINITY, low: 0.4 })
    expect(judgeThresholds(DEFAULT_SUBJECT_JUDGE)).toEqual({ high: 0.6, low: 0.4 })
    const scored = [
      { audienceInsightId: 'hi-no', score: 0.7, judged: false },
      { audienceInsightId: 'hi-unasked', score: 0.66, judged: null },
      { audienceInsightId: 'mid-yes', score: 0.5, judged: true },
    ]
    // Today's judge counts the 0.70 pair a member unasked; Össur's asks.
    expect(pickCalibrationPairs('s', scored, 10).map((p) => p.audienceInsightId)).toEqual(['hi-no', 'hi-unasked', 'mid-yes'])
    expect(pickCalibrationPairs('s', scored, 10, t.high, t.low).map((p) => p.audienceInsightId)).toEqual(['mid-yes'])
    const labelled = scored.map((p) => ({ ...p, subjectId: 's', label: p.audienceInsightId !== 'hi-no' }))
    expect(precisionAt(labelled, t.high, t.low)).toMatchObject({ predicted: 1, correct: 1, unknown: 1 })
  })

  it("holds the freeze when the step's clock stopped the pass", () => {
    expect(subjectFreezeHold([{ subjectName: 'Fit & comfort', skipped: null, budgetStopped: false, unanswered: 0, clockStopped: true }]))
      .toMatch(/stopped at the step's clock/)
    // A result stored before the field existed reads as not stopped.
    expect(subjectFreezeHold([{ subjectName: 'Fit & comfort', skipped: null, budgetStopped: false, unanswered: 0 }])).toBeNull()
  })
})

describe('the calibration gate fails closed', () => {
  const checked = (judge: string | null, client_id: string | null | undefined) => ({
    client_id,
    calibrated_at: judge ? '2026-10-15T09:00:00.000Z' : null,
    calibration_precision: judge ? 0.94 : null,
    calibration_n: judge ? 33 : null,
    calibration_judge_version: judge,
  })

  it("a Sealand subject checked under today's judge stays ready: nothing about Sealand changes", () => {
    expect(subjectCalibration(checked(SEALAND_JUDGE, SEALAND_CLIENT_ID))).toBe('ready')
    expect(twoStateCalibration(checked(SEALAND_JUDGE, SEALAND_CLIENT_ID))).toBe('ready')
  })

  it("an Össur subject checked under its own judge is ready with its client", () => {
    expect(subjectCalibration(checked(OSSUR_JUDGE, OSSUR_CLIENT_ID))).toBe('ready')
    expect(twoStateCalibration(checked(OSSUR_JUDGE, OSSUR_CLIENT_ID))).toBe('ready')
  })

  it('and reads provisional where the read lost its client: never a wrong ready', () => {
    expect(subjectCalibration(checked(OSSUR_JUDGE, null))).toBe('provisional')
    expect(subjectCalibration(checked(OSSUR_JUDGE, undefined))).toBe('provisional')
    expect(twoStateCalibration(checked(OSSUR_JUDGE, null))).toBe('calibrating')
  })

  it("a check recorded under the old judge stops counting for Össur the day its judge changes (Cost & access, Community)", () => {
    expect(subjectCalibration(checked(SEALAND_JUDGE, OSSUR_CLIENT_ID))).toBe('provisional')
    // …and a figure under the floor measured by the old judge cannot fail it either.
    expect(subjectCalibration({ ...checked(SEALAND_JUDGE, OSSUR_CLIENT_ID), calibration_precision: 0.15 })).toBe('provisional')
    expect(twoStateCalibration(checked(SEALAND_JUDGE, OSSUR_CLIENT_ID))).toBe('calibrating')
  })
})
