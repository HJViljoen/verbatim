import { describe, expect, it } from 'vitest'

import { objectLine, loadObjectReadings, type MarketObjectRef } from '../agent/movement'
import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { subjectReadInOf } from '../pages/overview'
import { subjectUnreadMonths } from '../pipeline/anomaly-check'
import type { PairOn } from '../reading/pairs'
import { fakeDb } from '../test/fake-db'
import { otherJudgeMonths } from './read-in'
import { JUDGE_VERSION, judgeVersionFor } from './types'

// NO SILENT MIXING ACROSS A JUDGE CHANGE (14 Oct). Össur's judge changes;
// Cost & access keeps its June to August months under the old one (frozen) and
// has September and October re-read under the new one. A month read under a
// judge other than the tenant's own today is no reading of the subject, so
// nothing compares, trails or earns a direction word across the change.

const OLD = JUDGE_VERSION
const NEW = judgeVersionFor(OSSUR_CLIENT_ID)
const JUL = '2026-07-01'
const AUG = '2026-08-01'
const SEP = '2026-09-01'
const OCT = '2026-10-01'

describe('otherJudgeMonths', () => {
  const row = (month: string, subject_id: string, judge_version: string | null | undefined) => ({ month, subject_id, judge_version })

  it("cuts a subject's own months stamped by another judge, and only those", () => {
    const cut = otherJudgeMonths([row(JUL, 'cost', OLD), row(AUG, 'cost', OLD), row(SEP, 'cost', NEW)], NEW)
    expect([...cut('cost')].sort()).toEqual([JUL, AUG])
  })

  it('cuts a month a subject has no row in by the judge any other row there names (its 0 is the old judge\'s)', () => {
    const cut = otherJudgeMonths([row(AUG, 'cost', OLD), row(SEP, 'cost', NEW), row(SEP, 'fit', NEW)], NEW)
    expect([...cut('fit')]).toEqual([AUG])
    expect([...cut('nobody')]).toEqual([AUG])
  })

  it('cuts a month whose rows mix two judges (an audience frozen under the old one)', () => {
    expect([...otherJudgeMonths([row(SEP, 'cost', NEW), row(SEP, 'cost', OLD)], NEW)('cost')]).toEqual([SEP])
  })

  it('cuts nothing for a tenant whose rows all carry its own judge, nor where no row names one', () => {
    const sealand = otherJudgeMonths([row(AUG, 'looks', OLD), row(SEP, 'looks', OLD)], judgeVersionFor(SEALAND_CLIENT_ID))
    expect(sealand('looks').size).toBe(0)
    expect(otherJudgeMonths([row(AUG, 'looks', undefined), row(SEP, 'looks', null)], NEW)('looks').size).toBe(0)
  })
})

// ── Market, the Dashboard, Ask and the written read (`loadObjectReadings`) ──

const RIVALS = 'competitor:Ottobock'
const denom = (month: string, audience: string, videos: number, readAt: string) => ({
  client_id: '', month, audience, videos, comments: videos * 10, status: month === SEP || month === OCT ? 'filling' : 'frozen', origin: 'live', read_at: readAt, run_id: 'run-x',
})
function tables(clientId: string, judges: { aug: string; sep: string }) {
  const d = (month: string, audience: string, videos: number, readAt: string) => ({ ...denom(month, audience, videos, readAt), client_id: clientId })
  return {
    config_changes: [],
    pipeline_runs: [],
    subjects: [{ id: 'cost', name: 'Cost & access', client_id: clientId, named_at: '2026-06-01', created_at: '2026-06-01T09:00:00.000Z' }],
    month_denominators: [
      d(AUG, 'industry-other', 600, '2026-09-15T08:00:00.000Z'),
      d(SEP, 'industry-other', 650, '2026-10-18T05:00:00.000Z'),
      d(AUG, RIVALS, 40, '2026-09-15T08:00:00.000Z'),
      d(SEP, RIVALS, 30, '2026-10-18T05:00:00.000Z'),
    ],
    // A strict judge counts far fewer members: read across the change, the
    // drop would print as a market that stopped talking about cost.
    month_subject_readings: [
      { client_id: clientId, month: AUG, audience: 'industry-other', subject_id: 'cost', videos: 150, comments: 0, judge_version: judges.aug },
      { client_id: clientId, month: SEP, audience: 'industry-other', subject_id: 'cost', videos: 60, comments: 0, judge_version: judges.sep },
    ],
  }
}
// Read the same way on the market view, so the judge is the only break.
const joined: PairOn = (prevMonth, month) => ({ prevMonth, month, mode: 'comparable', reasons: [], row: null, checkWith: null })
const cost: MarketObjectRef = { kind: 'subject', id: 'cost', label: 'Cost & access', calibration: 'ready' }
const read = (clientId: string, judges: { aug: string; sep: string }) =>
  loadObjectReadings(fakeDb(tables(clientId, judges)).client as never, {
    clientId, month: SEP, pair: joined, asOf: '2026-10-19T00:00:00.000Z', rivalAudiences: [RIVALS], objects: [cost],
  })

describe('a subject month pair across a judge change', () => {
  it('compares August with September when one judge read both (the control)', async () => {
    const [r] = await read(OSSUR_CLIENT_ID, { aug: NEW, sep: NEW })
    expect(r.prev).toEqual({ month: AUG, k: 150, n: 640 })
    expect(r.verdict?.state).toBe('moved')
  })

  it("draws no comparison and no trail across it: August under the old judge is no reading of today's subject", async () => {
    const [r] = await read(OSSUR_CLIENT_ID, { aug: OLD, sep: NEW })
    expect(r.state).toBe('read')
    expect(r.curr).toEqual({ month: SEP, k: 60, n: 680 })
    expect(r.prev?.k ?? null).toBeNull()
    expect(r.verdict?.state).not.toBe('moved')
    expect(r.verdict?.changePts == null || r.verdict.state === 'too_little_data').toBe(true)
    expect(r.direction).toBeNull()
    const line = objectLine(r)
    expect(line).toContain('Sep 2026 60 of 680 videos')
    expect(line).not.toMatch(/Aug 2026|\bmoved\b/)
  })

  it('reads September as no reading until the next update re-reads it under the new judge', async () => {
    const [r] = await read(OSSUR_CLIENT_ID, { aug: OLD, sep: OLD })
    expect(r.state).toBe('unread')
    expect(r.verdict).toBeNull()
  })

  it("leaves Sealand exactly as it was: its rows carry its own judge", async () => {
    const [r] = await read(SEALAND_CLIENT_ID, { aug: OLD, sep: OLD })
    expect(r.prev).toEqual({ month: AUG, k: 150, n: 640 })
    expect(r.verdict?.state).toBe('moved')
  })
})

// ── The anomaly baseline (`subjectUnreadMonths`) ─────────────────────────────

describe('the unusual-week baseline across a judge change', () => {
  const at = (iso: string) => Date.parse(iso)
  const BASE = [JUL, AUG, SEP]
  const denominators = BASE.map((month) => ({ month, audience: 'industry-other', read_at: month === SEP ? '2026-10-18T05:00:00.000Z' : '2026-09-15T08:00:00.000Z' }))
  const months = BASE.map((month) => ({ month, videos: 120, total: 600 }))

  it("holds a subject at forming while any kept month was read by another judge (the check folded only the baseline's own keys)", () => {
    const cut = otherJudgeMonths([
      { month: JUL, subject_id: 'cost', judge_version: OLD },
      { month: AUG, subject_id: 'cost', judge_version: OLD },
      { month: SEP, subject_id: 'cost', judge_version: NEW },
    ], NEW)
    expect(subjectUnreadMonths({ months: BASE, denominators, subjectMonths: months as never, countedFrom: at('2026-06-01T09:00:00.000Z'), otherJudge: cut('cost') }))
      .toEqual([JUL, AUG])
    // Without the cut it was tested against the old judge's months.
    expect(subjectUnreadMonths({ months: BASE, denominators, subjectMonths: months as never, countedFrom: at('2026-06-01T09:00:00.000Z') })).toEqual([])
  })
})

// ── The legacy Overview's rows (`subjectReadInOf`) ───────────────────────────

describe("the legacy Overview's read-in rule across a judge change", () => {
  const rows = [
    { month: AUG, audience: 'industry-other', subject_id: 'cost', videos: 150, comments: 0, judge_version: OLD },
    { month: SEP, audience: 'industry-other', subject_id: 'cost', videos: 60, comments: 0, judge_version: NEW },
  ]
  const read = {
    writtenAt: new Map([[AUG, at('2026-09-15T08:00:00.000Z')], [SEP, at('2026-10-18T05:00:00.000Z')]]),
    countedFrom: new Map([['cost', at('2026-06-01T09:00:00.000Z')]]),
    unreadWords: 'not read in August',
  }
  function at(iso: string) { return Date.parse(iso) }

  it("reads a month under another judge as unread, and only with the tenant's judge in hand", () => {
    const withJudge = subjectReadInOf({ ...read, judgeVersion: NEW }, rows)
    expect(withJudge('cost', AUG)).toBe('unread')
    expect(withJudge('cost', SEP)).toBe('read')
    expect(subjectReadInOf(read, rows)('cost', AUG)).toBe('read')
    // Sealand's judge on Sealand's rows: nothing moves.
    expect(subjectReadInOf({ ...read, judgeVersion: judgeVersionFor(SEALAND_CLIENT_ID) }, rows.map((r) => ({ ...r, judge_version: OLD })))('cost', AUG)).toBe('read')
  })
})
