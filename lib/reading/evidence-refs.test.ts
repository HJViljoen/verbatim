import { describe, it, expect } from 'vitest'
import {
  themeRefsToFacts, evidenceRefKey, quotableLine, resolveRefs, isMissingEvidenceRefs,
  freezeEvidenceRefs, TABLE_EVIDENCE_REFS,
  type EvidenceRefReading, type PointResolution,
} from './evidence-refs'

// ---- A fake Supabase: one rpc, one select chain, upsert and delete ----------

interface Store { [table: string]: Record<string, unknown>[] }

function fakeAdmin(store: Store, rpc: Record<string, unknown[]>, opts: { missing?: string[] } = {}) {
  const missing = new Set(opts.missing ?? [])
  const deletes: Record<string, unknown>[] = []
  const client = {
    deletes,
    rpc(name: string) {
      if (missing.has(name)) {
        const err = { code: 'PGRST202', message: `Could not find the function public.${name} in the schema cache` }
        const dead = { order: () => dead, range: async () => ({ data: null, error: err }) }
        return dead
      }
      const rows = rpc[name] ?? []
      const q = { order: () => q, range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }) }
      return q
    },
    from(table: string) {
      if (missing.has(table)) {
        const err = { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` }
        const dead = { select: () => dead, eq: () => dead, in: () => dead, order: () => dead, range: async () => ({ data: null, error: err }) }
        return { select: () => dead, upsert: async () => ({ error: err }), delete: () => dead }
      }
      let rows = [...(store[table] ?? [])]
      let cols: string[] = []
      const filters: [string, unknown][] = []
      const q = {
        select(c: string) { cols = c.split(',').map((x) => x.trim()); return q },
        eq(col: string, val: unknown) { filters.push([col, val]); rows = rows.filter((r) => r[col] === val); return q },
        in(col: string, vals: unknown[]) { rows = rows.filter((r) => vals.includes(r[col])); return q },
        order() { return q },
        async range(from: number, to: number) {
          return { data: rows.slice(from, to + 1).map((r) => Object.fromEntries(cols.map((c) => [c, r[c]]))), error: null }
        },
      }
      const del = {
        eq(col: string, val: unknown) { filters.push([col, val]); return del },
        then(res: (v: { error: null }) => void) {
          deletes.push(Object.fromEntries(filters))
          store[table] = (store[table] ?? []).filter((r) => !filters.every(([c, v]) => r[c] === v))
          res({ error: null })
        },
      }
      return {
        select: (c: string) => q.select(c),
        async upsert(newRows: Record<string, unknown>[]) {
          const t = (store[table] ??= [])
          for (const r of newRows) {
            const i = t.findIndex((x) => evidenceRefKey(x as never) === evidenceRefKey(r as never))
            if (i >= 0) t[i] = r; else t.push(r)
          }
          return { error: null }
        },
        delete: () => del,
      }
    },
  }
  return client as unknown as Parameters<typeof freezeEvidenceRefs>[0] & { deletes: typeof deletes }
}

const reading = (over: Partial<EvidenceRefReading> = {}): EvidenceRefReading => ({
  month: '2026-08-01',
  audience: 'client',
  theme_id: 't1',
  video_ids: ['v1', 'v2'],
  comment_ids: ['c1', 'c2', 'c3'],
  platform_mix: { youtube: 2 },
  ...over,
})

describe('themeRefsToFacts', () => {
  it('files a theme reading as a point about an object', () => {
    expect(themeRefsToFacts([reading()])[0]).toMatchObject({
      month: '2026-08-01', audience: 'client', object_kind: 'theme', object_id: 't1',
    })
  })

  it('dedups and sorts the ids, so two runs of one corpus write one row', () => {
    const f = themeRefsToFacts([reading({ video_ids: ['v2', 'v1', 'v2'], comment_ids: ['c2', 'c1'] })])[0]
    expect(f.video_ids).toEqual(['v1', 'v2'])
    expect(f.comment_ids).toEqual(['c1', 'c2'])
  })

  it('survives a row with no ids at all', () => {
    const f = themeRefsToFacts([{ ...reading(), video_ids: undefined as never, comment_ids: undefined as never, platform_mix: undefined as never }])[0]
    expect(f).toMatchObject({ video_ids: [], comment_ids: [], platform_mix: {} })
  })
})

describe('evidenceRefKey', () => {
  it('keys on all four columns, so two kinds of object in one audience-month do not collide', () => {
    const base = { month: '2026-08-01', audience: 'client' }
    expect(evidenceRefKey({ ...base, object_kind: 'theme', object_id: 'x' }))
      .not.toBe(evidenceRefKey({ ...base, object_kind: 'subject', object_id: 'x' }))
  })

  it('normalises the month, whatever shape it arrives in', () => {
    expect(evidenceRefKey({ month: '2026-08-14', audience: 'a', object_kind: 'theme', object_id: 't' }))
      .toBe(evidenceRefKey({ month: '2026-08-01', audience: 'a', object_kind: 'theme', object_id: 't' }))
  })
})

describe('quotableLine — what a reader is told about a decayed point', () => {
  const r = (over: Partial<PointResolution> = {}): PointResolution => ({
    videos: { total: 4, resolvable: 4 },
    unavailableVideos: 0,
    comments: { total: 31, resolvable: 31 },
    ...over,
  })

  it('says videos and voices while everything is there', () => {
    expect(quotableLine(r())).toBe('4 videos · 31 voices')
  })

  it('says "counted, not quotable" only when every voice is gone', () => {
    expect(quotableLine(r({ comments: { total: 31, resolvable: 0 } }))).toBe('4 videos · counted, not quotable')
  })

  it('gives the number that is left rather than the word "some"', () => {
    expect(quotableLine(r({ comments: { total: 31, resolvable: 8 } }))).toBe('4 videos · 8 of 31 voices still quotable')
  })

  it('names the videos the platform no longer serves', () => {
    expect(quotableLine(r({ unavailableVideos: 1 }))).toBe('4 videos (1 no longer on the platform) · 31 voices')
    expect(quotableLine(r({ unavailableVideos: 4 }))).toBe('4 videos (no longer on the platform) · 31 voices')
  })

  it('says the videos alone for a point that never cited a comment', () => {
    expect(quotableLine(r({ videos: { total: 1, resolvable: 1 }, comments: { total: 0, resolvable: 0 } }))).toBe('1 video')
  })

  it('prints no pipeline jargon and no score', () => {
    const lines = [r(), r({ comments: { total: 31, resolvable: 0 } }), r({ unavailableVideos: 2 })].map(quotableLine)
    for (const l of lines) expect(l).not.toMatch(/run|pass|cluster|theme_id|score|T\d/i)
  })
})

describe('resolveRefs', () => {
  const store: Store = {
    videos: [
      { id: 'v1', unavailable_at: null },
      { id: 'v2', unavailable_at: '2026-09-01T00:00:00Z' },
      // v3 was deleted by a re-gate — the one thing that empties the durable half.
    ],
    insight_evidence: [
      { id: 'e1', comment_id: 'c1', quote: 'still here', redacted: false },
      { id: 'e2', comment_id: 'c2', quote: '', redacted: false },
      { id: 'e3', comment_id: 'c4', quote: 'redacted', redacted: true },
    ],
  }

  it('counts what is left and tells a tombstone from a deletion', async () => {
    const out = await resolveRefs(fakeAdmin(store, {}) as never, {
      videoIds: ['v1', 'v2', 'v3'],
      commentIds: ['c1', 'c2', 'c3', 'c4'],
    })
    expect(out.videos).toEqual({ total: 3, resolvable: 2 })
    expect(out.unavailableVideos).toBe(1)
    // c1 quotable; c2 cited with no words; c3 pruned; c4 redacted.
    expect(out.comments).toEqual({ total: 4, resolvable: 1 })
  })

  it('says nothing about an empty point rather than dividing by zero', async () => {
    const out = await resolveRefs(fakeAdmin(store, {}) as never, { videoIds: [], commentIds: [] })
    expect(quotableLine(out)).toBe('0 videos')
  })
})

describe('isMissingEvidenceRefs', () => {
  it('is true only for this migration\'s own objects', () => {
    expect(isMissingEvidenceRefs({ code: 'PGRST205', message: `Could not find the table 'public.${TABLE_EVIDENCE_REFS}' in the schema cache` })).toBe(true)
    expect(isMissingEvidenceRefs({ code: 'PGRST202', message: 'Could not find the function public.monthly_evidence_refs in the schema cache' })).toBe(true)
    expect(isMissingEvidenceRefs({ code: 'PGRST205', message: "Could not find the table 'public.subjects' in the schema cache" })).toBe(false)
    expect(isMissingEvidenceRefs(new Error('statement timeout'))).toBe(false)
  })
})

describe('freezeEvidenceRefs', () => {
  const NOW = '2026-09-18T00:00:00Z'   // August is still filling (freezes 2026-10-01)
  const LATER = '2026-11-01T00:00:00Z' // August has closed

  it('writes a filling row while the month is open', async () => {
    const store: Store = {}
    const admin = fakeAdmin(store, { monthly_evidence_refs: [reading()] })
    const out = await freezeEvidenceRefs(admin, { clientId: 'cl', runId: 'run1', months: ['2026-08-01'], now: NOW })
    expect(out).toMatchObject({ written: 1, frozen: 0, videoIds: 2, commentIds: 3, missing: false })
    expect(store[TABLE_EVIDENCE_REFS][0]).toMatchObject({
      client_id: 'cl', object_kind: 'theme', object_id: 't1', status: 'filling', origin: 'live', run_id: 'run1',
    })
  })

  it('freezes the row once the line has passed, and never rewrites it after', async () => {
    const store: Store = {}
    const admin = fakeAdmin(store, { monthly_evidence_refs: [reading()] })
    await freezeEvidenceRefs(admin, { clientId: 'cl', runId: 'run1', months: ['2026-08-01'], now: LATER })
    expect(store[TABLE_EVIDENCE_REFS][0]).toMatchObject({ status: 'frozen', frozen_at: LATER })

    const again = await freezeEvidenceRefs(admin, { clientId: 'cl', runId: 'run2', months: ['2026-08-01'], now: LATER })
    expect(again.written).toBe(0)
    expect(again.keptFrozen).toBe(1)
    expect(store[TABLE_EVIDENCE_REFS][0]).toMatchObject({ run_id: 'run1' })
  })

  it('takes the FIRST back-read of an audience-month that closed before this table existed (decision K)', async () => {
    const store: Store = {}
    const admin = fakeAdmin(store, { monthly_evidence_refs: [reading()] })
    const out = await freezeEvidenceRefs(admin, {
      clientId: 'cl', runId: 'run1', months: ['2026-08-01'], now: LATER,
      closedAudienceMonths: ['2026-08-01|client'],
    })
    expect(out).toMatchObject({ written: 1, frozen: 1, refusedLate: 0 })
    expect(store[TABLE_EVIDENCE_REFS][0]).toMatchObject({ origin: 'back_read', status: 'frozen' })
  })

  it('refuses a theme the clustering has just minted for a month it has already read and closed', async () => {
    const store: Store = {}
    const seed = fakeAdmin(store, { monthly_evidence_refs: [reading()] })
    await freezeEvidenceRefs(seed, {
      clientId: 'cl', runId: 'run1', months: ['2026-08-01'], now: LATER,
      closedAudienceMonths: ['2026-08-01|client'],
    })
    const admin = fakeAdmin(store, { monthly_evidence_refs: [reading(), reading({ theme_id: 'brand-new' })] })
    const out = await freezeEvidenceRefs(admin, {
      clientId: 'cl', runId: 'run2', months: ['2026-08-01'], now: LATER,
      closedAudienceMonths: ['2026-08-01|client'],
    })
    expect(out.written).toBe(0)
    expect(out.refusedLate).toBe(1)
    expect(store[TABLE_EVIDENCE_REFS].map((r) => r.object_id)).toEqual(['t1'])
  })

  it('deletes a filling row the clustering no longer produces, and only a filling one', async () => {
    const store: Store = {}
    const admin = fakeAdmin(store, { monthly_evidence_refs: [reading(), reading({ theme_id: 't2' })] })
    await freezeEvidenceRefs(admin, { clientId: 'cl', runId: 'run1', months: ['2026-08-01'], now: NOW })
    expect(store[TABLE_EVIDENCE_REFS]).toHaveLength(2)

    const thinner = fakeAdmin(store, { monthly_evidence_refs: [reading()] })
    const out = await freezeEvidenceRefs(thinner, { clientId: 'cl', runId: 'run2', months: ['2026-08-01'], now: NOW })
    expect(out.deleted).toBe(1)
    expect(thinner.deletes[0]).toMatchObject({ object_kind: 'theme', object_id: 't2', status: 'filling' })
  })

  it('deletes nothing when the reading comes back empty — that is a failure, not a result', async () => {
    const store: Store = {}
    const admin = fakeAdmin(store, { monthly_evidence_refs: [reading()] })
    await freezeEvidenceRefs(admin, { clientId: 'cl', runId: 'run1', months: ['2026-08-01'], now: NOW })
    const empty = fakeAdmin(store, { monthly_evidence_refs: [] })
    const out = await freezeEvidenceRefs(empty, { clientId: 'cl', runId: 'run2', months: ['2026-08-01'], now: NOW })
    expect(out.deleted).toBe(0)
    expect(store[TABLE_EVIDENCE_REFS]).toHaveLength(1)
  })

  it('is a logged no-op with nothing read when the migration is not applied', async () => {
    const store: Store = {}
    const admin = fakeAdmin(store, {}, { missing: ['monthly_evidence_refs'] })
    const out = await freezeEvidenceRefs(admin, { clientId: 'cl', runId: 'run1', months: ['2026-08-01'], now: NOW })
    expect(out.missing).toBe(true)
    expect(out.written).toBe(0)
    expect(store[TABLE_EVIDENCE_REFS]).toBeUndefined()
  })

  it('writes nothing on a dry run', async () => {
    const store: Store = {}
    const admin = fakeAdmin(store, { monthly_evidence_refs: [reading()] })
    const out = await freezeEvidenceRefs(admin, { clientId: 'cl', runId: 'run1', months: ['2026-08-01'], now: NOW, dryRun: true })
    expect(out.written).toBe(1)
    expect(store[TABLE_EVIDENCE_REFS]).toBeUndefined()
  })
})
