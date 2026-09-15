import { describe, it, expect } from 'vitest'
import { bandVerdict, isAnswer, type Verdict, type VerdictWindow } from './verdicts'
import { proportionDelta, SHARE_BAND, SENTIMENT_BAND } from '../report-bands'
import { anomalyVerdict, weekVsBaseline, type AnomalyRow } from './anomaly'

const AUG: VerdictWindow = { kind: 'month', from: '2026-08-01', to: '2026-09-01' }
const JUL = { from: '2026-07-01', to: '2026-08-01' }

const theme = (over: Partial<Parameters<typeof bandVerdict>[0]> = {}) =>
  bandVerdict({
    objectKind: 'theme',
    objectId: '29837c1a-ad02-452c-acaf-0da46efcffbd',
    objectLabel: 'Audience identities and amputation types',
    audience: 'industry-other',
    window: AUG,
    basis: JUL,
    value: { k: 102, n: 628 },
    baseline: { k: 9, n: 118 },
    ...over,
  })

describe('bandVerdict', () => {
  it('carries both sides, the change and the band beside the word', () => {
    const v = theme()
    expect(v.value).toEqual({ k: 102, n: 628 })
    expect(v.baseline).toEqual({ k: 9, n: 118 })
    expect(v.changePts).not.toBeNull()
    expect(v.bandPts).not.toBeNull()
    expect(v.window).toEqual(AUG)
    expect(v.basis).toEqual(JUL)
  })

  it('is exactly proportionDelta — the same rule, not a second one', () => {
    const v = theme()
    const direct = proportionDelta(
      { nowPct: (102 / 628) * 100, prevPct: (9 / 118) * 100, nowN: 628, prevN: 118, nowK: 102, prevK: 9 },
      SHARE_BAND,
    )
    expect(v.changePts).toBe(direct.change)
    expect(v.bandPts).toBe(direct.band)
    expect(v.state).toBe(direct.state)
  })

  it('reads too_little_data when a side is under the floor', () => {
    // Össur's own brand: 20 videos in August is a level, never a comparison.
    const v = theme({ value: { k: 6, n: 20 }, baseline: { k: 2, n: 8 }, audience: 'client' })
    expect(v.state).toBe('too_little_data')
    expect(isAnswer(v.state)).toBe(false)
  })

  it('reads too_little_data when the object clears the denominator floor but not minK', () => {
    const v = theme({ value: { k: 3, n: 628 }, baseline: { k: 2, n: 618 } })
    expect(v.state).toBe('too_little_data')
  })

  it('reads moved when both sides clear the floors and the change clears the band', () => {
    const v = theme({ value: { k: 251, n: 1000 }, baseline: { k: 120, n: 1000 } })
    expect(v.state).toBe('moved')
    expect(isAnswer(v.state)).toBe(true)
    expect(v.changePts).toBeGreaterThan(v.bandPts as number)
  })

  it('reads no_clear_change when the change sits inside the band', () => {
    const v = theme({ value: { k: 617, n: 1000 }, baseline: { k: 600, n: 1000 } })
    expect(v.state).toBe('no_clear_change')
    expect(isAnswer(v.state)).toBe(true)
  })

  it('takes another band when the caller has one — sentiment has no numerator floor', () => {
    const shares = { value: { k: 3, n: 628 }, baseline: { k: 2, n: 618 } }
    expect(theme({ ...shares }).state).toBe('too_little_data')
    expect(theme({ ...shares, floor: SENTIMENT_BAND }).state).toBe('no_clear_change')
  })

  it('with no baseline is a level, not a flat reading', () => {
    const v = theme({ baseline: undefined, basis: undefined })
    expect(v.state).toBe('too_little_data')
    expect(v.changePts).toBeNull()
    expect(v.bandPts).toBeNull()
    expect(v.baseline).toBeUndefined()
    expect(v.basis).toBeUndefined()
    expect(v.direction).toBeUndefined()
  })

  it('refuses without drawing a band, and keeps the counts so levels still print', () => {
    const v = theme({ refused: 'clustering_changed' })
    expect(v.state).toBe('refused')
    expect(v.refusedReason).toBe('clustering_changed')
    expect(v.changePts).toBeNull()
    expect(v.bandPts).toBeNull()
    expect(v.value).toEqual({ k: 102, n: 628 })
    expect(isAnswer(v.state)).toBe(false)
  })

  it('a refusal beats a comparison that would otherwise have read moved', () => {
    const moved = theme({ value: { k: 251, n: 1000 }, baseline: { k: 120, n: 1000 } })
    const refused = theme({ value: { k: 251, n: 1000 }, baseline: { k: 120, n: 1000 }, refused: 'rename' })
    expect(moved.state).toBe('moved')
    expect(refused.state).toBe('refused')
  })

  it('never invents a direction word from one comparison', () => {
    for (const v of [theme(), theme({ value: { k: 251, n: 1000 }, baseline: { k: 120, n: 1000 } })]) {
      expect(v.direction ?? null).toBeNull()
    }
  })

  it('carries the flags it was given and invents none', () => {
    expect(theme().flags).toEqual([])
    expect(theme({ flags: ['thin', 'clustering_changed'] }).flags).toEqual(['thin', 'clustering_changed'])
  })

  it('survives an empty denominator rather than dividing by zero', () => {
    const v = theme({ value: { k: 0, n: 0 }, baseline: { k: 0, n: 0 } })
    expect(v.state).toBe('too_little_data')
    expect(v.changePts).toBe(0)
    expect(Number.isFinite(v.bandPts as number)).toBe(true)
  })

  it('isAnswer separates the two answers from the three declines', () => {
    expect(['moved', 'no_clear_change'].every((s) => isAnswer(s as Verdict['state']))).toBe(true)
    expect(['too_little_data', 'baseline_forming', 'refused'].some((s) => isAnswer(s as Verdict['state']))).toBe(false)
  })
})

// ---- The anomaly adapter -----------------------------------------------------

const WEEK = { from: '2026-09-07T00:00:00.000Z', to: '2026-09-14T00:00:00.000Z' }
const BASIS = { from: '2026-06-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' }

const row = (over: Partial<AnomalyRow> = {}): AnomalyRow => ({
  kind: 'rival',
  id: 'competitor:Ottobock',
  label: 'Ottobock',
  denominator: 'every audience together',
  weekVideos: 32,
  weekTotal: 290,
  weekPct: (32 / 290) * 100,
  baselineVideos: 56,
  baselineTotal: 396,
  baselinePct: (56 / 396) * 100,
  baselineMonthsClearing: 3,
  verdict: { state: 'no_clear_change', change: -3.1, band: 5.1 },
  p: 0.22,
  holmThreshold: 0.0015,
  state: 'no_clear_change',
  ...over,
})

describe('anomalyVerdict', () => {
  it('carries the week as the window and the baseline as the basis', () => {
    const v = anomalyVerdict(row(), WEEK, BASIS)
    expect(v.window).toEqual({ kind: 'week', ...WEEK })
    expect(v.basis).toEqual(BASIS)
    expect(v.value).toEqual({ k: 32, n: 290 })
    expect(v.baseline).toEqual({ k: 56, n: 396 })
    expect(v.changePts).toBe(-3.1)
    expect(v.bandPts).toBe(5.1)
  })

  it('omits the basis when the caller does not name one', () => {
    expect(anomalyVerdict(row(), WEEK).basis).toBeUndefined()
  })

  it('translates flagged to moved', () => {
    expect(anomalyVerdict(row({ state: 'flagged' }), WEEK).state).toBe('moved')
  })

  it('carries the baseline\'s caveats so the prompt sees them, not only the flag row', () => {
    // verdictBlock prints flags= off the Verdict; with an empty list the model
    // was handed "verdict=moved, n=…, direction=NONE" and no hint that the
    // baseline was read under a mixed grouping or had not frozen.
    expect(anomalyVerdict(row(), WEEK, BASIS, { regime: 'mixed' }).flags).toEqual(['clustering_changed'])
    expect(anomalyVerdict(row(), WEEK, BASIS, { regime: 'unknown' }).flags).toEqual(['clustering_unknown'])
    expect(anomalyVerdict(row(), WEEK, BASIS, { regime: 'unknown', baselineFillingMonths: 2 }).flags)
      .toEqual(['clustering_unknown', 'thin'])
  })

  it('says nothing about a grouping it was told nothing about', () => {
    expect(anomalyVerdict(row(), WEEK, BASIS).flags).toEqual([])
    expect(anomalyVerdict(row(), WEEK, BASIS, { regime: 'one', baselineFillingMonths: 0 }).flags).toEqual([])
    expect(anomalyVerdict(row(), WEEK, BASIS, { regime: 'not_grouped' }).flags).toEqual([])
  })

  it('takes the ROW state, not the band state — a Holm refusal is no_clear_change', () => {
    // Both gates are the rule: the band said moved, the correction did not.
    const held = row({ verdict: { state: 'moved', change: -9.4, band: 5.1 }, state: 'no_clear_change' })
    const v = anomalyVerdict(held, WEEK)
    expect(v.state).toBe('no_clear_change')
    expect(v.changePts).toBe(-9.4)
  })

  it('passes baseline_forming and too_little_data through untranslated', () => {
    expect(anomalyVerdict(row({ state: 'baseline_forming', verdict: null, p: null }), WEEK).state).toBe('baseline_forming')
    expect(anomalyVerdict(row({ state: 'too_little_data' }), WEEK).state).toBe('too_little_data')
  })

  it('leaves the change and band null when no band was drawn', () => {
    const v = anomalyVerdict(row({ state: 'baseline_forming', verdict: null, p: null, holmThreshold: null }), WEEK)
    expect(v.changePts).toBeNull()
    expect(v.bandPts).toBeNull()
  })

  it('names the denominator as the audience the share is a share of', () => {
    expect(anomalyVerdict(row(), WEEK).audience).toBe('every audience together')
  })

  it('never carries a direction word or a flag', () => {
    const v = anomalyVerdict(row({ state: 'flagged' }), WEEK)
    expect(v.direction ?? null).toBeNull()
    expect(v.flags).toEqual([])
  })

  it('adapts a real reading end to end', () => {
    const reading = weekVsBaseline({
      week: '2026-W37',
      denominators: [
        {
          name: 'every audience together',
          weekVideos: 205,
          months: [
            { month: '2026-06-01', videos: 232 },
            { month: '2026-07-01', videos: 136 },
            { month: '2026-08-01', videos: 721 },
          ],
        },
      ],
      set: [
        {
          kind: 'kind',
          id: 'question',
          label: 'Questions',
          denominator: 'every audience together',
          weekVideos: 28,
          months: [
            { month: '2026-06-01', videos: 8 },
            { month: '2026-07-01', videos: 5 },
            { month: '2026-08-01', videos: 25 },
          ],
        },
      ],
    })
    const v = anomalyVerdict(reading.rows[0], WEEK, BASIS)
    expect(v.objectKind).toBe('kind')
    expect(v.objectId).toBe('question')
    expect(v.value).toEqual({ k: 28, n: 205 })
    expect(v.baseline).toEqual({ k: 38, n: 1089 })
    expect(v.state).toBe(reading.rows[0].state === 'flagged' ? 'moved' : reading.rows[0].state)
  })
})
