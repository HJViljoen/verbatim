import { describe, expect, it } from 'vitest'

import {
  SUBJECT_BUDGET_SHARE,
  buildJudgeSystemPrompt,
  buildJudgeUserPrompt,
  coverageClears,
  emptyMembershipResult,
  membershipRows,
  estimateFirstPass,
  judgeCallCost,
  membershipSummary,
  planJudgeBatches,
  subjectBudgetUsd,
  subjectsNeedingVectors,
  validateJudgeResponse,
  SUBJECT_BAND_SHARE,
  type JudgeCandidate,
} from './membership'
import { JUDGE_VERSION, SUBJECT_EMBED_INPUT_VERSION, SUBJECT_JUDGE_BATCH, SUBJECT_MIN_COVERAGE } from './types'

const candidate = (n: number): JudgeCandidate => ({
  id: `insight-${n}`,
  theme: `some_theme_${n}`,
  description: `People said thing ${n}.`,
  score: 0.6,
})

describe('planJudgeBatches', () => {
  it('cuts the band at the batch size and keeps the order', () => {
    const band = Array.from({ length: 45 }, (_, i) => candidate(i))
    const batches = planJudgeBatches(band)
    expect(batches.map((b) => b.length)).toEqual([SUBJECT_JUDGE_BATCH, SUBJECT_JUDGE_BATCH, 5])
    expect(batches[0][0].id).toBe('insight-0')
    expect(batches[2][4].id).toBe('insight-44')
  })

  it('plans nothing for an empty band', () => {
    expect(planJudgeBatches([])).toEqual([])
  })

  it('is deterministic — the same band plans the same batches twice', () => {
    const band = Array.from({ length: 50 }, (_, i) => candidate(i))
    expect(planJudgeBatches(band)).toEqual(planJudgeBatches(band))
  })
})

describe('coverageClears', () => {
  it('refuses a half-embedded corpus', () => {
    // Össur and Sealand as measured 2026-09-15: a subject scored against either
    // reads low and says nothing about it.
    expect(coverageClears({ embedded: 1680, total: 3129 })).toBe(false)
    expect(coverageClears({ embedded: 785, total: 2872 })).toBe(false)
  })

  it('clears at the floor and above', () => {
    expect(coverageClears({ embedded: 95, total: 100 })).toBe(true)
    expect(coverageClears({ embedded: 3129, total: 3129 })).toBe(true)
    expect(coverageClears({ embedded: Math.ceil(SUBJECT_MIN_COVERAGE * 1000), total: 1000 })).toBe(true)
  })

  it('clears a tenant with nothing to under-count rather than dividing by zero', () => {
    expect(coverageClears({ embedded: 0, total: 0 })).toBe(true)
  })
})

describe('the judge prompt', () => {
  it('names the subject and its description, and answers by ref only', () => {
    const system = buildJudgeSystemPrompt({ name: 'comfort', description: 'How it feels to wear all day.' })
    expect(system).toContain('"comfort"')
    expect(system).toContain('How it feels to wear all day.')
    // Mood must not decide membership: a complaint and a compliment about the
    // same thing are both members, and a judge that reads sentiment would make
    // every subject a sentiment slice.
    expect(system).toContain('not the mood')
  })

  it('tells the model to be strict when nobody wrote a description', () => {
    expect(buildJudgeSystemPrompt({ name: 'price', description: null })).toContain('be strict')
  })

  it('numbers blocks from i1 and never carries a uuid', () => {
    const user = buildJudgeUserPrompt([candidate(1), candidate(2)])
    expect(user).toContain('[i1] some theme 1: People said thing 1.')
    expect(user).toContain('[i2]')
    expect(user).not.toContain('insight-1')
  })
})

describe('validateJudgeResponse', () => {
  const batch = [candidate(1), candidate(2), candidate(3)]

  it('maps refs back onto ids, both answers', () => {
    const out = validateJudgeResponse(
      { decisions: [{ ref: 'i1', belongs: true }, { ref: 'i3', belongs: false }] },
      batch,
    )
    expect(out.get('insight-1')).toBe(true)
    expect(out.get('insight-3')).toBe(false)
  })

  it('leaves an unanswered block UNDECIDED rather than recording a no', () => {
    // The whole cost model rests on this: a missing decision that became a
    // stored `false` would never be asked again, and the subject would be
    // permanently short by however many blocks the model skipped.
    const out = validateJudgeResponse({ decisions: [{ ref: 'i1', belongs: true }] }, batch)
    expect(out.has('insight-2')).toBe(false)
    expect(out.size).toBe(1)
  })

  it('drops an invented ref, an out-of-range ref and a duplicate', () => {
    const out = validateJudgeResponse(
      {
        decisions: [
          { ref: 'i9', belongs: true },
          { ref: 'nonsense', belongs: true },
          { ref: 'i2', belongs: true },
          { ref: 'i2', belongs: false },
        ],
      },
      batch,
    )
    expect([...out]).toEqual([['insight-2', true]])
  })

  it('tolerates whitespace and case in a ref', () => {
    expect(validateJudgeResponse({ decisions: [{ ref: ' I2 ', belongs: true }] }, batch).get('insight-2')).toBe(true)
  })
})

describe('membershipRows', () => {
  it('stamps the judge version, the method and the band score on every row', () => {
    const rows = membershipRows({
      clientId: 'client-1',
      subjectId: 'subject-1',
      runId: 'run-1',
      decisions: new Map([['insight-1', true], ['insight-2', false]]),
      scores: new Map([['insight-1', 0.62]]),
      method: 'judge',
    })
    expect(rows).toEqual([
      { subject_id: 'subject-1', audience_insight_id: 'insight-1', client_id: 'client-1', member: true, method: 'judge', score: 0.62, judge_version: JUDGE_VERSION, run_id: 'run-1' },
      { subject_id: 'subject-1', audience_insight_id: 'insight-2', client_id: 'client-1', member: false, method: 'judge', score: null, judge_version: JUDGE_VERSION, run_id: 'run-1' },
    ])
  })

  it('stores the judged NO — it is the expensive answer', () => {
    const rows = membershipRows({
      clientId: 'c', subjectId: 's', runId: null,
      decisions: new Map([['i', false]]), scores: new Map(), method: 'judge',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].member).toBe(false)
  })
})

describe('subjectsNeedingVectors', () => {
  const s = (over: Partial<{ embedded_at: string | null; embed_input_version: string | null }>) => ({
    id: 'x', name: 'n', description: null, embedded_at: null, embed_input_version: null, ...over,
  })

  it('takes a subject that has never been embedded', () => {
    expect(subjectsNeedingVectors([s({})])).toHaveLength(1)
  })

  it('takes a subject embedded by a formula that is no longer the formula', () => {
    expect(subjectsNeedingVectors([s({ embedded_at: 'now', embed_input_version: 'subject_embed_v0' })])).toHaveLength(1)
  })

  it('leaves a current one alone', () => {
    expect(subjectsNeedingVectors([s({ embedded_at: 'now', embed_input_version: SUBJECT_EMBED_INPUT_VERSION })])).toEqual([])
  })
})

describe('estimateFirstPass', () => {
  // The shares come from status/subject-band-2026-09-23.md: Sealand's 3,719
  // embedded insights against all six subjects at the shipped 0.60/0.40 band
  // with `subject_embed_v2` phrases — 44 pairs on Price (1.2%), 471 on Repair &
  // warranty (12.7%), 1,298 across six (5.8% mean).
  const SEALAND = 3719

  it('brackets the six subjects that were actually measured', () => {
    const e = estimateFirstPass(SEALAND)
    // Scaled back up at the population they were measured on, the ends ARE the
    // narrowest and the broadest subject — Price's 44 pairs and Repair &
    // warranty's 471. That is the check that the shares were read off the
    // table and not rounded into something tidier.
    expect(e.pairs.low).toBe(44)
    expect(e.pairs.high).toBe(471)
    // And the midpoint is the measured mean (1,298 pairs over six subjects),
    // not the middle of the two ends — the distribution is skewed and the mean
    // is the honest centre.
    expect(e.pairs.mid).toBe(Math.round(SEALAND * SUBJECT_BAND_SHARE.mid))
    expect(e.pairs.mid).toBe(Math.round(1298 / 6))
  })

  it('turns pairs into whole calls, rounding up — a part batch is still a call', () => {
    const e = estimateFirstPass(SEALAND)
    expect(e.calls.low).toBe(Math.ceil(e.pairs.low / SUBJECT_JUDGE_BATCH))
    expect(e.calls.high).toBe(Math.ceil(e.pairs.high / SUBJECT_JUDGE_BATCH))
    expect(e.calls.low).toBeLessThan(e.calls.mid)
    expect(e.calls.mid).toBeLessThan(e.calls.high)
  })

  it('prices through the same arithmetic the banded dry run uses', () => {
    const e = estimateFirstPass(SEALAND)
    expect(e.costUsd.mid).toBeCloseTo(judgeCallCost(e.calls.mid), 10)
    // Still nowhere near the pass ceiling — the note's whole point is that
    // cost is not what bounds this decision.
    expect(e.costUsd.high).toBeLessThan(subjectBudgetUsd(60))
  })

  it('is zero for a tenant with nothing embedded, and says so as zero', () => {
    const e = estimateFirstPass(0)
    expect(e.pairs).toEqual({ low: 0, mid: 0, high: 0 })
    expect(e.calls).toEqual({ low: 0, mid: 0, high: 0 })
    expect(e.costUsd.mid).toBe(0)
  })
})

describe('the pass ceiling', () => {
  it('is a fraction of the run budget, not a second copy of it', () => {
    expect(subjectBudgetUsd(60)).toBeCloseTo(60 * SUBJECT_BUDGET_SHARE)
    // Well above the measured cost of a full re-judge on the larger tenant
    // (~$0.17) and well below the run kill switch.
    expect(subjectBudgetUsd(60)).toBeGreaterThan(1)
    expect(subjectBudgetUsd(60)).toBeLessThan(60)
  })
})

describe('membershipSummary', () => {
  it('says why a refusal is a refusal, and what to do about it', () => {
    const text = membershipSummary({ ...emptyMembershipResult('s', 'comfort'), skipped: 'coverage_short' })
    expect(text).toContain('REFUSED')
    expect(text).toContain('embed-insights')
  })

  it('names the missing migration rather than the error it caused', () => {
    expect(membershipSummary({ ...emptyMembershipResult('s', 'comfort'), skipped: 'migration' }))
      .toContain('20260918093000_subjects.sql')
  })

  it('distinguishes "nothing was compared" from "nobody belongs"', () => {
    expect(membershipSummary({ ...emptyMembershipResult('s', 'comfort'), skipped: 'no_vector' }))
      .toContain('no phrase vector')
  })

  it('reports the counts, the cost and anything still undecided', () => {
    const text = membershipSummary({
      ...emptyMembershipResult('s', 'price'),
      vectorMembers: 12, judged: 60, judgedMembers: 31, unanswered: 4, calls: 3, costUsd: 0.0047, written: 43,
    })
    expect(text).toContain('12 by vector')
    expect(text).toContain('31/60 by judge in 3 call(s)')
    expect(text).toContain('43 rows')
    expect(text).toContain('4 unanswered, still undecided')
  })

  it('calls a first-pass estimate an estimate, and never prints it as $0.00', () => {
    const text = membershipSummary({
      ...emptyMembershipResult('s', 'price'),
      estimated: estimateFirstPass(3719),
      calls: estimateFirstPass(3719).calls.mid,
      costUsd: estimateFirstPass(3719).costUsd.mid,
    })
    // The three things a reader of a dry run has to be told.
    expect(text).toContain('FIRST PASS, EMBEDDING REQUIRED')
    expect(text).toContain('ESTIMATE, not a count')
    expect(text).toContain('3,719 embedded insights')
    // A range, not one number pretending to be known.
    expect(text).toMatch(/~\d+-\d+ calls/)
    expect(text).toMatch(/~\$0\.\d+-\$0\.\d+/)
    // And the thing it used to say instead.
    expect(text).not.toContain('nothing judged')
    expect(text).not.toContain('0 by vector')
  })

  it('says out loud when the pass stopped at its ceiling', () => {
    expect(membershipSummary({ ...emptyMembershipResult('s', 'price'), budgetStopped: true })).toContain('STOPPED')
  })
})
