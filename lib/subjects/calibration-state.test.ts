import { describe, expect, it } from 'vitest'

import {
  CALIBRATION_WORDS,
  calibrationWord,
  earnsVerdict,
  isFailed,
  printsClient,
  printsMarket,
  readCalibration,
  subjectCalibration,
} from './calibration-state'
import { JUDGE_VERSION } from './types'

// The three states (market-first decision C, WP1.1), pinned on real
// calibrations, never invented ones:
//
//  · staging (zfmxrrugaihxpubunleu, Sealand, written 24 Sep 11:53 under
//    `subject_judge_v1·gpt-4.1-mini·0.6/0.4·subject_embed_v2`, n = 33 each):
//    Comfort 0.9167, Durability 1, Looks & style 0.8571, Price 1,
//    Waterproofing 1, Repair & warranty 0.3333, Community & purpose unchecked;
//  · production (25 Sep, n = 25 each): Price 1.00, Durability 0.96, Looks &
//    style 0.92, Buying & delivery 0.92, Comfort 0.88 (ready under the
//    two-state gate); Community & purpose 0.60, Waterproofing 0.52, Repair &
//    warranty 0.36 (calibrating under it).

const at = '2026-09-24T11:53:16.678Z'
const row = (precision: number | string | null, n: number | string | null, judge: string | null = JUDGE_VERSION) => ({
  calibrated_at: precision == null ? null : at,
  calibration_precision: precision,
  calibration_n: n,
  calibration_judge_version: judge,
})

describe('subjectCalibration: the WP1.1 boundaries', () => {
  it('Repair & warranty at 0.333 on 33 labels is failed (the top of its range is about 0.50)', () => {
    expect(subjectCalibration(row(1 / 3, 33))).toBe('failed')
    expect(subjectCalibration(row(0.333, 33))).toBe('failed')
  })

  it('0.80 on 25 is provisional: its range still reaches about 0.91', () => {
    expect(subjectCalibration(row(0.8, 25))).toBe('provisional')
  })

  it('0.857 on 33 is ready (Looks & style on staging)', () => {
    expect(subjectCalibration(row(0.857, 33))).toBe('ready')
    expect(subjectCalibration(row(6 / 7, 33))).toBe('ready')
  })

  it('NULL (never checked) is provisional', () => {
    expect(subjectCalibration(row(null, null, null))).toBe('provisional')
  })

  it('a changed JUDGE_VERSION is provisional, whatever the figure said', () => {
    const old = 'subject_judge_v1·gpt-4.1-mini·0.8/0.6·subject_embed_v1'
    expect(subjectCalibration(row(1, 33, old))).toBe('provisional')
    // …and cannot make a subject failed either.
    expect(subjectCalibration(row(1 / 3, 33, old))).toBe('provisional')
    expect(subjectCalibration(row(1 / 3, 33), 'some_other_judge')).toBe('provisional')
  })
})

describe('subjectCalibration on the stored calibrations', () => {
  it('staging, Sealand: five ready, Repair & warranty failed, Community & purpose provisional', () => {
    const staging: Record<string, ReturnType<typeof row>> = {
      Comfort: row(0.9166666666666666, 33),
      Durability: row(1, 33),
      'Looks & style': row(0.8571428571428571, 33),
      Price: row(1, 33),
      'Repair & warranty': row(0.3333333333333333, 33),
      Waterproofing: row(1, 33),
      'Community & purpose': row(null, null, null),
    }
    const states = Object.fromEntries(Object.entries(staging).map(([k, v]) => [k, subjectCalibration(v)]))
    expect(states).toEqual({
      Comfort: 'ready',
      Durability: 'ready',
      'Looks & style': 'ready',
      Price: 'ready',
      'Repair & warranty': 'failed',
      Waterproofing: 'ready',
      'Community & purpose': 'provisional',
    })
  })

  it('production, 25 Sep: the five over the floor are ready and the three under it are clearly under', () => {
    for (const p of [1, 0.96, 0.92, 0.88]) expect(subjectCalibration(row(p, 25))).toBe('ready')
    // Community & purpose 0.60 reaches about 0.77, Waterproofing 0.52 about
    // 0.70, Repair & warranty 0.36 about 0.55: all under 0.85, so all hidden.
    for (const p of [0.6, 0.52, 0.36]) expect(subjectCalibration(row(p, 25))).toBe('failed')
  })

  it('the boundary sits between 0.68 and 0.72 on 25 labels', () => {
    // 18 of 25 (0.72) reaches about 0.86 and stays provisional; 17 of 25
    // (0.68) reaches about 0.83 and fails.
    expect(subjectCalibration(row(18 / 25, 25))).toBe('provisional')
    expect(subjectCalibration(row(17 / 25, 25))).toBe('failed')
  })

  it('reads a numeric column handed back as a string', () => {
    expect(subjectCalibration(row('0.9166666666666666', '33'))).toBe('ready')
    expect(subjectCalibration(row('0.3333333333333333', '33'))).toBe('failed')
  })

  it('never fails a subject on a sample that does not exist', () => {
    expect(subjectCalibration(row(1 / 3, null))).toBe('provisional')
    expect(subjectCalibration(row(1 / 3, 0))).toBe('provisional')
  })

  it('an impossible precision under the floor reads provisional, never failed', () => {
    expect(subjectCalibration(row(-0.1, 33))).toBe('provisional')
    expect(subjectCalibration(row('not a number', 33))).toBe('provisional')
  })
})

describe('readCalibration: stored artefacts', () => {
  it('reads the stored two-state word "calibrating" as provisional', () => {
    expect(readCalibration('calibrating')).toBe('provisional')
  })

  it('reads the three states as themselves', () => {
    expect(readCalibration('ready')).toBe('ready')
    expect(readCalibration('provisional')).toBe('provisional')
    expect(readCalibration('failed')).toBe('failed')
  })

  it('a row stored with no field reads as null: it renders as sent, with no word', () => {
    expect(readCalibration(undefined)).toBeNull()
    expect(readCalibration(null)).toBeNull()
    expect(readCalibration('')).toBeNull()
    expect(calibrationWord(undefined)).toBeNull()
    expect(printsMarket(undefined)).toBe(true)
    expect(printsClient(undefined)).toBe(true)
    expect(earnsVerdict(undefined)).toBe(true)
  })
})

describe('what each state prints', () => {
  it('ready prints everything and carries no word', () => {
    expect(calibrationWord('ready')).toBeNull()
    expect([printsMarket('ready'), printsClient('ready'), earnsVerdict('ready'), isFailed('ready')]).toEqual([true, true, true, false])
  })

  it('provisional prints its market level, marked, and no client level, verdict or headline', () => {
    expect(calibrationWord('provisional')).toBe('provisional')
    expect(calibrationWord('calibrating')).toBe('provisional')
    expect([printsMarket('provisional'), printsClient('provisional'), earnsVerdict('provisional'), isFailed('provisional')]).toEqual([true, false, false, false])
  })

  it('failed prints nothing but its name and "being re-described"', () => {
    expect(calibrationWord('failed')).toBe('being re-described')
    expect([printsMarket('failed'), printsClient('failed'), earnsVerdict('failed'), isFailed('failed')]).toEqual([false, false, false, true])
  })

  it('the words carry no digit and no dash', () => {
    for (const w of Object.values(CALIBRATION_WORDS)) expect(w).not.toMatch(/[0-9—–]/)
  })
})
