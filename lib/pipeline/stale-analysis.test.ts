import { describe, expect, it } from 'vitest'

import { fakeAdmin, type FakeAdmin } from '../test/s3-run-fake-admin'
import { staleInsightIds } from './pass-a-plan'
import { countedMemberIds, pruneStaleAnalysis, trimFreezeHold, trimStaleMemberships, trimSummary } from './stale-analysis'

// The prune and the trim before the freeze (deploy 5b), on the in-memory admin.
// The fake does not cascade, so a test that needs the prune's cascade on
// subject_memberships applies it itself (`cascade`), exactly as the foreign key
// does: a membership whose insight is gone is gone.

const C = '00000000-0000-4000-8000-00000000c5b1'
const OLD = 'run-0927'
const NEW = 'run-1004'

type Row = Record<string, unknown>

/** Three videos, one of them re-read by NEW (v1). On v1: `a` superseded and
 *  cited by nothing, `b` superseded and cited (a recommendation, through its
 *  market insight), `c` the re-read's current row. On v2 `d` is current. On v3,
 *  re-read too: `e` superseded with only a judged NO on file, `f` superseded
 *  with no membership, and `g` a row with no run at all. */
function world(opts: { memberships?: Row[] | 'missing'; drop?: string[] } = {}): FakeAdmin {
  const tables: Record<string, Row[]> = {
    videos: [
      { id: 'v1', client_id: C, analyzed_run_id: NEW },
      { id: 'v2', client_id: C, analyzed_run_id: OLD },
      { id: 'v3', client_id: C, analyzed_run_id: NEW },
    ],
    audience_insights: [
      { id: 'a', client_id: C, run_id: OLD, source_video_id: 'v1' },
      { id: 'b', client_id: C, run_id: OLD, source_video_id: 'v1' },
      { id: 'c', client_id: C, run_id: NEW, source_video_id: 'v1' },
      { id: 'd', client_id: C, run_id: OLD, source_video_id: 'v2' },
      { id: 'e', client_id: C, run_id: OLD, source_video_id: 'v3' },
      { id: 'f', client_id: C, run_id: OLD, source_video_id: 'v3' },
      { id: 'g', client_id: C, run_id: null, source_video_id: 'v3' },
    ],
    language_samples: [
      { id: 'p1', client_id: C, run_id: OLD, source_video_id: 'v1' },
      { id: 'p2', client_id: C, run_id: NEW, source_video_id: 'v1' },
    ],
    subject_memberships: opts.memberships === 'missing' ? [] : opts.memberships ?? [
      { subject_id: 's1', audience_insight_id: 'a', client_id: C, member: true },
      { subject_id: 's2', audience_insight_id: 'a', client_id: C, member: false },
      { subject_id: 's1', audience_insight_id: 'b', client_id: C, member: true },
      { subject_id: 's1', audience_insight_id: 'c', client_id: C, member: true },
      { subject_id: 's2', audience_insight_id: 'd', client_id: C, member: true },
      { subject_id: 's1', audience_insight_id: 'e', client_id: C, member: false },
      { subject_id: 's2', audience_insight_id: 'g', client_id: C, member: true },
    ],
    recommendations: [{ id: 'rec1', client_id: C, based_on: { insight_ids: ['m1'] } }],
    market_insights: [{ id: 'm1', client_id: C, evidence: { supporting_theme_ids: ['b'] } }],
    competitive_insights: [],
    plan_checks: [],
    plan_check_evaluations: [],
    agent_messages: [],
    report_snapshots: [],
    insight_evidence: [],
  }
  if (opts.memberships === 'missing') delete tables.subject_memberships
  for (const t of opts.drop ?? []) delete tables[t]
  return fakeAdmin({ tables })
}

/** The foreign key's cascade: memberships of insights that are gone. */
function cascade(f: FakeAdmin): void {
  const live = new Set(f.tables.audience_insights.map((r) => r.id))
  f.tables.subject_memberships = f.tables.subject_memberships.filter((r) => live.has(r.audience_insight_id))
}

const ids = (rows: Row[] | undefined, col = 'id') => (rows ?? []).map((r) => String(r[col])).sort()
const deleted = (f: FakeAdmin, table: string) => f.writes.filter((w) => w.table === table && w.op === 'delete').flatMap((w) => w.rows)

describe('trimStaleMemberships: the prune\'s cascade on subject_memberships, before the freeze', () => {
  it('removes every membership row of exactly the insights the prune deletes, and nothing else', async () => {
    const f = world()
    const r = await trimStaleMemberships(f.client, C)
    // a (both rows), e (a judged NO), g (no run): superseded and cited by nothing.
    // b is superseded but cited, c and d are current, f has no membership.
    expect(ids(deleted(f, 'subject_memberships'), 'audience_insight_id')).toEqual(['a', 'a', 'e', 'g'])
    expect(r).toMatchObject({ memberships: 7, membershipInsights: 6, superseded: 4, prunable: 3, removed: 4, removedMembers: 2, skipped: null, dryRun: false })
    expect(r.bySubject).toEqual({ s1: 1, s2: 1 })
    // Only subject_memberships is written: no insight, no evidence, no month row.
    expect([...new Set(f.writes.map((w) => w.table))]).toEqual(['subject_memberships'])

    // And the prune after it deletes those insights and holds none.
    const p = await pruneStaleAnalysis(f.client, C)
    expect(ids(deleted(f, 'audience_insights'))).toEqual(['a', 'e', 'f', 'g'])
    expect(p).toEqual({ insights: 4, languageSamples: 1, keptInsights: 1, keptSamples: 0, heldForSubjects: 0 })
  })

  it('the set it trims is the prune\'s own, intersected with the insights a membership names', async () => {
    // The prune's set, computed the way pruneStaleAnalysis computes it (no hold,
    // no trim), against what the trim removed.
    const f = world()
    const named = new Set(f.tables.subject_memberships.map((m) => m.audience_insight_id as string))
    const prunes = staleInsightIds(
      f.tables.videos as { id: string; analyzed_run_id: string | null }[],
      f.tables.audience_insights as { id: string; run_id: string | null; source_video_id: string | null }[],
      new Set(['b']),
    )
    await trimStaleMemberships(f.client, C)
    expect([...new Set(ids(deleted(f, 'subject_memberships'), 'audience_insight_id'))]).toEqual(prunes.filter((id) => named.has(id)).sort())
  })

  it('a dry run counts the same and deletes nothing', async () => {
    const f = world()
    const r = await trimStaleMemberships(f.client, C, { dryRun: true })
    expect(r).toMatchObject({ prunable: 3, removed: 4, removedMembers: 2, dryRun: true })
    expect(f.writes).toEqual([])
    expect(trimSummary(r)).toMatch(/^would remove 4 membership row\(s\) \(2 member\(s\)\) of 3 insight\(s\)/)
  })

  it('reads no citation when no membership names a superseded insight (the common weekly case pays two reads)', async () => {
    const f = world({ memberships: [{ subject_id: 's1', audience_insight_id: 'c', client_id: C, member: true }, { subject_id: 's1', audience_insight_id: 'd', client_id: C, member: true }] })
    const r = await trimStaleMemberships(f.client, C)
    expect(r).toMatchObject({ memberships: 2, superseded: 0, prunable: 0, removed: 0 })
    expect(f.reads).not.toContain('recommendations')
    expect(f.writes).toEqual([])
  })

  it('no membership at all: nothing else is read', async () => {
    const f = world({ memberships: [] })
    const r = await trimStaleMemberships(f.client, C)
    expect(r).toMatchObject({ memberships: 0, removed: 0, skipped: null })
    expect([...new Set(f.reads)]).toEqual(['subject_memberships'])
  })

  it('M4 not applied: skipped, not failed, and the prune counts no member', async () => {
    const f = world({ memberships: 'missing' })
    const r = await trimStaleMemberships(f.client, C)
    expect(r.skipped).toMatch(/subject_memberships is not there/)
    expect(trimFreezeHold(r)).toBeNull()
    expect(await countedMemberIds(f.client, C)).toEqual(new Set())
    const p = await pruneStaleAnalysis(f.client, C)
    expect(p.heldForSubjects).toBe(0)
    expect(p.insights).toBe(4)
  })

  it('fails closed: a citation read that fails throws before any membership is removed', async () => {
    const f = world({ drop: ['plan_check_evaluations'] })
    await expect(trimStaleMemberships(f.client, C)).rejects.toThrow(/plan_check_evaluations/)
    expect(f.writes).toEqual([])
  })
})

describe('pruneStaleAnalysis: never an insight a subject membership still counts', () => {
  it('without the trim, it holds the superseded members and prunes the rest', async () => {
    const f = world()
    const p = await pruneStaleAnalysis(f.client, C)
    // a and g are members (s1, s2): held. e (a judged NO) and f go.
    expect(ids(deleted(f, 'audience_insights'))).toEqual(['e', 'f'])
    expect(p).toEqual({ insights: 2, languageSamples: 1, keptInsights: 1, keptSamples: 0, heldForSubjects: 2 })
    // So every member the months read is still there after it.
    cascade(f)
    expect(ids(f.tables.subject_memberships.filter((m) => m.member), 'audience_insight_id')).toEqual(['a', 'b', 'c', 'd', 'g'])
  })

  it('the next run\'s trim releases them and its prune takes them', async () => {
    const f = world()
    await pruneStaleAnalysis(f.client, C)
    cascade(f)
    await trimStaleMemberships(f.client, C)
    const p = await pruneStaleAnalysis(f.client, C)
    expect(p.heldForSubjects).toBe(0)
    expect(ids(f.tables.audience_insights)).toEqual(['b', 'c', 'd'])
  })

  it('a membership read that fails (anything but M4 missing) deletes nothing', async () => {
    const f = world()
    // The one read answers a statement timeout; every other read is the fake's.
    const timeout = { data: null, error: { message: 'canceling statement due to statement timeout' } }
    const chain: Record<string, unknown> = {}
    for (const k of ['select', 'eq', 'order']) chain[k] = () => chain
    chain.range = async () => timeout
    const client = new Proxy(f.client, {
      get: (target, prop) => (prop === 'from'
        ? (t: string) => (t === 'subject_memberships' ? chain : target.from(t))
        : Reflect.get(target, prop)),
    })
    await expect(pruneStaleAnalysis(client, C)).rejects.toThrow(/statement timeout/)
    expect(f.writes).toEqual([])
  })
})

describe('trimFreezeHold', () => {
  it('holds the subject side only when the trim did not finish', () => {
    expect(trimFreezeHold(null)).toMatch(/^trim-stale-memberships did not finish/)
    expect(trimFreezeHold({ memberships: 0, membershipInsights: 0, superseded: 0, prunable: 0, removed: 0, removedMembers: 0, bySubject: {}, skipped: null, dryRun: false })).toBeNull()
  })
})
