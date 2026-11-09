import { describe, expect, it, vi } from 'vitest'

import { fakeDb } from '../test/fake-db'
import { planCheckStats } from '../../components/pages/agent/surface'
import type { ClaimResult } from '../ask/types'
import { loadAgentThread } from './agent-thread'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }))

// A plan-check thread prints the plan's NEWEST reading (9 Nov, Össur's live
// data). The thread read `plan_checks.claims`, the answer written once at
// upload, while `ask-reevaluate` writes every later reading to
// `plan_check_evaluations` and never back. So the thread printed the 22 Aug
// upload's "2 supported, 8 contradicted, 5 untested" while Your moves, off
// `currentReading`, printed the 8 Nov re-reading's "3 supported, 8
// contradicted, 4 untested". The thread now goes through the same
// `currentReading`, and says the update its verdicts were read on.
//
// Synthetic rows: no comment text and no person from production.

const CLIENT = 'client-1'
const THREAD = 'thread-1'
const CHECK = 'check-1'

const claim = (ref: string, text: string, verdict: ClaimResult['verdict'], count: number, insightIds: string[], source: string | null): ClaimResult => ({
  ref,
  claim: text,
  verdict,
  theySay: verdict === 'silent' ? null : `What people say about ${ref}.`,
  conversationCount: count,
  themeRefs: verdict === 'silent' ? [] : [{ themeId: `${ref}-t`, registryId: null, label: `Conversation ${ref}` }],
  insightIds,
  source,
})

const DOC = 'Our plan. Fit decides the first purchase for most people. Price matters less than the clinic. Athletes carry the brand story.'
const SOURCES = {
  C1: 'Fit decides the first purchase for most people.',
  C2: 'Price matters less than the clinic.',
  C3: 'Athletes carry the brand story.',
}

/** The upload's answer, 22 Aug. */
const UPLOAD = [
  claim('C1', 'Fit decides the first purchase', 'echoes', 6, ['up-1'], SOURCES.C1),
  claim('C2', 'Price matters less than the clinic', 'echoes', 7, ['up-2'], SOURCES.C2),
  claim('C3', 'Athletes carry the brand story', 'silent', 0, [], SOURCES.C3),
]

/** The re-readings. A re-reading passes only each claim's ref and words to the
 *  verdict pass (`reevaluatePlanChecks`), so a fresh claim carries no source. */
const SEP = [
  claim('C1', 'Fit decides the first purchase', 'echoes', 6, ['sep-1'], null),
  claim('C2', 'Price matters less than the clinic', 'contradicts', 8, ['sep-2'], null),
  claim('C3', 'Athletes carry the brand story', 'silent', 0, [], null),
]
const NOV = [
  claim('C1', 'Fit decides the first purchase', 'echoes', 9, ['nov-1'], null),
  claim('C2', 'Price matters less than the clinic', 'contradicts', 11, ['nov-2'], null),
  claim('C3', 'Athletes carry the brand story', 'echoes', 5, ['nov-3'], null),
]

function tables(evaluations: Record<string, unknown>[]) {
  return {
    agent_threads: [{ id: THREAD, client_id: CLIENT, kind: 'document', title: 'A campaign plan', plan_check_id: CHECK, created_at: '2026-08-22T09:00:00.000Z' }],
    agent_messages: [{ id: 'm1', thread_id: THREAD, role: 'user', content: 'A campaign plan', result: null, outcome: null, created_at: '2026-08-22T09:00:00.000Z', run_id: 'run-aug' }],
    clients: [{ id: CLIENT, company_name: 'A brand' }],
    pipeline_runs: [{ id: 'run-aug', client_id: CLIENT, started_at: '2026-08-21T05:00:00.000Z' }],
    plan_checks: [{
      id: CHECK, client_id: CLIENT, title: 'A campaign plan', source_filename: 'plan.pdf', created_at: '2026-08-22T09:00:00.000Z',
      claims: UPLOAD, summary: { supported: 2, contradicted: 0, untested: 1 }, judgement: [], input_text: DOC, notice: null,
    }],
    plan_check_evaluations: evaluations,
    insight_evidence: ['up-1', 'up-2', 'sep-1', 'sep-2', 'nov-1', 'nov-2', 'nov-3'].map((id, i) => ({
      id: `e${i}`, audience_insight_id: id, quote: `a readable quote from insight ${id} about the plan`, relevance_rank: 1, source: 'comment', redacted: false,
    })),
  }
}

const evaluation = (runId: string, runDate: string, createdAt: string, claims: ClaimResult[]) => ({
  plan_check_id: CHECK, client_id: CLIENT, run_id: runId, run_date: runDate, created_at: createdAt, moved: [],
  claims,
  summary: {
    supported: claims.filter((c) => c.verdict === 'echoes').length,
    contradicted: claims.filter((c) => c.verdict === 'contradicts').length,
    untested: claims.filter((c) => c.verdict === 'silent').length,
  },
})

async function load(evaluations: Record<string, unknown>[]) {
  const db = fakeDb(tables(evaluations))
  const data = await loadAgentThread({ supabase: db.client as never, clientId: CLIENT, reading: { client: db.client, clientId: CLIENT } as never, params: { thread: THREAD } })
  return { data: data!, db }
}

/** The figures row's "Checked against" cell, a plain string. */
const checkedAgainst = (d: Awaited<ReturnType<typeof load>>['data']) =>
  planCheckStats(d).find((i) => i.key === 'checked')?.value

describe('a plan-check thread prints the newest reading', () => {
  it('prints the newest re-reading’s verdicts, counts and summary, and the update they were read on', async () => {
    const { data } = await load([
      evaluation('run-nov', '2026-11-08', '2026-11-08T06:00:00.000Z', NOV),
      evaluation('run-sep', '2026-09-13', '2026-09-13T06:00:00.000Z', SEP),
    ])
    const doc = data.document!
    expect(doc.claims.map((c) => [c.ref, c.verdict, c.conversationCount])).toEqual([
      ['C1', 'echoes', 9], ['C2', 'contradicts', 11], ['C3', 'echoes', 5],
    ])
    expect(doc.summary).toEqual({ supported: 2, contradicted: 1, untested: 0 })
    expect(checkedAgainst(data)).toBe('The update of 8 Nov')
    // The export's tally is the same reading.
    expect(data.method.note).toBe('2 supported · 1 contradicted · 0 untested.')
  })

  it('keeps the document’s own sentences marked: a claim’s source is the upload’s, which a re-reading does not carry', async () => {
    const { data } = await load([evaluation('run-nov', '2026-11-08', '2026-11-08T06:00:00.000Z', NOV)])
    const doc = data.document!
    expect(doc.anchored.sort()).toEqual(['C1', 'C2', 'C3'])
    expect(doc.segments.filter((s) => s.ref).map((s) => s.text)).toEqual([SOURCES.C1, SOURCES.C2, SOURCES.C3])
    expect(doc.claims.map((c) => c.source)).toEqual([SOURCES.C1, SOURCES.C2, SOURCES.C3])
  })

  it('quotes the evidence behind the printed verdicts, never the upload’s', async () => {
    const { data, db } = await load([evaluation('run-nov', '2026-11-08', '2026-11-08T06:00:00.000Z', NOV)])
    const quoted = Object.values(data.document!.quotesByClaim).flat().map((q) => q.text)
    expect(quoted.length).toBeGreaterThan(0)
    expect(quoted.every((t) => /insight nov-/.test(t))).toBe(true)
    expect(db.calls.some((c) => c.table === 'plan_check_evaluations' && c.filters.includes(`plan_check_id=${CHECK}`))).toBe(true)
  })

  it('prints the upload’s answer, dated by the upload’s update, where nothing has re-read the plan', async () => {
    const { data } = await load([])
    const doc = data.document!
    expect(doc.claims.map((c) => [c.ref, c.verdict])).toEqual([['C1', 'echoes'], ['C2', 'echoes'], ['C3', 'silent']])
    expect(doc.summary).toEqual({ supported: 2, contradicted: 0, untested: 1 })
    expect(checkedAgainst(data)).toBe('The update of 21 Aug')
  })
})
